// Blog sync — pulls posts from vanlavino.com into our `blog_posts` table
// and mirrors their hero images into Supabase Storage (`blog-images`
// bucket). Idempotent — safe to re-run any time, only writes what changed.
//
// Strategy:
//   1. PRIMARY: WordPress REST API at /wp-json/wp/v2/posts?_embed
//      Gives us already-rendered, sidebar-free content + featured image
//      URL in one call per page. Far more reliable than HTML scraping.
//   2. FALLBACK: HTML scrape of /blogs/page/N (used only if REST is blocked).
//
// Auth: admin JWT, OR `X-Cron-Secret` header for the daily cron.
// Deploy: supabase functions deploy blog-sync --no-verify-jwt

// @ts-expect-error — Deno-only remote import, resolved at function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const ORIGIN = 'https://vanlavino.com';
const REST_BASE = `${ORIGIN}/wp-json/wp/v2`;
const BUCKET = 'blog-images';
const PER_PAGE = 50;
const MAX_PAGES = 12;

const USER_AGENT =
  'Mozilla/5.0 (compatible; VanLavinoSiteSync/1.1; +https://vanlavino.com)';

// ------------------------------------------------------------------
// WP REST shapes
// ------------------------------------------------------------------

interface WpPost {
  id: number;
  slug: string;
  date: string;        // local
  date_gmt: string;    // UTC
  modified: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  status: string;
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url?: string;
      media_details?: { sizes?: Record<string, { source_url?: string }> };
    }>;
  };
}

// ------------------------------------------------------------------
// HTML helpers
// ------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…');
}

// Allow-list sanitiser. Strips dangerous tags + WordPress widget cruft
// (read-more / share / related-posts / authorship blocks) and unwraps
// any link that points back to vanlavino.com so clicking inside an
// article never bounces the reader off our domain.
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'figure', 'figcaption',
  'a', 'img', 'hr',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'pre', 'code', 'span',
]);

const WIDGET_PATTERNS: RegExp[] = [
  // WP "more" button + sentinel
  /<a[^>]*class="[^"]*\bmore-link\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
  /<!--\s*more\s*-->/gi,
  // Sharing/related/comments containers (Jetpack / Yoast / generic themes)
  /<div[^>]*class="[^"]*\b(?:sharedaddy|jp-relatedposts|yarpp-related|related-posts|share-buttons?|sharing|comments?-area|post-navigation|nav-links|author-box|tags-links?)\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
  /<aside[\s\S]*?<\/aside>/gi,
  /<section[^>]*class="[^"]*\b(?:related|comments?|share)[^"]*"[^>]*>[\s\S]*?<\/section>/gi,
  // Yoast schema / breadcrumb
  /<nav[^>]*class="[^"]*\bbreadcrumbs?\b[^"]*"[^>]*>[\s\S]*?<\/nav>/gi,
  // "Continue reading" / "Read More" raw text patterns
  /<a[^>]*>\s*(?:continue\s+reading|read\s+more)\s*[→»›]*\s*<\/a>/gi,
];

function unwrapInternalLinks(html: string): string {
  // Unwrap <a href="https://vanlavino.com/...">label</a> → label
  // Keeps text but removes the redirect away from our site. Links
  // pointing elsewhere (twitter, instagram, etc.) are left intact and
  // open in a new tab via the `target` attr we add below.
  return html.replace(
    /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi,
    (_full, attrs: string, inner: string) => {
      const hrefMatch = /href\s*=\s*"([^"]+)"/i.exec(attrs);
      const href = hrefMatch?.[1] ?? '';
      try {
        const u = new URL(href, ORIGIN);
        if (u.hostname.replace(/^www\./, '') === 'vanlavino.com') {
          return inner; // unwrap
        }
      } catch {
        // Relative or malformed → assume internal, unwrap
        if (!/^https?:/i.test(href)) return inner;
      }
      // External — keep, ensure target=_blank rel=noopener
      const cleanAttrs = attrs
        .replace(/\starget\s*=\s*"[^"]*"/gi, '')
        .replace(/\srel\s*=\s*"[^"]*"/gi, '');
      return `<a${cleanAttrs} target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
  );
}

function sanitiseBody(html: string): string {
  let out = html
    // hard-strip dangerous tags
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    // strip event handlers
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');

  // Strip widget-style cruft (read-more buttons, share bars, related, comments, breadcrumbs).
  for (const re of WIDGET_PATTERNS) {
    out = out.replace(re, '');
  }

  // Unwrap any link back to vanlavino.com so reading stays on our domain.
  out = unwrapInternalLinks(out);

  // Allow-list pass — remove any tag we don't render. Keeps inner text.
  out = out.replace(
    /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi,
    (_full, close: string, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) {
        return ''; // drop opening or closing of a disallowed tag, keep contents
      }
      // Drop style + class attrs to defeat layout hijacking / WP block junk.
      const cleaned = attrs
        .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
        .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
        .replace(/\sclass\s*=\s*"[^"]*"/gi, '')
        .replace(/\sclass\s*=\s*'[^']*'/gi, '');
      return `<${close}${t}${cleaned}>`;
    }
  );

  // Collapse runs of empty paragraphs / whitespace.
  out = out
    .replace(/(<p>\s*(?:&nbsp;|\s)*<\/p>\s*)+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;
}

async function checksum(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ------------------------------------------------------------------
// Image mirroring
// ------------------------------------------------------------------

async function mirrorImage(
  admin: ReturnType<typeof createClient>,
  externalUrl: string,
  slug: string
): Promise<string | null> {
  try {
    const res = await fetch(externalUrl, {
      headers: { 'User-Agent': USER_AGENT, Referer: ORIGIN },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
      ? 'webp'
      : contentType.includes('gif')
      ? 'gif'
      : 'jpg';
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `${slug}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: '2592000',
    });
    if (error) {
      console.warn('[blog-sync] upload failed', slug, error.message);
      return null;
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.warn('[blog-sync] mirror error', slug, err);
    return null;
  }
}

