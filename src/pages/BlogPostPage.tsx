import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Calendar,
  Clock,
  Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { BlogPost } from '../types';

type Status = 'loading' | 'ready' | 'missing';
type AdjacentPost = Pick<
  BlogPost,
  'id' | 'slug' | 'title' | 'hero_image_url' | 'published_at'
>;

const WORDS_PER_MINUTE = 220;

function readingMinutes(html: string | null): number {
  if (!html) return 1;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 1;
  const words = text.split(' ').length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// Tracks how far down the article the reader has scrolled (0–1).
function useReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) return setProgress(1);
      setProgress(Math.min(1, Math.max(0, el.scrollTop / total)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return progress;
}

export default function BlogPostPage() {
  const { slug = '' } = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [adjacent, setAdjacent] = useState<{
    prev: AdjacentPost | null;
    next: AdjacentPost | null;
  }>({ prev: null, next: null });
  const [status, setStatus] = useState<Status>('loading');
  const progress = useReadingProgress();

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setPost(null);
    setAdjacent({ prev: null, next: null });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

    (async () => {
      const { data } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setStatus('missing');
        return;
      }
      const current = data as BlogPost;
      setPost(current);
      setStatus('ready');

      // Fire prev / next / related queries in parallel
      const cols =
        'id, slug, title, hero_image_url, published_at, excerpt, is_featured, is_published, source, source_url, source_checksum, hero_image_external_url, body_html, created_at, updated_at';

      const [olderRes, newerRes, relatedRes] = await Promise.all([
        supabase
          .from('blog_posts')
          .select('id, slug, title, hero_image_url, published_at')
          .eq('is_published', true)
          .lt('published_at', current.published_at ?? '9999-01-01')
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('blog_posts')
          .select('id, slug, title, hero_image_url, published_at')
          .eq('is_published', true)
          .gt('published_at', current.published_at ?? '0001-01-01')
          .order('published_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('blog_posts')
          .select(cols)
          .eq('is_published', true)
          .neq('id', current.id)
          .order('published_at', { ascending: false })
          .limit(3),
      ]);

      if (cancelled) return;
      setAdjacent({
        prev: (olderRes.data as AdjacentPost | null) ?? null,
        next: (newerRes.data as AdjacentPost | null) ?? null,
      });
      setRelated((relatedRes.data ?? []) as BlogPost[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const sanitised = useMemo(
    () =>
      post?.body_html
        ? DOMPurify.sanitize(post.body_html, {
            ALLOWED_TAGS: [
              'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
              'h2', 'h3', 'h4', 'h5', 'h6',
              'ul', 'ol', 'li',
              'blockquote', 'figure', 'figcaption',
              'a', 'img', 'hr',
              'table', 'thead', 'tbody', 'tr', 'td', 'th',
              'pre', 'code', 'span',
            ],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
          })
        : '',
    [post?.body_html]
  );

  const readMins = useMemo(() => readingMinutes(post?.body_html ?? null), [
    post?.body_html,
  ]);

  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: post?.title ?? 'Van Lavino' });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* user cancelled share */
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-cream overflow-x-hidden">
      {/* Reading progress bar — pinned to the very top, gold */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-brand-500/10"
      >
        <div
          className="h-full bg-gradient-to-r from-brand-500 via-brand-300 to-brand-500 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <Navbar />

      <article className="relative pt-28 md:pt-32 pb-12 md:pb-16">
        <div className="absolute inset-x-0 top-0 h-[480px] -z-10 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.15),transparent_70%)] pointer-events-none" />

        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] uppercase text-cream/75 hover:text-brand-500 mb-10 transition group"
          >
            <ArrowLeft
              size={13}
              className="transition-transform group-hover:-translate-x-1"
            />
            All posts
          </Link>

          {status === 'loading' && <SkeletonArticle />}

          {status === 'missing' && (
            <div className="text-center py-20">
              <BookOpen
                size={56}
                className="text-brand-500/30 mx-auto mb-5"
              />
              <p className="font-display italic text-4xl text-cream mb-2">
                Post not found
              </p>
              <p className="text-cream/60 text-sm mb-8">
                It may have been removed or the link is wrong.
              </p>
              <Link
                to="/blog"
                className="inline-block bg-brand-500 text-ink px-6 py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 transition"
              >
                Back to the journal
              </Link>
            </div>
          )}

          {status === 'ready' && post && (
            <ArticleHeader
              post={post}
              readMins={readMins}
              onShare={onShare}
            />
          )}
        </div>

        {status === 'ready' && post?.hero_image_url && (
          <HeroImage post={post} />
        )}

        {status === 'ready' && post && (
          <div className="max-w-3xl mx-auto px-6 md:px-8">
            <Ornament />

            {/* The article body, plus a floating right rail on desktop */}
            <div className="relative">
              <RightRail onShare={onShare} progress={progress} />

              <div
                className="prose-article animate-fadeRise"
                dangerouslySetInnerHTML={{ __html: sanitised }}
              />
            </div>

            {post.source === 'vanlavino_wp' && (
              <p className="mt-12 pt-6 border-t border-brand-500/10 font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65">
                Originally written for Van Lavino's journal.
              </p>
            )}
          </div>
        )}
      </article>

      {status === 'ready' && (adjacent.prev || adjacent.next) && (
        <PrevNextNav prev={adjacent.prev} next={adjacent.next} />
      )}

      {status === 'ready' && related.length > 0 && (
        <RelatedSpread posts={related} />
      )}
    </div>
  );
}

// ============================================================
// Article header — eyebrow, title, byline, share
// ============================================================

function ArticleHeader({
  post,
  readMins,
  onShare,
}: {
  post: BlogPost;
  readMins: number;
  onShare: () => void;
}) {
  const dateLabel = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';
  return (
    <header className="mb-10 md:mb-12">
      <div className="inline-flex items-center gap-2.5 mb-6">
        <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-brand-500">
          The Journal
        </span>
        <span className="text-brand-500/50 select-none">✦</span>
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70">
          {dateLabel}
        </span>
      </div>

      <h1 className="font-display italic text-[44px] md:text-[64px] lg:text-[72px] leading-[1.05] text-cream mb-7 -tracking-[0.01em]">
        {post.title}
      </h1>

      {post.excerpt && (
        <p className="font-display italic text-xl md:text-2xl text-cream/75 leading-snug max-w-2xl mb-8">
          {post.excerpt}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-y-4 gap-x-6 pt-6 border-t border-brand-500/15">
        <div className="flex items-center gap-5 text-cream/60">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] uppercase">
            <Calendar size={12} className="text-brand-500" />
            {dateLabel}
          </span>
          <span className="text-cream/70">·</span>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] uppercase">
            <Clock size={12} className="text-brand-500" />
            {readMins} min read
          </span>
        </div>
        <button
          onClick={onShare}
          className="inline-flex items-center gap-2 border border-brand-500/30 text-brand-500 px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.25em] font-mono hover:bg-brand-500 hover:text-ink transition"
        >
          <Share2 size={12} />
          Share
        </button>
      </div>
    </header>
  );
}

// ============================================================
// Hero image — wider than the article column with parallax/zoom
// ============================================================

function HeroImage({ post }: { post: BlogPost }) {
  return (
    <figure className="relative max-w-5xl mx-auto px-2 md:px-8 mb-10 md:mb-14">
      <div className="relative overflow-hidden rounded-3xl border border-brand-500/15 shadow-[0_50px_120px_-50px_rgba(10,7,5,0.55)]">
        <img
          src={post.hero_image_url ?? undefined}
          alt=""
          loading="eager"
          className="w-full aspect-[16/9] object-cover transition-transform duration-[2400ms] ease-out hover:scale-105"
        />
        {/* gold corner ornament */}
        <span className="pointer-events-none absolute top-3 left-3 w-8 h-8 border-l border-t border-brand-500/70 rounded-tl-2xl" />
        <span className="pointer-events-none absolute bottom-3 right-3 w-8 h-8 border-r border-b border-brand-500/70 rounded-br-2xl" />
        {/* subtle bottom fade */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-obsidian/40 to-transparent" />
      </div>
    </figure>
  );
}

// ============================================================
// Decorative ornament divider — sits between header and body
// ============================================================

function Ornament() {
  return (
    <div
      className="flex items-center justify-center gap-4 mb-10 select-none"
      aria-hidden
    >
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-brand-500/60" />
      <span className="text-brand-500 text-2xl leading-none">✦</span>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-brand-500/60" />
    </div>
  );
}

// ============================================================
// Floating right rail — share + back to top, desktop only
// ============================================================

function RightRail({
  onShare,
  progress,
}: {
  onShare: () => void;
  progress: number;
}) {
  return (
    <aside
      aria-hidden="false"
      className="hidden xl:flex flex-col gap-3 absolute -right-24 top-2"
      style={{ position: 'sticky', float: 'right', top: '7rem' }}
    >
      {/* progress dot */}
      <div className="w-10 h-10 rounded-full border border-brand-500/25 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-7 h-7 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="rgba(193,120,32,0.18)"
            strokeWidth="2"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#c17820"
            strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 15}`}
            strokeDashoffset={`${2 * Math.PI * 15 * (1 - progress)}`}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <button
        onClick={onShare}
        title="Share this post"
        className="w-10 h-10 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition"
      >
        <Share2 size={14} />
      </button>
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Back to top"
        className={`w-10 h-10 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition ${
          progress < 0.1 ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <ArrowUp size={14} />
      </button>
    </aside>
  );
}

// ============================================================
// Previous / Next post navigation
// ============================================================

function PrevNextNav({
  prev,
  next,
}: {
  prev: AdjacentPost | null;
  next: AdjacentPost | null;
}) {
  return (
    <nav className="max-w-5xl mx-auto px-6 md:px-8 mt-20">
      <div className="grid md:grid-cols-2 gap-4">
        {prev ? (
          <AdjacentLink post={prev} direction="prev" />
        ) : (
          <span aria-hidden />
        )}
        {next ? (
          <AdjacentLink post={next} direction="next" />
        ) : (
          <span aria-hidden />
        )}
      </div>
    </nav>
  );
}

function AdjacentLink({
  post,
  direction,
}: {
  post: AdjacentPost;
  direction: 'prev' | 'next';
}) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className={`group flex items-stretch gap-4 bg-obsidian-100 border border-brand-500/10 rounded-2xl p-4 hover:border-brand-500/40 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(193,120,32,0.35)] transition-all duration-500 ${
        direction === 'next' ? 'md:flex-row-reverse text-right' : ''
      }`}
    >
      <div className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 rounded-xl overflow-hidden bg-obsidian-50 border border-brand-500/10">
        {post.hero_image_url && (
          <img
            src={post.hero_image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
      </div>
      <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500 inline-flex items-center gap-1.5">
          {direction === 'prev' ? (
            <>
              <ArrowLeft size={11} />
              Older post
            </>
          ) : (
            <>
              Newer post
              <ArrowRight size={11} />
            </>
          )}
        </p>
        <p className="font-display italic text-base md:text-lg text-cream leading-snug line-clamp-2">
          {post.title}
        </p>
      </div>
    </Link>
  );
}

// ============================================================
// Related posts — magazine spread
// ============================================================

function RelatedSpread({ posts }: { posts: BlogPost[] }) {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 mt-20 md:mt-28 pb-24">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-brand-500 mb-3">
            ✦ Keep reading
          </p>
          <h2 className="font-display italic text-3xl md:text-5xl text-cream leading-tight">
            From the journal
          </h2>
        </div>
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.3em] uppercase text-brand-500 hover:gap-3 transition-all"
        >
          All posts
          <ArrowRight size={13} />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map((p) => (
          <Link
            key={p.id}
            to={`/blog/${p.slug}`}
            className="group flex flex-col bg-obsidian-100 border border-brand-500/10 rounded-3xl overflow-hidden hover:border-brand-500/40 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(193,120,32,0.35)] transition-all duration-500"
          >
            <div className="aspect-[16/10] overflow-hidden bg-obsidian-50">
              {p.hero_image_url && (
                <img
                  src={p.hero_image_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
                />
              )}
            </div>
            <div className="p-6">
              {p.published_at && (
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/65 mb-2">
                  {new Date(p.published_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              )}
              <h3 className="font-display italic text-xl md:text-2xl text-cream leading-snug line-clamp-3 group-hover:text-brand-500 transition-colors">
                {p.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Skeleton
// ============================================================

function SkeletonArticle() {
  return (
    <div className="space-y-6">
      <div className="h-3 w-32 rounded skeleton-sweep" />
      <div className="h-12 w-3/4 rounded skeleton-sweep" />
      <div className="h-6 w-2/3 rounded skeleton-sweep" />
      <div className="aspect-[16/9] rounded-3xl skeleton-sweep mt-8" />
      <div className="space-y-3 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded skeleton-sweep"
            style={{ width: `${70 + Math.random() * 25}%` }}
          />
        ))}
      </div>
    </div>
  );
}
