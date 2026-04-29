import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CreditCard,
  MapPin,
  Navigation,
  Phone,
  QrCode,
  Star,
  UtensilsCrossed,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { BlogPost, MenuItem, Review } from '../types';
function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.07 5.66 21.22 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.77l-.44 2.91h-2.33V22C18.34 21.22 22 17.07 22 12.06z" />
    </svg>
  );
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      } ${className}`}
    >
      {children}
    </div>
  );
}


// Tiny animated counter for the "orders served" chip. Counts up from 0 to
// `target` when it first mounts — gives the hero a quiet sense of life.
function useCountUp(target: number, duration = 1800) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function HeroVisual() {
  const served = useCountUp(248);

  return (
    <div className="relative aspect-[4/5] w-full max-w-[420px] mx-auto">
      {/* ambient gold wash behind the composition */}
      <div className="absolute -inset-10 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.28),transparent_65%)] pointer-events-none" />
      {/* faint outer ring */}
      <div
        className="absolute inset-[8%] rounded-[48px] opacity-60"
        style={{
          background:
            'conic-gradient(from 200deg, rgba(193,120,32,0.35), transparent 35%, rgba(226,176,102,0.3) 70%, transparent)',
          filter: 'blur(24px)',
        }}
      />

      {/* Central "live order" card — looks like a real product screen */}
      <article
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] bg-obsidian-100 border border-brand-500/25 rounded-[32px] p-5 md:p-6 shadow-[0_40px_100px_-30px_rgba(10,7,5,0.55)] backdrop-blur"
        aria-hidden
      >
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-70 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
            </span>
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-green-500">
              Live order · T04
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-cream/60">
            #VL·A93F
          </span>
        </header>

        <ul className="space-y-2.5 mb-5">
          {[
            { q: 2, n: 'Focaccia', p: 180 },
            { q: 1, n: 'Cappuccino', p: 220 },
            { q: 1, n: 'Margherita Pizza', p: 380 },
          ].map((row) => (
            <li
              key={row.n}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-brand-300 via-brand-500 to-brand-800" />
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-brand-500">
                    {row.q}×
                  </span>
                  <span className="text-cream truncate">{row.n}</span>
                </span>
              </span>
              <span className="font-display text-base text-brand-500 tabular-nums">
                ₹{row.p}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-brand-500/15 pt-4 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/65">
            Total
          </span>
          <span className="font-display italic text-2xl text-brand-500 tabular-nums">
            ₹1,000
          </span>
        </div>

        {/* mini "preparing" progress bar */}
        <div className="mt-4">
          <div className="flex justify-between font-mono text-[9px] tracking-wider uppercase text-cream/60 mb-1">
            <span>Preparing</span>
            <span className="text-brand-600">~ 6 min</span>
          </div>
          <div className="h-1 bg-obsidian-50 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full"
              style={{ width: '62%' }}
            />
          </div>
        </div>
      </article>

      {/* Floating proof chips */}
      <FloatChip
        pos="top-0 -left-2 md:-left-6"
        delay="0s"
        icon={<Star size={14} className="text-brand-500 fill-brand-500" />}
        title="4.9"
        subtitle="248 reviews"
      />
      <FloatChip
        pos="top-10 -right-2 md:-right-8"
        delay="2.2s"
        icon={
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-70 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
          </span>
        }
        title={`${served} served`}
        subtitle="today"
      />
      <FloatChip
        pos="bottom-14 -left-2 md:-left-10"
        delay="1s"
        icon={<MapPin size={14} className="text-brand-500" />}
        title="3 branches"
        subtitle="Hyderabad"
      />
      <FloatChip
        pos="bottom-2 right-4 md:-right-4"
        delay="3s"
        icon={<QrPulse />}
        title="Scan · Order"
        subtitle="no app needed"
      />
    </div>
  );
}

function FloatChip({
  pos,
  delay,
  icon,
  title,
  subtitle,
}: {
  pos: string;
  delay: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className={`absolute ${pos} bg-obsidian-50/95 backdrop-blur border border-brand-500/25 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 shadow-luxury float`}
      style={{ animationDelay: delay }}
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-obsidian-100 border border-brand-500/20 flex items-center justify-center">
        {icon}
      </span>
      <div className="leading-tight">
        <p className="font-display italic text-base text-cream whitespace-nowrap">
          {title}
        </p>
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-cream/70 whitespace-nowrap">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// Mini QR glyph — 3×3 gold dots, one pulses — more interesting than a static icon.
function QrPulse() {
  return (
    <span className="relative grid grid-cols-3 gap-0.5 w-[14px] h-[14px]">
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] h-[3px] rounded-[1px] ${
            [0, 2, 4, 6, 8].includes(i) ? 'bg-brand-500' : 'bg-brand-500/40'
          } ${i === 4 ? 'animate-pulse' : ''}`}
        />
      ))}
    </span>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-28 pb-20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.4),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(226,176,102,0.12),transparent_50%)]" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-12 w-full grid lg:grid-cols-[3fr_2fr] gap-16 items-center">
        <Reveal>
          <p className="font-mono text-xs text-brand-500 tracking-[0.4em] mb-8">
            EST. IN HYDERABAD
          </p>
          <h1 className="font-display font-light italic text-5xl md:text-7xl lg:text-[96px] leading-[1.05] text-cream mb-8">
            Where Every Crumb <br className="hidden md:block" />
            Tells a <span className="gold-shimmer">Story</span>
          </h1>
          <p className="font-body text-base md:text-lg text-cream/70 max-w-xl mb-10 leading-relaxed">
            Artisan breads, pastries &amp; café crafted with love — now scan,
            order &amp; savour at your table.
          </p>
          <div className="flex flex-wrap gap-4 mb-10">
            <Link
              to="/menu"
              className="bg-brand-500 text-ink px-8 py-4 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300"
            >
              Explore Our Menu →
            </Link>
            <Link
              to="/reserve"
              className="border border-brand-500 text-brand-500 px-8 py-4 rounded-full font-medium hover:bg-brand-500 hover:text-ink transition-all duration-300"
            >
              Reserve a Table
            </Link>
          </div>
          <div className="inline-flex items-center gap-3 bg-brand-500/10 border border-brand-500/20 text-brand-600 px-5 py-2 rounded-full text-xs md:text-sm">
            🧾 Scan QR · Order Instantly · Pay Seamlessly
          </div>
        </Reveal>
        <Reveal delay={200}>
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

