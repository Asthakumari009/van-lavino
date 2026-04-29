import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Menu as MenuIcon, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCustomerAccess } from '../lib/useCustomerAccess';
import type { OrderStatus } from '../types';

// Hash-based in-page anchors; Blog is a real route and is handled separately.
const LINKS: { label: string; hash: string }[] = [
  { label: 'Menu', hash: '#menu' },
  { label: 'About', hash: '#about' },
  { label: 'Contact', hash: '#contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Persistent "Track order" pill — visible on the marketing Navbar
  // whenever the signed-in customer has at least one active order.
  // Lets returning customers re-find their tracking page without
  // having to remember the order id.
  const customer = useCustomerAccess((s) => s.getCustomer());
  const [activeCount, setActiveCount] = useState(0);
  const [latestActiveId, setLatestActiveId] = useState<string | null>(null);

  useEffect(() => {
    const phone = customer?.phone;
    if (!phone) {
      setActiveCount(0);
      setLatestActiveId(null);
      return;
    }
    let cancelled = false;
    const ACTIVE: OrderStatus[] = [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'out_for_delivery',
    ];
    const fetchActive = async () => {
      const { data, count } = await supabase
        .from('orders')
        .select('id,created_at', { count: 'exact' })
        .eq('customer_phone', phone)
        .in('status', ACTIVE)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      setActiveCount(count ?? 0);
      setLatestActiveId(data?.[0]?.id ?? null);
    };
    void fetchActive();
    const id = setInterval(fetchActive, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [customer?.phone]);

  const trackHref =
    activeCount === 1 && latestActiveId
      ? `/track?order=${encodeURIComponent(latestActiveId)}`
      : '/customer';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scrollspy: whichever section is in view marks the matching link active.
  useEffect(() => {
    const ids = LINKS.map((l) => l.hash.slice(1));
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(`#${entry.target.id}`);
          }
        }
      },
      { rootMargin: '-40% 0px -50% 0px' }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <>
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'backdrop-blur-xl bg-obsidian/70 border-b border-brand-500/10'
            : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
          <Link
            to="/"
            className="font-display italic text-xl md:text-2xl text-brand-500 tracking-[0.2em]"
          >
            VAN LAVINO
          </Link>

          <div className="hidden md:flex items-center gap-10">
            {LINKS.map((l) => {
              const isActive = active === l.hash;
              return (
                <a
                  key={l.label}
                  href={l.hash}
                  className="relative text-xs uppercase tracking-[0.25em] text-cream/80 hover:text-brand-600 transition-colors"
                >
                  {l.label}
                  <span
                    className={`absolute -bottom-1 left-0 h-[1px] bg-brand-500 transition-all duration-300 ${
                      isActive ? 'w-full' : 'w-0'
                    }`}
                  />
                </a>
              );
            })}
            <Link
              to="/blog"
              className="text-xs uppercase tracking-[0.25em] text-cream/80 hover:text-brand-600 transition-colors"
            >
              Journal
            </Link>
            <Link
              to="/reserve"
              className="text-xs uppercase tracking-[0.25em] text-brand-600 hover:text-brand-500 transition-colors"
            >
              Reserve
            </Link>
            {activeCount > 0 && (
              <Link
                to={trackHref}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-500/15 border border-brand-500/40 text-brand-600 text-[11px] uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
                aria-label={`Track ${activeCount} active order${activeCount > 1 ? 's' : ''}`}
              >
                <History size={13} />
                Track order
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-500 text-ink text-[10px] font-bold">
                  {activeCount}
                </span>
              </Link>
            )}
            <Link
              to="/order"
              className="border border-brand-500 text-brand-500 px-5 py-2 text-xs uppercase tracking-[0.2em] rounded-full hover:bg-brand-500 hover:text-ink transition-all duration-300"
            >
              Order Online
            </Link>
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="md:hidden w-10 h-10 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center"
          >
            <MenuIcon size={18} />
          </button>
        </div>
      </nav>

      <div
        onClick={() => setDrawerOpen(false)}
        className={`md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`md:hidden fixed top-0 right-0 z-50 h-full w-72 bg-obsidian-100 border-l border-brand-500/15 flex flex-col transition-transform duration-500 ease-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-brand-500/10">
          <span className="font-display italic text-xl text-brand-500 tracking-[0.2em]">
            Menu
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
            className="w-10 h-10 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col p-4 gap-1">
          {LINKS.map((l) => {
            const isActive = active === l.hash;
            return (
              <a
                key={l.label}
                href={l.hash}
                onClick={() => setDrawerOpen(false)}
                className={`block px-4 py-3 rounded-xl text-sm uppercase tracking-[0.25em] transition-all ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-600 border border-brand-500/30'
                    : 'text-cream/80 hover:text-brand-600 border border-transparent'
                }`}
              >
                {l.label}
              </a>
            );
          })}
          <Link
            to="/blog"
            onClick={() => setDrawerOpen(false)}
            className="mt-4 block px-4 py-3 rounded-xl text-sm uppercase tracking-[0.25em] text-cream/80 hover:text-brand-600 border border-transparent"
          >
            Journal
          </Link>
          <Link
            to="/reserve"
            onClick={() => setDrawerOpen(false)}
            className="mt-2 text-center border border-brand-500 text-brand-500 py-3 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500/10 transition-all"
          >
            Reserve a Table
          </Link>
          {activeCount > 0 && (
            <Link
              to={trackHref}
              onClick={() => setDrawerOpen(false)}
              className="mt-2 inline-flex items-center justify-center gap-2 border border-brand-500/40 bg-brand-500/10 text-brand-600 py-3 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
            >
              <History size={14} />
              Track order
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-ink text-[10px] font-bold">
                {activeCount}
              </span>
            </Link>
          )}
          <Link
            to="/order"
            onClick={() => setDrawerOpen(false)}
            className="mt-2 text-center bg-brand-500 text-ink py-3 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition-all"
          >
            Order Online
          </Link>
        </nav>
      </aside>
    </>
  );
}
