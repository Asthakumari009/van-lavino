#!/usr/bin/env node
/**
 * Bulk-upload menu item photos from a local folder to Supabase Storage
 * and wire each `menu_items.image_url` to the uploaded file's public URL.
 *
 * Usage:
 *   npm run menu-images
 *
 * What it expects:
 *   - A `./menu-images/` folder in the repo root (git-ignored).
 *   - Files named after the *slugified* menu item name, e.g.:
 *       "Cappuccino"                 → cappuccino.jpg
 *       "Avocado Pesto Pizza"        → avocado-pesto-pizza.jpg
 *       "Chicken Club Sandwich"      → chicken-club-sandwich.jpg
 *   - Supported extensions: .jpg .jpeg .png .webp
 *
 * Environment (put in a .env.local or export in shell — do NOT commit):
 *   SUPABASE_URL                 = https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    = <service role key, from Dashboard → API>
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

// ---- config ----
const BUCKET = 'menu-images';
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGES_DIR = resolve(process.cwd(), 'menu-images');

// ---- tiny .env.local loader (avoids adding dotenv) ----
try {
  const envLocal = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envLocal.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* no .env.local — fine, expect real env */
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '\n✖  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      '   Put them in .env.local at the project root, or export in your shell.\n' +
      '   Service role key: Supabase Dashboard → Project Settings → API.\n'
  );
  process.exit(1);
}

// ---- helpers ----

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')     // drop punctuation
    .replace(/\s+/g, '-')              // whitespace → hyphen
    .replace(/-+/g, '-')               // collapse repeats
    .replace(/^-|-$/g, '');
}

function contentTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    default:      return 'image/jpeg';
  }
}

// ---- main ----

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  // 1. Try to list files in the staging folder. Missing/empty folder is OK
  //    on the first run — we'll print the expected filenames so the user
  //    knows what to drop in.
  let files = [];
  let folderMissing = false;
  try {
    files = readdirSync(IMAGES_DIR).filter((f) => {
      const p = join(IMAGES_DIR, f);
      return statSync(p).isFile() && ALLOWED_EXT.has(extname(f).toLowerCase());
    });
  } catch {
    folderMissing = true;
  }

  // 2. Load all menu items so we can both match by name AND tell the user
  //    which images are still missing.
  const { data: items, error: itemsErr } = await admin
    .from('menu_items')
    .select('id, name, image_url');
  if (itemsErr) {
    console.error('Failed to load menu_items:', itemsErr.message);
    process.exit(1);
  }

  // First-run friendly: nothing to upload, print the shopping list.
  if (folderMissing || files.length === 0) {
    console.log('\n📋  Menu items in your DB (first 200):');
    console.log('────────────────────────────────────────');
    items.slice(0, 200).forEach((it, i) => {
      const marker = it.image_url ? '  ✓' : '  •';
      console.log(
        `${marker} ${String(i + 1).padStart(3, ' ')}.  ${it.name}`.padEnd(60) +
          `→  ${slugify(it.name)}.jpg`
      );
    });
    console.log('────────────────────────────────────────');
    console.log(`Total items     : ${items.length}`);
    console.log(`With image set  : ${items.filter((it) => it.image_url).length}`);
    console.log(`Need an image   : ${items.filter((it) => !it.image_url).length}`);
    console.log('');
    if (folderMissing) {
      console.log(`📁  Create the folder:   ${IMAGES_DIR}`);
    } else {
      console.log(`📁  Folder is empty:     ${IMAGES_DIR}`);
    }
    console.log('🖼   Drop image files in there using the filenames above.');
    console.log('     Then re-run:  npm run menu-images\n');
    process.exit(0);
  }

  // Build slug → [items]. The same SKU name (e.g. "Burger Bun") can exist
  // once per branch — we want to wire image_url on every matching row so
  // the photo shows up on every branch's menu, not just one.
  const bySlug = new Map();
  for (const it of items) {
    const slug = slugify(it.name);
    const arr = bySlug.get(slug) ?? [];
    arr.push(it);
    bySlug.set(slug, arr);
  }

  console.log(`\n🍽  ${items.length} menu items in DB`);
  console.log(`📂  ${files.length} candidate image files in ${IMAGES_DIR}\n`);

  const report = { uploaded: 0, matched: 0, unmatched: [], failed: [] };

  // 3. For each file, match → upload → update every row that shares the slug
  for (const filename of files) {
    const ext = extname(filename).toLowerCase();
    const slug = slugify(filename.slice(0, filename.length - ext.length));
    const matches = bySlug.get(slug);

    if (!matches || matches.length === 0) {
      report.unmatched.push(filename);
      console.log(`✖  ${filename}  →  no menu item with slug "${slug}"`);
      continue;
    }

    try {
      const bytes = readFileSync(join(IMAGES_DIR, filename));
      const targetPath = `${slug}${ext}`;
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(targetPath, bytes, {
          upsert: true,
          cacheControl: '2592000',
          contentType: contentTypeFor(ext),
        });
      if (upErr) throw upErr;

      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(targetPath);
      const publicUrl = pub.publicUrl;

      const ids = matches.map((m) => m.id);
      const { error: updErr } = await admin
        .from('menu_items')
        .update({ image_url: publicUrl })
        .in('id', ids);
      if (updErr) throw updErr;

      report.uploaded += 1;
      report.matched += matches.length;
      const suffix = matches.length > 1 ? `  (×${matches.length} branches)` : '';
      console.log(`✓  ${filename}  →  ${matches[0].name}${suffix}`);
    } catch (err) {
      report.failed.push({ filename, msg: err.message ?? String(err) });
      console.log(`✖  ${filename}  →  ${err.message ?? err}`);
    }
  }

  // 4. Items still missing an image (after this run)
  const stillMissing = items.filter((it) => {
    const slug = slugify(it.name);
    const hasFileNow = files.some(
      (f) => slugify(f.slice(0, f.length - extname(f).length)) === slug
    );
    return !hasFileNow && !it.image_url;
  });

  console.log('\n── Summary ─────────────────────────────');
  console.log(`Uploaded       : ${report.uploaded}`);
  console.log(`Matched items  : ${report.matched}`);
  console.log(`Unmatched files: ${report.unmatched.length}`);
  console.log(`Failed         : ${report.failed.length}`);
  console.log(`Items still missing an image: ${stillMissing.length}`);
  if (stillMissing.length > 0) {
    console.log('\n  Items still without an image (drop more files for these):');
    for (const it of stillMissing) {
      console.log(`   • ${it.name}   →  expected ${slugify(it.name)}.jpg`);
    }
  }
  if (report.unmatched.length > 0) {
    console.log('\n  Files that did not match any item (rename or add the item):');
    for (const f of report.unmatched) console.log(`   • ${f}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n✖  Fatal:', err);
  process.exit(1);
});