function Marquee() {
  const items = [
    'ARTISAN BREADS',
    'BAGELS',
    'FOCACCIA',
    'BURGER BUNS',
    'PAV BUNS',
    'MULTIGRAIN',
    'BROWN BREAD',
    'CAFÉ EXPERIENCE',
  ];
  const track = [...items, ...items, ...items, ...items];
  return (
    <div className="overflow-hidden bg-brand-500/5 border-y border-brand-500/10 py-6">
      <div className="marquee-track gap-12 pr-12">
        {track.map((t, i) => (
          <span
            key={i}
            className="font-mono text-brand-500 text-sm uppercase tracking-[0.3em] whitespace-nowrap"
          >
            {t} ·
          </span>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const steps = [
    {
      Icon: QrCode,
      eyebrow: 'Step One',
      title: 'Scan Your Table',
      desc: 'Each table holds a unique QR code. A single tap opens your menu — personalised, instant, no app to download.',
    },
    {
      Icon: UtensilsCrossed,
      eyebrow: 'Step Two',
      title: 'Curate Your Order',
      desc: 'Browse the artisan range, leave a note for the kitchen, build your feast at your own pace.',
    },
    {
      Icon: CreditCard,
      eyebrow: 'Step Three',
      title: 'Pay & Be Served',
      desc: 'Settle through UPI, card or wallet. Your order glides to the kitchen the moment you press send.',
    },
  ];
  return (
    <section
      id="about"
      className="relative py-24 md:py-32 px-6 lg:px-12 max-w-7xl mx-auto"
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.08),transparent_60%)] pointer-events-none" />

      <Reveal className="text-center mb-16 md:mb-20">
        <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
          Scan · Order · Savour
        </p>
        <h2 className="font-display italic text-4xl md:text-5xl lg:text-[56px] text-cream">
          Dine Different
        </h2>
        <div className="flex items-center justify-center gap-3 mt-6" aria-hidden>
          <span className="h-px w-12 bg-brand-500/40" />
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
          <span className="h-px w-12 bg-brand-500/40" />
        </div>
      </Reveal>

      <div className="relative grid md:grid-cols-3 gap-12 md:gap-6">
        {/* Hairline gold thread connecting the three nodes (desktop only).
            Sits behind the icon discs and reads as a continuous timeline. */}
        <div
          aria-hidden
          className="hidden md:block absolute top-[88px] left-[16.66%] right-[16.66%] h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(193,120,32,0.4) 18%, rgba(193,120,32,0.4) 82%, transparent)',
          }}
        />

        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 180}>
            <article className="group relative flex flex-col items-center text-center">
              <p className="font-display italic text-5xl md:text-6xl text-brand-500/25 leading-none mb-4 tabular-nums">
                0{i + 1}
              </p>

              <div className="relative w-20 h-20 mb-7">
                {/* faint outer halo lights up on hover */}
                <span className="absolute inset-[-10px] rounded-full border border-brand-500/0 group-hover:border-brand-500/20 transition-all duration-500" />
                <span className="absolute inset-0 rounded-full bg-obsidian-100 border border-brand-500/40 flex items-center justify-center transition-all duration-500 group-hover:border-brand-500 group-hover:shadow-[0_0_40px_rgba(193,120,32,0.5)] group-hover:-translate-y-1">
                  <s.Icon size={26} strokeWidth={1.4} className="text-brand-500" />
                </span>
              </div>

              <p className="font-mono text-[10px] text-brand-500/70 tracking-[0.4em] uppercase mb-3">
                {s.eyebrow}
              </p>
              <h3 className="font-display italic text-2xl md:text-[28px] text-cream mb-4 leading-tight">
                {s.title}
              </h3>
              <span
                aria-hidden
                className="block h-px w-10 bg-brand-500/50 mb-5 transition-all duration-500 group-hover:w-20 group-hover:bg-brand-500"
              />
              <p className="font-body text-cream/65 leading-relaxed text-sm max-w-xs">
                {s.desc}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

