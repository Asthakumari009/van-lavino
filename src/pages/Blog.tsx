import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, Search } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { BlogPost } from '../types';

type IndexPost = Pick<
  BlogPost,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'hero_image_url'
  | 'published_at'
  | 'is_featured'
  | 'is_published'
  | 'source'
  | 'created_at'
  | 'updated_at'
> & { hero_image_external_url?: string | null };

// Excerpt is short — estimate generously from the excerpt length to give
// readers a real reading-time number per card.
function readingMinutes(excerpt: string | null | undefined): number {
  if (!excerpt) return 3;
  const words = excerpt.split(/\s+/).filter(Boolean).length;
  const total = Math.max(words * 8, 250); // body is ~8× longer than excerpt
  return Math.max(2, Math.round(total / 220));
}

const ISSUE_LABEL = (() => {
  const d = new Date();
  return d
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    .toUpperCase();
})();

export default function Blog() {
  const [posts, setPosts] = useState<IndexPost[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('blog_posts')
        .select(
          'id, slug, title, excerpt, hero_image_url, hero_image_external_url, published_at, is_featured, is_published, source, created_at, updated_at'
        )
        .eq('is_published', true)
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(100);
      setPosts((data ?? []) as IndexPost[]);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!posts) return null;
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) =>
      [p.title, p.excerpt ?? ''].join(' ').toLowerCase().includes(q)
    );
  }, [posts, query]);

  const featured = filtered?.find((p) => p.is_featured) ?? filtered?.[0];
  const rest = filtered?.filter((p) => p.id !== featured?.id) ?? [];

  return (
    <div className="min-h-screen bg-obsidian text-cream overflow-x-hidden">
      <Navbar />

      <div className="relative pt-32 md:pt-36 pb-24 max-w-6xl mx-auto px-6 md:px-12">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.13),transparent_55%)] pointer-events-none" />

        {/* Magazine masthead */}
        <header className="text-center mb-14 md:mb-20">
          <div className="inline-flex items-center gap-3 mb-5">
            <span className="h-px w-12 bg-brand-500/50" />
            <span className="font-mono text-[11px] tracking-[0.5em] uppercase text-brand-500">
              The Journal
            </span>
            <span className="h-px w-12 bg-brand-500/50" />
          </div>
          <h1 className="font-display italic text-5xl md:text-7xl lg:text-[88px] text-cream leading-[1.02] mb-5 -tracking-[0.01em]">
            Stories from the Pass
          </h1>
          <div className="flex items-center justify-center gap-3 font-mono text-[10px] tracking-[0.4em] uppercase text-cream/70">
            <span>Issue · {ISSUE_LABEL}</span>
            <span className="text-brand-500/60">✦</span>
            <span>{posts?.length ?? '—'} posts</span>
          </div>
          <p className="font-display italic text-lg md:text-xl text-cream/60 max-w-2xl mx-auto leading-snug mt-7">
            Recipes, long-reads, behind-the-kitchen — every word, image and
            obsession from Van Lavino.
          </p>
        </header>

        {/* Search */}
        <div className="relative max-w-lg mx-auto mb-16">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-cream/60 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the journal…"
            className="w-full bg-obsidian-100/80 border border-brand-500/20 rounded-full pl-11 pr-4 py-3 text-sm text-cream placeholder:text-cream/45 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        {posts === null ? (
          <SkeletonGrid />
        ) : filtered && filtered.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <>
            {featured && <FeaturedHero post={featured} />}
            {rest.length > 0 && (
              <>
                <SectionDivider label="More from the journal" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 md:gap-y-16">
                  {rest.map((p) => (
                    <Card key={p.id} post={p} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Featured hero — magazine cover treatment
// ============================================================

function FeaturedHero({ post }: { post: IndexPost }) {
  const mins = readingMinutes(post.excerpt);
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group relative block rounded-3xl overflow-hidden border border-brand-500/15 mb-2 shadow-[0_50px_120px_-50px_rgba(10,7,5,0.6)] hover:shadow-[0_50px_120px_-40px_rgba(193,120,32,0.4)] transition-shadow duration-700"
    >
      <div className="relative aspect-[16/10] md:aspect-[16/8] overflow-hidden">
        {post.hero_image_url ? (
          <img
            src={post.hero_image_url}
            alt=""
            loading="eager"
            className="w-full h-full object-cover transition-transform duration-[2200ms] ease-out group-hover:scale-105"
          />
        ) : (
          <HeroPlaceholder />
        )}
        {/* gradient lift for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent" />
        {/* gold corner ornaments */}
        <span className="pointer-events-none absolute top-4 left-4 w-10 h-10 border-l border-t border-brand-500/70 rounded-tl-2xl" />
        <span className="pointer-events-none absolute bottom-4 right-4 w-10 h-10 border-r border-b border-brand-500/70 rounded-br-2xl" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 md:p-12">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="bg-brand-500 text-ink text-[9px] font-bold tracking-[0.3em] uppercase font-mono px-2.5 py-1 rounded-full">
            Featured
          </span>
          {post.published_at && (
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70">
              {new Date(post.published_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
        <h2 className="font-display italic text-3xl md:text-5xl lg:text-6xl text-cream leading-[1.05] mb-4 line-clamp-3 max-w-3xl group-hover:text-brand-500 transition-colors duration-500">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="text-cream/80 text-base md:text-lg leading-relaxed line-clamp-2 max-w-2xl mb-5">
            {post.excerpt}
          </p>
        )}
        <div className="flex items-center gap-4 text-cream/65">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase">
            <Clock size={11} className="text-brand-500" />
            {mins} min read
          </span>
          <span className="text-cream/70">·</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500 group-hover:gap-2.5 transition-all">
            Read article
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// Section divider — gold rule with centered ornament
// ============================================================

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-5 my-14 md:my-20" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-brand-500/40" />
      <span className="font-mono text-[11px] tracking-[0.4em] uppercase text-cream/75 inline-flex items-center gap-3">
        <span className="text-brand-500">✦</span>
        {label}
        <span className="text-brand-500">✦</span>
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-brand-500/40" />
    </div>
  );
}

// ============================================================
// Card — magazine-style for the grid
// ============================================================

function Card({ post }: { post: IndexPost }) {
  const mins = readingMinutes(post.excerpt);
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex flex-col"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-brand-500/10 group-hover:border-brand-500/40 transition-all duration-500 mb-5">
        {post.hero_image_url ? (
          <img
            src={post.hero_image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
          />
        ) : (
          <HeroPlaceholder />
        )}
        {/* hover gold tint */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-t from-brand-500/10 to-transparent" />
      </div>

      {post.published_at && (
        <p className="font-mono text-[10px] tracking-[0.35em] uppercase text-cream/65 mb-2">
          {new Date(post.published_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
          <span className="text-cream/25 mx-2">·</span>
          {mins} min read
        </p>
      )}

      <h3 className="font-display italic text-2xl text-cream leading-[1.15] mb-3 group-hover:text-brand-500 transition-colors duration-300">
        {post.title}
      </h3>

      {post.excerpt && (
        <p className="text-cream/65 text-sm leading-relaxed line-clamp-2 mb-3">
          {post.excerpt}
        </p>
      )}

      <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
        Read
        <ArrowRight
          size={11}
          className="transition-transform duration-300 group-hover:translate-x-1"
        />
      </span>
    </Link>
  );
}

// ============================================================
// Helpers
// ============================================================

function HeroPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-800/40 via-obsidian-50 to-obsidian-100">
      <BookOpen size={48} className="text-brand-500/40" />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <>
      <div className="aspect-[16/8] skeleton-sweep rounded-3xl mb-14" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <div className="aspect-[4/3] rounded-2xl skeleton-sweep" />
            <div className="h-3 w-32 rounded skeleton-sweep" />
            <div className="h-6 w-4/5 rounded skeleton-sweep" />
            <div className="h-3 w-full rounded skeleton-sweep" />
          </div>
        ))}
      </div>
    </>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="text-center py-20">
      <BookOpen size={56} className="text-brand-500/30 mx-auto mb-5" />
      <p className="font-display italic text-3xl text-cream mb-2">
        {query ? 'No matches' : 'The journal is empty'}
      </p>
      <p className="text-cream/60 text-sm max-w-md mx-auto">
        {query
          ? `Nothing matches "${query}". Try a different word.`
          : "New posts will appear here once they're published."}
      </p>
    </div>
  );
}
