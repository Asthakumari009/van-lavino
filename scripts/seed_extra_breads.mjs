#!/usr/bin/env node
/**
 * One-shot insert of additional bakery SKUs into every branch's
 * "Breads & Pastries" category. Idempotent: skips rows that already exist
 * (matched by branch_id + name).
 *
 * Run after extending scripts/seed_branches_breads.sql:
 *   node scripts/seed_extra_breads.mjs
 *
 * Re-running is safe.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

try {
  const envLocal = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envLocal.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env.local — fine */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✖  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Newly added SKUs — these correspond to image files already staged in
// menu-images/ that previously had no matching menu item.
const NEW_SKUS = [
  { name: 'Mini Burger',               desc: 'Mini slider buns, soft and golden — pack of 8',          price: 60,  veg: true },
  { name: 'Plain White Bread',         desc: 'Classic white sandwich loaf, soft crumb',                price: 70,  veg: true },
  { name: 'Pitta Bread',               desc: 'Middle Eastern flatbread, hand-stretched — pack of 6',   price: 80,  veg: true },
  { name: 'Garlic Bread',              desc: 'Buttered baguette slices with roasted garlic and herbs', price: 90,  veg: true },
  { name: 'Pizza Base',                desc: 'Hand-stretched pizza base, par-baked — pack of 2',       price: 100, veg: true },
  { name: 'White Multigrain Bread',    desc: 'White-flour multigrain loaf with oats and seeds',        price: 110, veg: true },
  { name: 'Soft Milk Bread',           desc: 'Japanese-style shokupan, pillowy and lightly sweet',     price: 130, veg: true },
  { name: 'Nutella Croissants',        desc: 'All-butter croissants filled with Nutella — pack of 4',  price: 150, veg: false },
  { name: 'Sun-dried Tomato Focaccia', desc: 'Focaccia studded with sun-dried tomatoes and olive oil', price: 220, veg: true },
];

const BRANCH_IDS = [
  'a1b2c3d4-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000003',
];

async function main() {
  // Look up "Breads & Pastries" category id per branch
  const { data: cats, error: catErr } = await admin
    .from('categories')
    .select('id, branch_id')
    .in('branch_id', BRANCH_IDS)
    .eq('name', 'Breads & Pastries');
  if (catErr) {
    console.error('✖  Failed to load categories:', catErr.message);
    process.exit(1);
  }
  if (!cats || cats.length === 0) {
    console.error('✖  No "Breads & Pastries" category found. Run seed_branches_breads.sql first.');
    process.exit(1);
  }
  const catByBranch = new Map(cats.map((c) => [c.branch_id, c.id]));

  // Existing items to dedupe against (branch_id + name)
  const { data: existing, error: existErr } = await admin
    .from('menu_items')
    .select('branch_id, name')
    .in('branch_id', BRANCH_IDS)
    .in('name', NEW_SKUS.map((s) => s.name));
  if (existErr) {
    console.error('✖  Failed to load existing menu_items:', existErr.message);
    process.exit(1);
  }
  const existingKey = new Set((existing ?? []).map((r) => `${r.branch_id}::${r.name}`));

  const rowsToInsert = [];
  for (const branchId of BRANCH_IDS) {
    const categoryId = catByBranch.get(branchId);
    if (!categoryId) continue;
    for (const s of NEW_SKUS) {
      const key = `${branchId}::${s.name}`;
      if (existingKey.has(key)) continue;
      rowsToInsert.push({
        branch_id: branchId,
        category_id: categoryId,
        name: s.name,
        description: s.desc,
        price: s.price,
        is_veg: s.veg,
        is_available: true,
        is_deliverable: true,
      });
    }
  }

  console.log(`Branches found    : ${cats.length}`);
  console.log(`SKUs to attempt   : ${NEW_SKUS.length}`);
  console.log(`Already present   : ${existingKey.size}`);
  console.log(`Will insert       : ${rowsToInsert.length}`);

  if (rowsToInsert.length === 0) {
    console.log('Nothing to insert. Done.');
    return;
  }

  const { error: insErr } = await admin.from('menu_items').insert(rowsToInsert);
  if (insErr) {
    console.error('✖  Insert failed:', insErr.message);
    process.exit(1);
  }
  console.log(`✓  Inserted ${rowsToInsert.length} rows.`);
}

main().catch((err) => {
  console.error('✖  Fatal:', err);
  process.exit(1);
});