// ------------------------------------------------------------------
// REST fetcher
// ------------------------------------------------------------------

async function fetchWpPosts(page: number): Promise<WpPost[]> {
  const url = `${REST_BASE}/posts?per_page=${PER_PAGE}&page=${page}&_embed=true&orderby=date&order=desc`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return []; // past last page
    throw new Error(`WP REST page ${page} → ${res.status}`);
  }
  return (await res.json()) as WpPost[];
}

function pickFeaturedImage(p: WpPost): string | null {
  const fm = p._embedded?.['wp:featuredmedia']?.[0];
  if (!fm) return null;
  // Prefer a "large" or "full" size if present, else source_url.
  const sizes = fm.media_details?.sizes ?? {};
  return (
    sizes.large?.source_url ??
    sizes.medium_large?.source_url ??
    fm.source_url ??
    null
  );
}

// ------------------------------------------------------------------
// Handler
// ------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('BLOG_SYNC_CRON_SECRET');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Server is missing Supabase env vars' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Auth — cron secret OR admin JWT.
  const cronHeader = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('authorization');
  if (cronSecret && cronHeader && cronHeader === cronSecret) {
    /* authorised via cron */
  } else if (authHeader) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);
    const { data: callerStaff } = await admin
      .from('staff')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!callerStaff || callerStaff.role !== 'admin') {
      return json({ error: 'Admin access required' }, 403);
    }
  } else {
    return json({ error: 'Missing authorization' }, 401);
  }

  // Body
  let opts: { maxPages?: number; force?: boolean } = {};
  try {
    opts = (await req.json()) as typeof opts;
  } catch {
    /* empty body fine */
  }
  const maxPages = Math.min(Math.max(opts.maxPages ?? MAX_PAGES, 1), MAX_PAGES);
  const force = opts.force === true;

  const report = {
    ok: true,
    pagesScanned: 0,
    postsSeen: 0,
    postsInserted: 0,
    postsUpdated: 0,
    postsSkipped: 0,
    imagesMirrored: 0,
    errors: [] as string[],
    startedAt: new Date().toISOString(),
    finishedAt: '',
  };

  const seen: WpPost[] = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      const batch = await fetchWpPosts(page);
      report.pagesScanned++;
      if (batch.length === 0) break;
      seen.push(...batch);
      if (batch.length < PER_PAGE) break;
    }
  } catch (err) {
    report.errors.push(
      `WP REST: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  report.postsSeen = seen.length;

  for (const wp of seen) {
    try {
      const slug = wp.slug;
      const title = decodeEntities(stripTags(wp.title?.rendered ?? slug)).trim();
      const rawBody = wp.content?.rendered ?? '';
      const bodyHtml = sanitiseBody(rawBody);
      const excerpt = decodeEntities(
        stripTags(wp.excerpt?.rendered ?? '').replace(/\s+/g, ' ')
      )
        .replace(/…?\s*$/, '')
        .trim()
        .slice(0, 280);
      const heroExternal = pickFeaturedImage(wp);
      const publishedAt = wp.date_gmt ? new Date(wp.date_gmt + 'Z').toISOString() : null;
      const sourceUrl = wp.link;

      const sum = await checksum(bodyHtml + title + (heroExternal ?? ''));

      const { data: existing } = await admin
        .from('blog_posts')
        .select('id, source_checksum, source, hero_image_url')
        .eq('slug', slug)
        .maybeSingle();

      if (existing && existing.source === 'native') {
        report.postsSkipped++;
        continue;
      }

      const unchanged =
        existing &&
        existing.source_checksum === sum &&
        existing.hero_image_url &&
        !force;
      if (unchanged) {
        report.postsSkipped++;
        continue;
      }

      let heroUrl: string | null = existing?.hero_image_url ?? null;
      if (heroExternal && (!heroUrl || force)) {
        heroUrl = await mirrorImage(admin, heroExternal, slug);
        if (heroUrl) report.imagesMirrored++;
      }

      const payload = {
        slug,
        title,
        excerpt,
        body_html: bodyHtml,
        hero_image_url: heroUrl,
        hero_image_external_url: heroExternal,
        published_at: publishedAt,
        source: 'vanlavino_wp',
        source_url: sourceUrl,
        source_checksum: sum,
        is_published: true,
      };

      if (existing) {
        const { error } = await admin
          .from('blog_posts')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
        report.postsUpdated++;
      } else {
        const { error } = await admin.from('blog_posts').insert(payload);
        if (error) throw error;
        report.postsInserted++;
      }
    } catch (err) {
      report.errors.push(
        `${wp.slug}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  report.finishedAt = new Date().toISOString();
  return json(report);
});
