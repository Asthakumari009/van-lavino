import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ChefHat,
  Circle,
  Citrus,
  Clock,
  Coffee,
  Croissant,
  Droplets,
  Fish,
  Flame,
  GlassWater,
  Heart,
  History,
  Leaf,
  LogOut,
  MapPin,
  Sandwich,
  Search,
  ShoppingCart,
  Sprout,
  Utensils,
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Spinner from '../components/Spinner';
import { supabase } from '../lib/supabase';
import {
  CGST_RATE,
  CUSTOMER_NOTE_MAX,
  SGST_RATE,
  selectGrandTotal,
  selectSubtotal,
  selectTotalItems,
  useCart,
} from '../lib/useCart';
import { initiatePayment } from '../lib/razorpay';
import { useCustomerAccess } from '../lib/useCustomerAccess';
import { formatPrice } from '../lib/format';
import type { Branch, CartItem, MenuItem, OrderStatus, PaymentStatus } from '../types';
import heroImage from '../assets/hero.png';

// ---------- small icons (kept inline for cart controls) ----------

const Icon = {
  Cart: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  Close: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  ),
  Plus: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  ),
  Minus: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  ),
  Trash: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),
};

// ---------- category → lucide icon mapping ----------

const CATEGORY_ICON_MAP: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /start\s*up|appet/i, icon: Flame },
  { match: /club\s*sandwich/i, icon: Sandwich },
  { match: /hot.*grilled\s*sandwich|grilled\s*sandwich/i, icon: Zap },
  { match: /burger/i, icon: Circle },
  { match: /pizza|fresh\s*dough/i, icon: ChefHat },
  { match: /pasta/i, icon: Utensils },
  { match: /rice\s*bowl/i, icon: Leaf },
  { match: /smart\s*food|salad/i, icon: Sprout },
  { match: /salmon|fish/i, icon: Fish },
  { match: /french\s*toast|toast/i, icon: Croissant },
  { match: /sweet\s*crepe|crepe/i, icon: Heart },
  { match: /signature.*coffee|hot\s*coffee/i, icon: Coffee },
  { match: /iced\s*coffee/i, icon: GlassWater },
  { match: /manual\s*brew|brew/i, icon: Droplets },
  { match: /juice|shake/i, icon: Citrus },
  { match: /hot\s*beverage/i, icon: Flame },
];

function iconForCategory(name: string): LucideIcon {
  const match = CATEGORY_ICON_MAP.find((entry) => entry.match.test(name));
  return match?.icon ?? Utensils;
}

// ---------- bestseller detector ----------

const BESTSELLER_PATTERNS = [
  /^cappuccino$/i,
  /chicken\s*club/i,
  /classic\s*margherita/i,
  /avocado\s*pesto/i,
];

function isBestseller(name: string): boolean {
  return BESTSELLER_PATTERNS.some((re) => re.test(name));
}

// ---------- kitchen-open heuristic (IST 9am – 11pm) ----------

function useKitchenStatus() {
  const [open, setOpen] = useState<boolean>(() => computeKitchenOpen());
  useEffect(() => {
    const id = setInterval(() => setOpen(computeKitchenOpen()), 60_000);
    return () => clearInterval(id);
  }, []);
  return open;
}

function computeKitchenOpen(): boolean {
  // IST = UTC + 5:30
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const istHour = new Date(utcMs + 5.5 * 3600_000).getHours();
  return istHour >= 9 && istHour < 23;
}

// ---------- top bar ----------