type ShowcaseItem = Pick<
  MenuItem,
  'id' | 'name' | 'description' | 'image_url'
> & { categoryName: string | null };

function Showcase() {
  const [items, setItems] = useState<ShowcaseItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The landing showcase is the public face of the bakery delivery
      // channel — we render exactly the items that are deliverable
      // (admin-controlled flag) and currently available.
      const { data } = await supabase
        .from('menu_items')
        .select('id, name, description, image_url, created_at, categories(name)')
        .eq('is_available', true)
        .eq('is_deliverable', true)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      // Across-branch dedupe by lowercased item name — first occurrence wins.
      // The same bread exists in multiple branches; the showcase only needs
      // one card per unique product.
      const seen = new Set<string>();
      const unique: ShowcaseItem[] = [];
      for (const row of (data ?? []) as Array<{
        id: string;
        name: string;
        description: string | null;
        image_url: string | null;
        categories: { name: string } | { name: string }[] | null;
      }>) {
        const key = row.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const cat = Array.isArray(row.categories)
          ? row.categories[0]?.name ?? null
          : row.categories?.name ?? null;
        unique.push({
          id: row.id,
          name: row.name,
          description: row.description,
          image_url: row.image_url,
          categoryName: cat,
        });
      }
      setItems(unique.slice(0, 10));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide entirely if data loaded with zero matches — better than rendering
  // an empty rail. (Loading state still renders skeletons.)
  if (items !== null && items.length === 0) return null;

  return (
    <section id="gallery" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-end justify-between mb-12 md:mb-16 gap-6">
        <Reveal>
          <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
            From Our Bakery · Order for Pickup or Delivery
          </p>
          <h2 className="font-display italic text-4xl md:text-5xl lg:text-[64px] text-cream leading-tight">
            Baked with Soul
          </h2>
        </Reveal>
        <Link
          to="/order"
          className="hidden md:inline-flex items-center gap-2 text-brand-500 hover:text-brand-600 text-xs tracking-[0.3em] uppercase font-mono whitespace-nowrap transition-colors"
        >
          Order Online
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="overflow-x-auto scrollbar-hide pb-6">
        <div className="flex gap-6 px-6 lg:px-12 min-w-max">
          {items === null
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-72 bg-obsidian-100 rounded-2xl p-6 border border-brand-500/10"
                >
                  <div className="aspect-square rounded-xl mb-6 skeleton-sweep" />
                  <div className="h-3 w-20 rounded skeleton-sweep mb-3" />
                  <div className="h-6 w-3/4 rounded skeleton-sweep mb-2" />
                  <div className="h-3 w-full rounded skeleton-sweep" />
                </div>
              ))
            : items.map((p, i) => (
                <Reveal key={p.id} delay={i * 80}>
                  <Link
                    to="/order"
                    className="block w-72 bg-obsidian-100 rounded-2xl p-6 border border-brand-500/10 hover:border-brand-500/40 hover:shadow-luxury transition-all duration-500 group"
                  >
                    <div className="relative aspect-square rounded-xl mb-6 overflow-hidden bg-gradient-to-br from-brand-400/20 via-brand-700/20 to-obsidian">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center font-display italic text-7xl text-brand-500/35 select-none">
                          {p.name.charAt(0)}
                        </span>
                      )}
                      <span className="absolute inset-0 ring-1 ring-inset ring-brand-500/15 rounded-xl pointer-events-none" />
                    </div>
                    {p.categoryName && (
                      <span className="inline-block bg-brand-500/15 text-brand-600 text-[10px] uppercase tracking-[0.25em] px-3 py-1 rounded-full mb-3 font-mono">
                        {p.categoryName}
                      </span>
                    )}
                    <h3 className="font-display italic text-2xl text-cream mb-2 leading-tight">
                      {p.name}
                    </h3>
                    {p.description && (
                      <p className="text-cream/75 text-sm leading-relaxed line-clamp-2 mb-4">
                        {p.description}
                      </p>
                    )}
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500/80 group-hover:text-brand-600 group-hover:gap-2.5 transition-all">
                      Order online
                      <ArrowRight size={12} />
                    </span>
                  </Link>
                </Reveal>
              ))}
          {items !== null && (
            <div className="w-72 flex items-center justify-center">
              <Link
                to="/order"
                className="group inline-flex flex-col items-center gap-3 text-brand-500 hover:text-brand-600 text-xs tracking-[0.3em] uppercase font-mono text-center transition-colors"
              >
                <span className="w-12 h-12 rounded-full border border-brand-500/40 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-ink group-hover:border-brand-500 transition-all">
                  <ArrowRight size={16} />
                </span>
                Order
                <br />
                Online
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Branches section — three physical locations in Hyderabad
// ----------------------------------------------------------------

interface BranchInfo {
  name: string;
  locality: string;
  phone: string;
  hours: string;
  mapsQuery: string;
}

const BRANCHES: BranchInfo[] = [
  {
    name: 'Jubilee Hills',
    locality: 'Hyderabad · Road No. 36 area',
    phone: '9381789995',
    hours: '9 AM – 11 PM',
    mapsQuery: 'Van Lavino Jubilee Hills Hyderabad',
  },
  {
    name: 'Financial District',
    locality: 'Hyderabad · Nanakramguda',
    phone: '9124043434',
    hours: '9 AM – 11 PM',
    mapsQuery: 'Van Lavino Financial District Hyderabad',
  },
  {
    name: 'Nalagandla',
    locality: 'Hyderabad · Lingampally area',
    phone: '9124045454',
    hours: '9 AM – 11 PM',
    mapsQuery: 'Van Lavino Nalagandla Hyderabad',
  },
];

function formatIndianPhone(p: string) {
  return `+91 ${p.slice(0, 5)} ${p.slice(5)}`;
}

function Branches() {
  return (
    <section
      id="branches"
      className="relative py-24 md:py-32 px-6 lg:px-12 max-w-7xl mx-auto"
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.06),transparent_60%)] pointer-events-none" />

      <Reveal className="text-center mb-14 md:mb-20">
        <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
          Find Us In Hyderabad
        </p>
        <h2 className="font-display italic text-4xl md:text-5xl lg:text-[56px] text-cream">
          Three Homes, One Table
        </h2>
        <p className="font-body text-cream/60 mt-5 max-w-xl mx-auto">
          Each branch is crafted to feel familiar the moment you walk in.
          Pick the one nearest you and drop in — no reservation required.
        </p>
      </Reveal>

      <div className="grid md:grid-cols-3 gap-6">
        {BRANCHES.map((b, i) => (
          <Reveal key={b.name} delay={i * 120}>
            <article className="group relative bg-obsidian-100 border border-brand-500/10 rounded-3xl p-8 h-full flex flex-col transition-all duration-500 hover:border-brand-500/40 hover:shadow-[0_25px_60px_-25px_rgba(193,120,32,0.45)] hover:-translate-y-1">
              <div className="inline-flex items-center gap-2 mb-6">
                <MapPin size={18} className="text-brand-500" />
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
                  Branch 0{i + 1}
                </span>
              </div>

              <h3 className="font-display text-3xl md:text-[34px] italic text-cream leading-tight mb-2">
                {b.name}
              </h3>
              <p className="text-cream/60 text-sm mb-6">{b.locality}</p>

              <dl className="space-y-3 mb-8 text-sm">
                <div className="flex items-center gap-3">
                  <Phone size={14} className="text-brand-500/70 flex-shrink-0" />
                  <a
                    href={`tel:+91${b.phone}`}
                    className="font-mono tracking-wider text-cream/80 hover:text-brand-500 transition"
                  >
                    {formatIndianPhone(b.phone)}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3.5 h-3.5 rounded-full border border-brand-500/70 flex items-center justify-center flex-shrink-0">
                    <span className="w-1 h-1 rounded-full bg-brand-500" />
                  </span>
                  <span className="font-mono tracking-wider text-cream/80">
                    {b.hours}
                  </span>
                </div>
              </dl>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.mapsQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center justify-center gap-2 border border-brand-500/40 text-brand-500 px-5 py-3 rounded-full text-xs uppercase tracking-[0.25em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
              >
                <Navigation size={13} />
                Get Directions
              </a>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Testimonials — 3-up carousel with typewriter animation on new
// ----------------------------------------------------------------

// Seed quotes — shown only while Supabase has zero published reviews so the
// section never looks empty during cold-start. Once real reviews land they
// replace these entirely.
const FALLBACK_QUOTES: Array<Pick<Review, 'body' | 'customer_name' | 'rating' | 'created_at' | 'id'>> = [
  {
    id: 'seed-1',
    rating: 5,
    body: 'The focaccia here is unlike anything in Hyderabad. Warm, herby, perfect.',
    customer_name: 'Arjun M.',
    created_at: '',
  },
  {
    id: 'seed-2',
    rating: 5,
    body: 'Ordered via QR from my table. Food arrived in minutes. This is how cafés should work.',
    customer_name: 'Priya K.',
    created_at: '',
  },
  {
    id: 'seed-3',
    rating: 5,
    body: 'Their multigrain bread has become part of my weekly ritual.',
    customer_name: 'Ravi S.',
    created_at: '',
  },
];

type QuoteLike = Pick<Review, 'id' | 'rating' | 'body' | 'customer_name' | 'created_at'>;

// Typewriter hook — incrementally reveals `text` char-by-char at `speedMs`
// when `enabled` is true. When disabled, returns the full string
// instantly. Used to animate freshly-arrived realtime reviews.
function useTypewriter(text: string, enabled: boolean, speedMs = 22) {
  const [cursor, setCursor] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setCursor(text.length);
      return;
    }
    setCursor(0);
    let c = 0;
    const id = setInterval(() => {
      c += 1;
      setCursor(c);
      if (c >= text.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text, enabled, speedMs]);
  return {
    displayed: text.slice(0, cursor),
    isTyping: enabled && cursor < text.length,
  };
}

// Renders a single quote body, typewriter-animated when `typing` is true.
function QuoteBody({ body, typing }: { body: string; typing: boolean }) {
  const { displayed, isTyping } = useTypewriter(body, typing);
  return (
    <p className="font-display italic text-lg md:text-xl text-cream/90 leading-relaxed mb-6 line-clamp-5">
      {displayed}
      {isTyping && (
        <span
          className="inline-block w-[2px] h-5 ml-0.5 align-middle bg-brand-500 animate-pulse"
          aria-hidden
        />
      )}
    </p>
  );
}

// ----------------------------------------------------------------
// Journal strip — 3 newest blog posts on the landing page. Clicks
// stay on our domain and open /blog/:slug.
// ----------------------------------------------------------------

function JournalStrip() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);

  // Centralised fetch so the initial load and the realtime refresh share
  // the same query shape. Same projection as before — no body_html on the
  // landing strip.
  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from('blog_posts')
      .select(
        'id, slug, title, excerpt, hero_image_url, published_at, is_featured, is_published, source, created_at, updated_at'
      )
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(3);
    setPosts((data ?? []) as BlogPost[]);
  }, []);

  useEffect(() => {
    void fetchLatest();
  }, [fetchLatest]);

  // Realtime: when an admin publishes (INSERT) or edits (UPDATE) a post,
  // re-fetch the top 3. Subscribing to all events on blog_posts is cheaper
  // than guessing which row should appear — the query handles ordering.
  useEffect(() => {
    const channel = supabase
      .channel('blog-posts-landing')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blog_posts' },
        () => {
          void fetchLatest();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLatest]);

  // If the journal is empty (before first sync), hide the section rather
  // than render awkwardly. Admin still has /blog available directly.
  if (posts !== null && posts.length === 0) return null;

  return (
    <section className="relative py-24 md:py-32 px-6 lg:px-12 max-w-7xl mx-auto">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.07),transparent_60%)] pointer-events-none" />

      <Reveal className="flex items-end justify-between flex-wrap gap-6 mb-12">
        <div>
          <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-3 inline-flex items-center gap-2">
            <BookOpen size={12} />
            The Journal
          </p>
          <h2 className="font-display italic text-4xl md:text-5xl text-cream leading-tight">
            Fresh from the Pass
          </h2>
        </div>
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.25em] uppercase text-brand-500 hover:gap-3 transition-all"
        >
          View all posts
          <ArrowRight size={14} />
        </Link>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts === null
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-obsidian-100 border border-brand-500/10 rounded-3xl overflow-hidden"
              >
                <div className="aspect-[16/10] skeleton-sweep" />
                <div className="p-6 space-y-3">
                  <div className="h-3 w-24 rounded skeleton-sweep" />
                  <div className="h-5 w-4/5 rounded skeleton-sweep" />
                  <div className="h-3 w-full rounded skeleton-sweep" />
                </div>
              </div>
            ))
          : posts.map((p, i) => (
              <Reveal key={p.id} delay={i * 120}>
                <Link
                  to={`/blog/${p.slug}`}
                  className="group flex flex-col h-full bg-obsidian-100 border border-brand-500/10 rounded-3xl overflow-hidden hover:border-brand-500/40 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(193,120,32,0.35)] transition-all duration-500"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {p.hero_image_url ? (
                      <img
                        src={p.hero_image_url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-800/50 via-obsidian-50 to-obsidian-100">
                        <BookOpen size={40} className="text-brand-500/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    {p.published_at && (
                      <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70">
                        {new Date(p.published_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                    <h3 className="font-display italic text-xl text-cream leading-snug mt-2 mb-3 line-clamp-3">
                      {p.title}
                    </h3>
                    {p.excerpt && (
                      <p className="text-cream/65 text-sm leading-relaxed line-clamp-2 mb-4">
                        {p.excerpt}
                      </p>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] uppercase text-brand-500 group-hover:gap-2.5 transition-all">
                      Read
                      <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
      </div>
    </section>
  );
}

function Testimonials() {
  const [reviews, setReviews] = useState<QuoteLike[] | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [typingId, setTypingId] = useState<string | null>(null);
  const paused = useRef(false);

  // Initial fetch + realtime subscription so new reviews stream in live.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('reviews')
        .select('id, rating, body, customer_name, created_at')
        .eq('is_published', true)
        .gte('rating', 4)
        .not('body', 'is', null)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12);
      if (cancelled) return;
      setReviews((data as QuoteLike[] | null) ?? []);
    })();

    const channel = supabase
      .channel('reviews-landing')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reviews' },
        (payload) => {
          const r = payload.new as Review;
          if (!r.is_published || r.rating < 4 || !r.body) return;
          setReviews((prev) => {
            const next: QuoteLike[] = [
              {
                id: r.id,
                rating: r.rating,
                body: r.body,
                customer_name: r.customer_name,
                created_at: r.created_at,
              },
              ...(prev ?? []),
            ].slice(0, 12);
            return next;
          });
          setStartIndex(0);
          // Trigger the typewriter animation for the freshly-arrived review.
          setTypingId(r.id);
          // Remove the typing flag after the animation comfortably finishes
          // (body length × speedMs + buffer). Worst case ~10s.
          const body = r.body ?? '';
          setTimeout(() => setTypingId(null), body.length * 22 + 1500);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const quotes = useMemo<QuoteLike[]>(() => {
    if (reviews && reviews.length > 0) return reviews;
    if (reviews === null) return []; // loading — render skeletons
    return FALLBACK_QUOTES;
  }, [reviews]);

  // Auto-rotate every 6s on desktop, sliding the window by 1 each tick.
  useEffect(() => {
    if (quotes.length <= 3) return;
    const id = setInterval(() => {
      if (paused.current) return;
      setStartIndex((i) => (i + 1) % quotes.length);
    }, 6000);
    return () => clearInterval(id);
  }, [quotes.length]);

  const loading = reviews === null;

  // Build the three visible quotes via wrap-around window. When there are
  // fewer than 3 reviews total, we simply render what we have.
  const visible = useMemo(() => {
    if (quotes.length === 0) return [];
    const out: Array<{ q: QuoteLike; slot: number }> = [];
    for (let i = 0; i < Math.min(3, quotes.length); i++) {
      out.push({ q: quotes[(startIndex + i) % quotes.length], slot: i });
    }
    return out;
  }, [quotes, startIndex]);

  return (
    <section className="relative py-24 md:py-32 px-6 lg:px-12 max-w-7xl mx-auto">
      {/* Ambient gold glow behind the carousel to feel "spotlit" */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.08),transparent_60%)] pointer-events-none" />

      <Reveal className="text-center mb-14">
        <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
          Whispers from the Table
        </p>
        <h2 className="font-display italic text-4xl md:text-5xl text-cream">
          What They&apos;re Saying
        </h2>
      </Reveal>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-64 bg-obsidian-100 rounded-3xl border border-brand-500/10 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div
          className="relative"
          onMouseEnter={() => {
            paused.current = true;
          }}
          onMouseLeave={() => {
            paused.current = false;
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {visible.map(({ q, slot }) => {
              const isTyping = typingId === q.id;
              return (
                <article
                  // `startIndex-slot-id` key — changing on rotation remounts
                  // the card, which re-runs the fade/lift transition and
                  // makes the shuffle feel elegant instead of abrupt.
                  key={`${startIndex}-${slot}-${q.id}`}
                  className={`relative bg-obsidian-100 border rounded-3xl p-8 h-full transition-all duration-700 ease-[cubic-bezier(0.25,0.9,0.3,1)] animate-fadeRise ${
                    isTyping
                      ? 'border-brand-500/70 shadow-[0_0_0_1px_rgba(193,120,32,0.3),0_20px_60px_-25px_rgba(193,120,32,0.55)]'
                      : 'border-brand-500/10'
                  }`}
                  style={{ animationDelay: `${slot * 120}ms` }}
                >
                  {/* "NEW" ribbon while typewriter is running */}
                  {isTyping && (
                    <span className="absolute -top-2 -right-2 bg-brand-500 text-ink text-[9px] font-bold tracking-[0.2em] uppercase font-mono px-2 py-1 rounded-full shadow-[0_4px_14px_rgba(193,120,32,0.55)]">
                      Just in
                    </span>
                  )}
                  <div className="flex items-center gap-1 mb-5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star
                        key={s}
                        size={14}
                        className={
                          s < q.rating
                            ? 'text-brand-500 fill-brand-500'
                            : 'text-cream/20'
                        }
                      />
                    ))}
                  </div>
                  <div className="text-brand-500 text-5xl font-display leading-none mb-1 select-none">
                    &ldquo;
                  </div>
                  <QuoteBody body={q.body ?? ''} typing={isTyping} />
                  <p className="text-[11px] text-cream/60 tracking-[0.3em] uppercase font-mono">
                    — {q.customer_name || 'A Guest'}
                  </p>
                </article>
              );
            })}
          </div>

          {quotes.length > 3 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              {quotes.map((q, i) => {
                const active = i === startIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => setStartIndex(i)}
                    aria-label={`Show review set starting at ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      active
                        ? 'w-8 bg-brand-500'
                        : 'w-1.5 bg-cream/25 hover:bg-cream/50'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="border-t border-brand-500/10 mt-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 md:py-20 grid md:grid-cols-3 gap-12">
        <div>
          <p className="font-display italic text-2xl text-brand-500 tracking-[0.2em] mb-4">
            VAN LAVINO
          </p>
          <p className="text-cream/60 font-body italic">Crafted fresh, daily.</p>
        </div>
        <div>
          <h4 className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase mb-6">
            Navigate
          </h4>
          <ul className="space-y-3">
            {[
              { label: 'Home', to: '/' },
              { label: 'Menu', to: '/menu' },
              { label: 'About', to: '/about' },
              { label: 'Blog', to: '/blog' },
              { label: 'Contact', to: '/contact' },
            ].map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  className="text-cream/70 hover:text-brand-500 transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase mb-6">
            Visit Us
          </h4>
          <ul className="space-y-3 mb-6">
            {[
              { name: 'Jubilee Hills', phone: '9381789995' },
              { name: 'Financial District', phone: '9124043434' },
              { name: 'Nalagandla', phone: '9124045454' },
            ].map((b) => (
              <li key={b.name} className="text-cream/70 leading-tight">
                <span className="block font-body text-sm text-cream/90">
                  {b.name}
                </span>
                <a
                  href={`tel:+91${b.phone}`}
                  className="font-mono text-xs tracking-wider text-cream/60 hover:text-brand-500 transition-colors"
                >
                  +91 {b.phone.slice(0, 5)} {b.phone.slice(5)}
                </a>
              </li>
            ))}
          </ul>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/60 mb-3">
            Hyderabad, India
          </p>
          <div className="flex gap-4">
            <a
              href="https://www.instagram.com/vanlavino"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="w-10 h-10 rounded-full border border-brand-500/30 flex items-center justify-center text-brand-500 hover:bg-brand-500 hover:text-ink transition-all duration-300"
            >
              <InstagramIcon />
            </a>
            <a
              href="https://www.facebook.com/vanlavino"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="w-10 h-10 rounded-full border border-brand-500/30 flex items-center justify-center text-brand-500 hover:bg-brand-500 hover:text-ink transition-all duration-300"
            >
              <FacebookIcon />
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-brand-500/10 py-6 text-center text-cream/60 text-xs md:text-sm tracking-wider">
        © 2025 Van Lavino · Built with love in Hyderabad
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="grain min-h-screen bg-obsidian text-cream overflow-x-hidden">
      <Navbar />
      <Hero />
      <Marquee />
      <Features />
      <Showcase />
      <Branches />
      <JournalStrip />
      <Testimonials />
      <Footer />
    </div>
  );
}