function TopBar({
  tableNumber,
  cartCount,
  onOpenCart,
  customerName,
  activeOrderCount,
  latestActiveOrderId,
  onSignOut,
}: {
  tableNumber: string;
  cartCount: number;
  onOpenCart: () => void;
  customerName?: string;
  activeOrderCount: number;
  latestActiveOrderId: string | null;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const initials = (customerName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'G';

  return (
    <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-obsidian/80 border-b border-brand-500/10">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="font-display italic text-xl md:text-2xl text-brand-500 tracking-[0.2em]"
        >
          VAN LAVINO
        </Link>
        <div className="flex items-center gap-2 md:gap-3">
          {tableNumber && (
            <span className="hidden sm:inline-flex border border-brand-500/50 text-brand-600 px-4 py-1.5 rounded-full text-xs md:text-sm font-mono tracking-wider">
              Table {tableNumber}
            </span>
          )}

          {/* Persistent "Track order" entrypoint — visible whenever the
              customer has an in-flight order, so they can keep ordering
              and still jump back into tracking. */}
          {activeOrderCount > 0 && (
            <Link
              to={
                activeOrderCount === 1 && latestActiveOrderId
                  ? `/track?order=${encodeURIComponent(latestActiveOrderId)}`
                  : '/customer'
              }
              aria-label={`Track ${activeOrderCount} active order${activeOrderCount > 1 ? 's' : ''}`}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-500/15 border border-brand-500/40 text-brand-600 text-[11px] md:text-xs font-mono tracking-wider hover:bg-brand-500 hover:text-ink transition-all"
            >
              <History size={14} />
              <span className="hidden sm:inline">Track order</span>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-500 text-ink text-[10px] font-bold">
                {activeOrderCount}
              </span>
            </Link>
          )}

          <button
            onClick={onOpenCart}
            aria-label="Open cart"
            className="relative w-11 h-11 rounded-full border border-brand-500/40 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all duration-300"
          >
            <Icon.Cart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-500 text-ink text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center font-mono">
                {cartCount}
              </span>
            )}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              className="w-11 h-11 rounded-full border border-brand-500/40 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all duration-300 font-mono text-xs font-semibold"
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 w-64 bg-obsidian-50 border border-brand-500/25 rounded-2xl shadow-luxury overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-500/10">
                  <p className="font-display italic text-lg text-cream truncate">
                    {customerName || 'Guest'}
                  </p>
                  <p className="font-mono text-[11px] text-cream/70 tracking-wider uppercase">
                    Signed in
                  </p>
                </div>
                <Link
                  to="/customer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-cream/80 hover:bg-brand-500/10 hover:text-brand-600 transition-all text-sm"
                >
                  <UserRound size={16} />
                  My orders &amp; profile
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-cream/80 hover:bg-red-500/10 hover:text-red-400 transition-all text-sm border-t border-brand-500/10"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ---------- hero strip ----------

function HeroStrip({ tableNumber }: { tableNumber: string }) {
  return (
    <section
      aria-label="Van Lavino hero"
      className="hero-parallax relative h-[160px] md:h-[200px] w-full"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      {/* Dark overlay keeps the restaurant photo dramatic even against the
          ivory page bg; bottom fades softly into the ground color so the
          hero feels embedded, not floating. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,7,5,0.55) 0%, rgba(10,7,5,0.35) 55%, rgba(242,237,225,0.92) 100%)',
        }}
      />
      <div className="relative h-full max-w-7xl mx-auto px-4 md:px-8 flex flex-col items-center justify-center text-center gap-3">
        <h1 className="font-display italic text-[36px] md:text-[44px] leading-none text-brand-500 tracking-[0.14em] drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
          VAN LAVINO
        </h1>
        {tableNumber && (
          <span className="inline-flex items-center gap-2 border border-brand-500/60 bg-black/40 backdrop-blur-sm text-brand-200 px-4 py-1.5 rounded-full text-xs font-mono tracking-[0.25em] uppercase">
            Table {tableNumber}
          </span>
        )}
      </div>
    </section>
  );
}

// ---------- active-order sticky banner ----------

function ActiveOrderBanner({
  count,
  latestOrderId,
}: {
  count: number;
  latestOrderId: string | null;
}) {
  if (count <= 0) return null;
  // Single order → jump straight into the live status timeline
  // (Placed → Confirmed → Preparing → Ready → Served).
  // Multiple orders → land on the customer dashboard where they're listed.
  const target =
    count === 1 && latestOrderId
      ? `/track?order=${encodeURIComponent(latestOrderId)}`
      : '/customer';
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4">
      <Link
        to={target}
        className="group flex items-center gap-3 rounded-2xl border border-brand-500/40 bg-gradient-to-r from-brand-500/15 via-brand-500/8 to-brand-500/15 px-4 py-3 hover:border-brand-500 hover:shadow-[0_10px_30px_-15px_rgba(193,120,32,0.5)] transition-all"
        aria-label={`Track ${count} active order${count > 1 ? 's' : ''}`}
      >
        <span className="relative flex-shrink-0 w-9 h-9 rounded-full bg-brand-500 text-ink flex items-center justify-center">
          <History size={16} />
          <span className="absolute inset-0 rounded-full border-2 border-brand-500 animate-ping opacity-60" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display italic text-base md:text-lg text-cream leading-tight">
            {count === 1
              ? 'Your order is on its way'
              : `You have ${count} active orders`}
          </p>
          <p className="font-mono text-[10px] md:text-[11px] tracking-[0.25em] uppercase text-cream/60">
            Tap to see live status · Accepted · Preparing · Ready
          </p>
        </div>
        <span className="font-mono text-xs tracking-[0.2em] uppercase text-brand-500 group-hover:translate-x-1 transition-transform whitespace-nowrap">
          Track →
        </span>
      </Link>
    </div>
  );
}

// ---------- branch info banner ----------

function BranchInfoBanner({
  branch,
  tableNumber,
  kitchenOpen,
}: {
  branch: Branch | null;
  tableNumber: string;
  kitchenOpen: boolean;
}) {
  if (!branch) return null;
  const parts: string[] = [];
  parts.push(branch.name);
  if (branch.city) parts.push(branch.city);
  const location = parts.join(', ');

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4 md:mt-6">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-[11px] md:text-xs font-mono tracking-wider uppercase text-cream/70 bg-obsidian-50/60 border border-brand-500/10 rounded-full px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-brand-600">
          <MapPin size={13} />
          {location}
        </span>
        {tableNumber && (
          <>
            <span className="text-cream/70">·</span>
            <span>Table T{tableNumber}</span>
          </>
        )}
        <span className="text-cream/70">·</span>
        <span
          className={`inline-flex items-center gap-1.5 ${
            kitchenOpen ? 'text-green-400' : 'text-red-400'
          }`}
        >
          <Clock size={13} />
          {kitchenOpen ? 'Kitchen Open' : 'Kitchen Closed'}
        </span>
      </div>
    </div>
  );
}

// ---------- search bar ----------

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-cream/60 pointer-events-none"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search focaccia, cappuccino..."
          className="w-full bg-obsidian-50/80 border border-brand-500/15 rounded-full pl-11 pr-11 py-3 text-sm text-cream placeholder:text-cream/45 focus:outline-none focus:border-brand-500 transition-colors"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-cream/60 hover:text-brand-500 hover:bg-brand-500/10 transition-all flex items-center justify-center"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- category tabs ----------

function CategoryTabs({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
  return (
    <div className="sticky top-[72px] z-30 backdrop-blur-xl bg-obsidian/80 border-b border-brand-500/10">
      <div className="max-w-7xl mx-auto overflow-x-auto scrollbar-hide">
        <div className="flex gap-2.5 px-4 md:px-8 py-4 min-w-max">
          {categories.map((c) => {
            const isActive = c === active;
            const IconCmp = iconForCategory(c);
            return (
              <button
                key={c}
                onClick={() => onSelect(c)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] md:text-xs uppercase tracking-[0.2em] font-mono transition-all duration-300 whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-500 text-ink'
                    : 'bg-obsidian-100 text-cream/70 hover:text-brand-600 border border-brand-500/10'
                }`}
              >
                <IconCmp size={14} />
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- menu item card ----------

function ItemCard({
  item,
  browseMode,
  onBrowseAdd,
}: {
  item: MenuItem;
  /** True when the page is in public-browse mode (no table session). */
  browseMode?: boolean;
  /** Called instead of addItem when in browseMode — usually routes the
   *  customer to /scan so they can start a table session. */
  onBrowseAdd?: () => void;
}) {
  const quantity =
    useCart((s) => s.items.find((i) => i.id === item.id)?.quantity) ?? 0;
  const addItem = useCart((s) => s.addItem);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const [pulse, setPulse] = useState(false);

  const onAdd = () => {
    if (browseMode) {
      onBrowseAdd?.();
      return;
    }
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      is_veg: item.is_veg,
    });
    setPulse(true);
    setTimeout(() => setPulse(false), 450);
    toast.success(`${item.name} added`, {
      style: {
        background: '#fbf6e8',
        color: '#0a0706',
        border: '1px solid rgba(193,120,32,0.3)',
      },
      iconTheme: { primary: '#c17820', secondary: '#fbf6e8' },
    });
  };

  const bestseller = isBestseller(item.name);

  return (
    <div
      className={`group relative bg-obsidian-100 rounded-2xl overflow-hidden border border-brand-500/10 hover:border-brand-500/40 transition-all duration-500 flex flex-col md:hover:-translate-y-1 md:hover:shadow-[0_20px_45px_-20px_rgba(193,120,32,0.45)] ${
        pulse ? 'gold-pulse' : ''
      }`}
    >
      <div
        className="relative aspect-square w-full flex items-center justify-center overflow-hidden"
        style={{
          background: item.image_url
            ? undefined
            : 'linear-gradient(135deg, rgba(193,120,32,0.25), rgba(58,32,9,0.4) 60%, #0a0908)',
        }}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="font-display italic text-5xl text-brand-500/40 select-none">
            {item.name.charAt(0)}
          </span>
        )}

        {/* Veg / non-veg indicator — rounded square, FSSAI-style */}
        <span
          className={`absolute top-3 left-3 w-5 h-5 rounded-[5px] border-2 bg-obsidian/85 backdrop-blur-sm flex items-center justify-center ${
            item.is_veg ? 'border-green-500' : 'border-red-500'
          }`}
          aria-label={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
          title={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              item.is_veg ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
        </span>

        {bestseller && (
          <span className="absolute top-3 right-3 bg-brand-500 text-ink text-[9px] font-bold uppercase tracking-[0.2em] font-mono px-2 py-1 rounded-full shadow-[0_4px_14px_rgba(193,120,32,0.45)]">
            Bestseller
          </span>
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1 min-w-0">
        <h3 className="text-cream text-[14px] sm:text-[15px] font-semibold leading-snug line-clamp-1">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-cream/70 text-[11px] sm:text-[12px] leading-snug mt-1 line-clamp-2">
            {item.description}
          </p>
        )}
        <div className="mt-auto pt-3 sm:pt-4 flex items-center justify-between gap-2 min-w-0">
          <span className="font-display text-[18px] sm:text-[24px] leading-none text-brand-500 truncate">
            ₹{formatPrice(item.price)}
          </span>
          <div className="transition-[width] duration-300 flex-shrink-0">
            {quantity > 0 ? (
              <div className="flex items-center gap-0.5 sm:gap-1 bg-brand-500/10 border border-brand-500/40 rounded-full p-0.5 sm:p-1">
                <button
                  onClick={() => updateQuantity(item.id, quantity - 1)}
                  aria-label="Decrease quantity"
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
                >
                  <Icon.Minus />
                </button>
                <span className="w-5 sm:w-6 text-center text-cream text-xs sm:text-sm font-mono">
                  {quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.id, quantity + 1)}
                  aria-label="Increase quantity"
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
                >
                  <Icon.Plus />
                </button>
              </div>
            ) : (
              <button
                onClick={onAdd}
                className="inline-flex items-center gap-1 border border-brand-500 text-brand-500 px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-full text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all duration-200 whitespace-nowrap"
              >
                <Icon.Plus size={12} />
                Add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- empty state ----------

function EmptyState({
  title = 'Nothing here yet',
  subtext = 'Check back soon or ask our staff',
}: {
  title?: string;
  subtext?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 gap-4">
      <Utensils size={72} className="text-brand-500/20" strokeWidth={1.25} />
      <p className="font-display italic text-[32px] text-cream leading-none">
        {title}
      </p>
      <p className="font-body text-sm text-cream/60 max-w-xs">{subtext}</p>
    </div>
  );
}

// ---------- cart drawer ----------

function CartDrawer({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (method: 'online' | 'cash') => void;
  submitting: 'online' | 'cash' | null;
}) {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const customerNote = useCart((s) => s.customerNote);
  const setCustomerNote = useCart((s) => s.setCustomerNote);
  const subtotal = useCart(selectSubtotal);
  const total = useCart(selectGrandTotal);
  const cgst = subtotal * CGST_RATE;
  const sgst = subtotal * SGST_RATE;
  const noteUsed = customerNote.length;
  const noteRemaining = CUSTOMER_NOTE_MAX - noteUsed;
  const noteNearLimit = noteRemaining <= 20;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-obsidian-100 border-l border-brand-500/15 flex flex-col transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-brand-500/10">
          <h2 className="font-display italic text-3xl text-cream">Your Order</h2>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="w-10 h-10 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
          >
            <Icon.Close />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-cream/70 gap-3">
              <div className="w-14 h-14 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center">
                <Icon.Cart size={22} />
              </div>
              <p className="font-display italic text-xl">Your cart is empty</p>
              <p className="text-sm">Add items from the menu to begin.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-start gap-3 pb-4 border-b border-brand-500/5"
                >
                  <div
                    className="w-14 h-14 rounded-xl flex-shrink-0"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(193,120,32,0.3), rgba(58,32,9,0.5))',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-cream text-sm font-semibold line-clamp-1">
                      {i.name}
                    </p>
                    <p className="font-mono text-xs text-cream/70 mt-1">
                      ₹{formatPrice(i.price)} each
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(i.id, i.quantity - 1)}
                        aria-label="Decrease"
                        className="w-6 h-6 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
                      >
                        <Icon.Minus size={12} />
                      </button>
                      <span className="w-5 text-center text-cream text-xs font-mono">
                        {i.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(i.id, i.quantity + 1)}
                        aria-label="Increase"
                        className="w-6 h-6 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
                      >
                        <Icon.Plus size={12} />
                      </button>
                      <button
                        onClick={() => removeItem(i.id)}
                        aria-label="Remove"
                        className="ml-auto text-cream/60 hover:text-red-400 transition-colors"
                      >
                        <Icon.Trash size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="font-display text-lg text-brand-500 whitespace-nowrap">
                    ₹{formatPrice(i.price * i.quantity)}
                  </div>
                </li>
              ))}

              <li>
                <div className="flex items-end justify-between mb-2">
                  <label
                    htmlFor="customer-note"
                    className="block font-body text-xs text-cream/60"
                  >
                    Special Instructions — Any special requests?
                  </label>
                  <span
                    className={`font-mono text-[10px] tracking-wider ${
                      noteNearLimit ? 'text-amber-400' : 'text-cream/60'
                    }`}
                  >
                    {noteUsed}/{CUSTOMER_NOTE_MAX}
                  </span>
                </div>
                <textarea
                  id="customer-note"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  maxLength={CUSTOMER_NOTE_MAX}
                  rows={3}
                  placeholder="Less sugar in coffee · Extra spicy · Allergic to nuts · No onions"
                  className="w-full bg-obsidian-200/40 border border-brand-500/20 rounded-xl px-4 py-3 text-cream text-sm placeholder:text-cream/45 focus:border-brand-500 focus:outline-none resize-none transition-colors"
                />
              </li>
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-brand-500/10 p-6 space-y-4">
            <div className="space-y-1.5 font-mono text-sm">
              <Row label="Subtotal" value={subtotal} />
              <Row label="CGST 2.5%" value={cgst} muted />
              <Row label="SGST 2.5%" value={sgst} muted />
              <div className="h-px bg-brand-500/10 my-2" />
              <Row label="Grand Total" value={total} large />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button
                disabled={submitting !== null}
                onClick={() => onSubmit('online')}
                className="bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting === 'online' && <Spinner />}
                {submitting === 'online' ? 'Opening checkout…' : 'Pay Online →'}
              </button>
              <button
                disabled={submitting !== null}
                onClick={() => onSubmit('cash')}
                className="border border-brand-500/50 text-brand-600 py-3.5 rounded-full font-medium tracking-wide hover:border-brand-500 hover:text-brand-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting === 'cash' && <Spinner />}
                {submitting === 'cash' ? 'Placing order…' : 'Cash / Pay Later'}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Row({
  label,
  value,
  muted,
  large,
}: {
  label: string;
  value: number;
  muted?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        large ? 'text-cream text-lg font-display' : muted ? 'text-cream/70' : 'text-cream/80'
      }`}
    >
      <span>{label}</span>
      <span>₹{formatPrice(value)}</span>
    </div>
  );
}

// ---------- skeletons ----------

function CardSkeleton() {
  return (
    <div className="bg-obsidian-100 rounded-2xl overflow-hidden border border-brand-500/10">
      <div className="aspect-square skeleton-sweep" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 rounded skeleton-sweep" />
        <div className="h-3 w-full rounded skeleton-sweep" />
        <div className="h-3 w-5/6 rounded skeleton-sweep" />
        <div className="flex items-center justify-between pt-2">
          <div className="h-6 w-16 rounded skeleton-sweep" />
          <div className="h-8 w-20 rounded-full skeleton-sweep" />
        </div>
      </div>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 pt-10 pb-20">
      <div className="h-8 w-48 rounded skeleton-sweep mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ---------- helpers ----------

type Grouped = { category: string; displayOrder: number; items: MenuItem[] };

function groupByCategory(items: MenuItem[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const item of items) {
    const name = item.categories?.name ?? 'Other';
    const order = item.categories?.display_order ?? 9999;
    const existing = map.get(name);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(name, { category: name, displayOrder: order, items: [item] });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
}

// ---------- page ----------

export default function Menu() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tableParamFromUrl = searchParams.get('table') ?? '';
  const branchParamFromUrl = searchParams.get('branch') ?? '';
  const tokenParamFromUrl = searchParams.get('token') ?? '';
  const tableSession = useCustomerAccess((s) => s.getTableSession());
  const customer = useCustomerAccess((s) => s.getCustomer());

  const setTableInfo = useCart((s) => s.setTableInfo);
  const clearCart = useCart((s) => s.clearCart);
  const cartItems = useCart((s) => s.items);
  const customerNote = useCart((s) => s.customerNote);
  const totalItems = useCart(selectTotalItems);
  const subtotal = useCart(selectSubtotal);
  const grandTotal = useCart(selectGrandTotal);

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [latestActiveOrderId, setLatestActiveOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState<'online' | 'cash' | null>(null);
  const [search, setSearch] = useState('');
  const kitchenOpen = useKitchenStatus();

  // Browse mode: customer hit /menu from the marketing nav with no table
  // session and no QR-derived URL params. We still want to show them a
  // menu (so they can decide to visit), but ordering must be gated on a
  // real table — Add buttons route them to /scan instead of mutating the
  // cart, and we fall back to the first active branch for display.
  const isBrowseMode =
    !tableSession && !branchParamFromUrl && !tokenParamFromUrl;

  const [fallbackBranchId, setFallbackBranchId] = useState<string>('');
  useEffect(() => {
    if (!isBrowseMode) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) setFallbackBranchId(data.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [isBrowseMode]);

  const branchParam =
    tableSession?.branchId || branchParamFromUrl || fallbackBranchId;
  const tableParam =
    tableSession?.tableNumber || tableParamFromUrl;
  const tokenParam = tableSession?.token || tokenParamFromUrl;

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Persist table + branch from the QR URL into the cart store
  useEffect(() => {
    if (tableParam || branchParam) {
      setTableInfo(tableParam, branchParam);
    }
  }, [tableParam, branchParam, setTableInfo]);

  // Load menu items
  useEffect(() => {
    if (!branchParam) {
      // In browse mode we're waiting for fallbackBranchId to land —
      // keep the skeleton up rather than flashing a "missing branch"
      // error that will instantly resolve itself.
      if (isBrowseMode) return;
      setLoading(false);
      setLoadError('Missing branch. Please scan your table QR code.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // Watchdog: if the supabase query never resolves (slow first
    // connection / WebSocket warmup on mobile) the skeleton would sit
    // forever. After 12s, surface an error so the user can retry by
    // refreshing instead of staring at a shimmering placeholder.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setLoadError('Menu took too long to load. Please refresh.');
    }, 12_000);
    (async () => {
      // Bakery SKUs (is_deliverable = true) live in their own /order
      // channel — exclude them from the dine-in QR menu so the table
      // experience stays focused on prepared dishes.
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, categories(name, display_order)')
        .eq('branch_id', branchParam)
        .eq('is_available', true)
        .eq('is_deliverable', false)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      clearTimeout(watchdog);
      if (error) {
        setLoadError(error.message);
      } else {
        setMenu((data ?? []) as MenuItem[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [branchParam]);

  // Load branch details
  useEffect(() => {
    if (!branchParam) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchParam)
        .maybeSingle();
      if (cancelled) return;
      if (data) setBranch(data as Branch);
    })();
    return () => {
      cancelled = true;
    };
  }, [branchParam]);

  // Track in-flight orders for this customer session so the "Track order"
  // pill + banner stay live after the customer continues ordering. We also
  // capture the latest active order id so a single-order case can link
  // straight to the full status timeline at /track?order=<id>.
  useEffect(() => {
    const sessionId = tableSession?.customerSessionId;
    if (!sessionId) {
      setActiveOrderCount(0);
      setLatestActiveOrderId(null);
      return;
    }
    let cancelled = false;
    const ACTIVE: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];
    const fetchActive = async () => {
      const { data, count } = await supabase
        .from('orders')
        .select('id,created_at', { count: 'exact' })
        .eq('customer_session_id', sessionId)
        .in('status', ACTIVE)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      setActiveOrderCount(count ?? 0);
      setLatestActiveOrderId(data?.[0]?.id ?? null);
    };
    fetchActive();
    const id = setInterval(fetchActive, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tableSession?.customerSessionId]);

  const grouped = useMemo(() => groupByCategory(menu), [menu]);
  const categoryNames = useMemo(
    () => grouped.map((g) => g.category),
    [grouped]
  );

  // Apply search filter to grouped data (client-side, on already-fetched items)
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.description ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, search]);

  const visibleCategoryNames = useMemo(
    () => filteredGrouped.map((g) => g.category),
    [filteredGrouped]
  );

  useEffect(() => {
    if (!activeCategory && categoryNames.length > 0) {
      setActiveCategory(categoryNames[0]);
    }
  }, [categoryNames, activeCategory]);

  // If the current active category disappears under the search filter,
  // fall back to the first visible one.
  useEffect(() => {
    if (
      visibleCategoryNames.length > 0 &&
      !visibleCategoryNames.includes(activeCategory)
    ) {
      setActiveCategory(visibleCategoryNames[0]);
    }
  }, [visibleCategoryNames, activeCategory]);

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat);
    const el = sectionRefs.current[cat];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (method: 'online' | 'cash') => {
    if (cartItems.length === 0) return;
    if (!branchParam) {
      toast.error('Missing branch — cannot place order');
      return;
    }
    if (!customer) {
      toast.error('Customer session expired. Please sign in again.');
      navigate('/customer-auth', { replace: true });
      return;
    }
    if (!tokenParam) {
      toast.error('Missing table token. Please scan QR again.');
      navigate('/scan', { replace: true });
      return;
    }

    const note = customerNote;

    setSubmitting(method);

    try {
      // Best-effort: resolve table_id from table_number
      let tableId: string | null = null;
      if (tableParam) {
        const { data: tableRow } = await supabase
          .from('restaurant_tables')
          .select('id')
          .eq('branch_id', branchParam)
          .eq('table_number', tableParam)
          .maybeSingle();
        tableId = tableRow?.id ?? null;
      }

      const sub = Number(subtotal.toFixed(2));
      const total = Number(grandTotal.toFixed(2));

      if (method === 'cash') {
        const orderId = await persistOrder({
          branchId: branchParam,
          tableId,
          tableNumber: tableParam,
          tableToken: tokenParam,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerSessionId: tableSession?.customerSessionId ?? null,
          status: 'confirmed',
          paymentStatus: 'cash',
          paymentMethod: 'cash',
          subtotal: sub,
          total,
          note,
          items: cartItems,
        });
        useCustomerAccess.getState().setLastOrderId(orderId);
        // Optimistic: banner should appear immediately when the user
        // lands back on /menu, without waiting for the 20s refetch.
        setLatestActiveOrderId(orderId);
        setActiveOrderCount((n) => n + 1);
        toast.success('Order placed — pay at the counter');
        clearCart();
        setCartOpen(false);
        navigate('/order-success', { state: { orderId } });
        return;
      }

      // Server creates the Razorpay order via edge function so we have a
      // verifiable `order_id` to pass into checkout.
      const amountPaise = Math.round(total * 100);
      let rpOrder: { id: string; amount: number; currency: string } | null = null;
      try {
        const { data, error: rpErr } = await supabase.functions.invoke<{
          id: string;
          amount: number;
          currency: string;
        }>('create-razorpay-order', {
          body: { amount: amountPaise, receipt: `rcpt_${Date.now()}` },
        });
        if (rpErr) throw rpErr;
        rpOrder = data ?? null;
      } catch (err) {
        console.error('[razorpay] create-order failed', err);
        toast.error(
          'Online payment is unavailable right now. Please use Cash / Pay Later, or ask a staff member.',
          { duration: 6000 }
        );
        setSubmitting(null);
        return;
      }

      if (!rpOrder?.id) {
        toast.error('Could not create payment order');
        setSubmitting(null);
        return;
      }

      // Pre-persist the order BEFORE opening Razorpay. On mobile UPI flows
      // Razorpay redirects to `callback_url` (the JS modal handler may
      // never fire because the OS suspends the page while the user is in
      // a UPI app). The order needs to already be in the DB so the
      // success page can find it by id from the URL.
      let internalOrderId: string;
      try {
        internalOrderId = await persistOrder({
          branchId: branchParam,
          tableId,
          tableNumber: tableParam,
          tableToken: tokenParam,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerSessionId: tableSession?.customerSessionId ?? null,
          status: 'confirmed',
          paymentStatus: 'unpaid',
          paymentMethod: 'razorpay',
          razorpayOrderId: rpOrder.id,
          razorpayPaymentId: null,
          subtotal: sub,
          total,
          note,
          items: cartItems,
        });
      } catch (err) {
        console.error(err);
        toast.error('Could not save your order. Please try again.');
        setSubmitting(null);
        return;
      }
      useCustomerAccess.getState().setLastOrderId(internalOrderId);
      setLatestActiveOrderId(internalOrderId);
      setActiveOrderCount((n) => n + 1);

      // Mobile reliability: poll the Supabase razorpay-status edge
      // function alongside the modal so we still navigate to
      // /order-success if the in-page handler doesn't fire. The function
      // checks DB then falls back to Razorpay's API using the secrets
      // already on Supabase. `pollHandledRef` keeps modal-handler vs.
      // poll from double-firing.
      const pollHandledRef = { current: false };
      const startPoll = () => {
        const startedAt = Date.now();
        const POLL_TIMEOUT_MS = 5 * 60_000;
        const POLL_INTERVAL_MS = 3000;
        const tick = async () => {
          if (pollHandledRef.current) return;
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) return;
          try {
            const { data, error } = await supabase.functions.invoke<{
              ok?: boolean;
              verified?: boolean;
              orderId?: string | null;
            }>('razorpay-status', {
              body: { razorpay_order_id: rpOrder.id },
            });
            if (!error && data?.verified && !pollHandledRef.current) {
              pollHandledRef.current = true;
              toast.success('Payment received');
              clearCart();
              setCartOpen(false);
              navigate('/order-success', {
                state: { orderId: data.orderId ?? internalOrderId },
              });
              setSubmitting(null);
              return;
            }
          } catch (err) {
            console.warn('[razorpay-status] dine-in poll error', err);
          }
          window.setTimeout(tick, POLL_INTERVAL_MS);
        };
        window.setTimeout(tick, POLL_INTERVAL_MS);
      };
      startPoll();

      await initiatePayment({
        amount: rpOrder.amount,
        orderId: rpOrder.id,
        tableNumber: tableParam || '-',
        description: `Order · Table ${tableParam || '-'}`,
        prefill: {
          name: customer.name,
          contact: customer.phone,
        },
        onSuccess: async (resp) => {
          if (pollHandledRef.current) return;
          pollHandledRef.current = true;
          // Desktop modal path. Verify on the server (best-effort —
          // failure here just means staff has to reconcile manually,
          // the order itself is already saved as 'unpaid').
          try {
            await supabase.functions.invoke('verify-razorpay-payment', {
              body: {
                orderId: internalOrderId,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              },
            });
          } catch (err) {
            console.error('[verify-razorpay] dine-in verify failed', err);
          }
          toast.success('Payment received');
          clearCart();
          setCartOpen(false);
          navigate('/order-success', { state: { orderId: internalOrderId } });
          setSubmitting(null);
        },
        onFailure: () => {
          pollHandledRef.current = true;
          toast('Payment cancelled', { icon: 'ℹ️' });
          setSubmitting(null);
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-cream">
      <TopBar
        tableNumber={tableParam}
        cartCount={totalItems}
        onOpenCart={() => setCartOpen(true)}
        customerName={customer?.name}
        activeOrderCount={activeOrderCount}
        latestActiveOrderId={latestActiveOrderId}
        onSignOut={() => {
          useCustomerAccess.getState().clearAll();
          clearCart();
          toast.success('Signed out');
          navigate('/customer-auth', { replace: true });
        }}
      />

      {/* Reserve space for the fixed navbar so the hero doesn't slide under it */}
      <div className="h-[72px]" />

      <HeroStrip tableNumber={tableParam} />

      <ActiveOrderBanner
        count={activeOrderCount}
        latestOrderId={latestActiveOrderId}
      />

      <BranchInfoBanner
        branch={branch}
        tableNumber={tableParam}
        kitchenOpen={kitchenOpen}
      />

      <SearchBar value={search} onChange={setSearch} />

      {loading ? (
        <MenuSkeleton />
      ) : loadError ? (
        <div className="pt-10 px-6 text-center">
          <EmptyState
            title="This menu link looks broken."
            subtext={loadError}
          />
          <Link
            to="/"
            className="inline-block border border-brand-500 text-brand-500 px-6 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
          >
            Back to Home
          </Link>
        </div>
      ) : menu.length === 0 ? (
        <EmptyState
          title="The kitchen is quiet right now."
          subtext="No items are currently available."
        />
      ) : (
        <>
          <div className="mt-4">
            <CategoryTabs
              categories={visibleCategoryNames}
              active={activeCategory}
              onSelect={scrollToCategory}
            />
          </div>
          <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 pb-32 pt-6">
            {filteredGrouped.length === 0 ? (
              <EmptyState
                title="No matches found"
                subtext={`We couldn't find anything for "${search}". Try a different term.`}
              />
            ) : (
              filteredGrouped.map((g) => (
                <section
                  key={g.category}
                  ref={(el) => {
                    sectionRefs.current[g.category] = el;
                  }}
                  className="mb-16"
                >
                  <h2 className="font-display text-3xl md:text-[36px] text-brand-500 mb-8 tracking-tight flex items-center gap-3">
                    {(() => {
                      const IconCmp = iconForCategory(g.category);
                      return <IconCmp size={26} strokeWidth={1.5} className="text-brand-500/70" />;
                    })()}
                    {g.category}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                    {g.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        browseMode={isBrowseMode}
                        onBrowseAdd={() => {
                          toast(
                            'Scan your table QR to start ordering',
                            { icon: '📷' }
                          );
                          navigate('/scan');
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>
        </>
      )}

      {totalItems > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          aria-label={`Open cart (${totalItems} items)`}
          className="md:hidden fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full bg-brand-500 text-ink flex items-center justify-center shadow-glow hover:scale-105 transition-transform"
        >
          <ShoppingCart size={22} />
          <span className="absolute -top-1 -right-1 bg-obsidian text-brand-500 border border-brand-500 text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center font-mono">
            {totalItems}
          </span>
        </button>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  );
}

// ---------- persistence ----------

interface PersistOrderInput {
  branchId: string;
  tableId: string | null;
  tableNumber: string;
  tableToken: string;
  customerName: string;
  customerPhone: string;
  customerSessionId: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  subtotal: number;
  total: number;
  note: string;
  items: CartItem[];
}

async function persistOrder(input: PersistOrderInput) {
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      branch_id: input.branchId,
      table_id: input.tableId,
      table_number: input.tableNumber,
      table_token: input.tableToken,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_session_id: input.customerSessionId,
      status: input.status,
      payment_status: input.paymentStatus,
      payment_method: input.paymentMethod,
      razorpay_order_id: input.razorpayOrderId ?? null,
      razorpay_payment_id: input.razorpayPaymentId ?? null,
      subtotal: input.subtotal,
      total: input.total,
      customer_note: input.note || null,
      is_manual: false,
    })
    .select('id')
    .single();

  if (error || !order) {
    throw new Error(error?.message ?? 'Failed to create order');
  }

  const rows = input.items.map((i) => ({
    order_id: order.id,
    menu_item_id: i.id,
    item_name: i.name,
    quantity: i.quantity,
    unit_price: i.price,
    total_price: Number((i.price * i.quantity).toFixed(2)),
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(rows);
  if (itemsError) {
    throw new Error(itemsError.message);
  }

  return order.id as string;
}
