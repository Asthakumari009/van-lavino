import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Crosshair,
  History,
  Loader2,
  MapPin,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  CGST_RATE,
  SGST_RATE,
  selectGrandTotal,
  selectSubtotal,
  selectTotalItems,
  useCart,
} from '../lib/useCart';
import { useCustomerAccess } from '../lib/useCustomerAccess';
import { formatPrice } from '../lib/format';
import type { Branch, MenuItem, OrderStatus } from '../types';

// Haversine distance in km between two lat/lng pairs. Used to pick the
// nearest branch when the customer taps "Use my location".
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Hours assume IST 9–11 (matching the in-restaurant kitchen heuristic).
function isBakeryOpen(): boolean {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const istHour = new Date(utcMs + 5.5 * 3600_000).getHours();
  return istHour >= 9 && istHour < 23;
}

function TopBar({
  branches,
  selectedBranchId,
  onSelectBranch,
  cartCount,
  onOpenCart,
  activeOrderCount,
  latestActiveOrderId,
}: {
  branches: Branch[];
  selectedBranchId: string;
  onSelectBranch: (id: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  activeOrderCount: number;
  latestActiveOrderId: string | null;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const selected = branches.find((b) => b.id === selectedBranchId);

  // Tap-to-find-nearest: requests browser geolocation, then picks the
  // active branch with the smallest haversine distance. Branches without
  // lat/lng are silently skipped (admin can fill them in via Branches).
  function findNearest() {
    if (!('geolocation' in navigator)) {
      toast.error('Your browser does not support location');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const candidates = branches.filter(
          (b) => b.is_active && b.lat != null && b.lng != null
        );
        if (candidates.length === 0) {
          toast.error('No branches have coordinates yet');
          return;
        }
        let best: { branch: Branch; km: number } | null = null;
        for (const b of candidates) {
          const km = haversineKm(
            pos.coords.latitude,
            pos.coords.longitude,
            b.lat as number,
            b.lng as number
          );
          if (!best || km < best.km) best = { branch: b, km };
        }
        if (best) {
          onSelectBranch(best.branch.id);
          toast.success(
            `Nearest · ${best.branch.name} · ${best.km.toFixed(1)} km away`
          );
        }
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied'
            : err.message || 'Could not get your location'
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }

  return (
    <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-obsidian/85 border-b border-brand-500/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4 flex items-center justify-between gap-2 sm:gap-3">
        <Link
          to="/"
          className="font-display italic text-xl md:text-2xl text-brand-500 tracking-[0.2em] whitespace-nowrap"
        >
          VAN LAVINO
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          {/* Persistent track-order entrypoint. When the customer has
              one active order, link straight to its tracking page; with
              multiple active, link to the customer dashboard which
              lists them all with their own Track buttons. Always shown
              when at least one active order exists, so customers can
              re-find their order long after the success page closes. */}
          {activeOrderCount > 0 && (
            <Link
              to={
                activeOrderCount === 1 && latestActiveOrderId
                  ? `/track?order=${encodeURIComponent(latestActiveOrderId)}`
                  : '/customer'
              }
              aria-label={`Track ${activeOrderCount} active order${activeOrderCount > 1 ? 's' : ''}`}
              className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-brand-500/15 border border-brand-500/40 text-brand-600 text-[11px] md:text-xs font-mono tracking-wider hover:bg-brand-500 hover:text-ink transition-all"
            >
              <History size={13} />
              <span className="hidden sm:inline">Track order</span>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-500 text-ink text-[10px] font-bold">
                {activeOrderCount}
              </span>
            </Link>
          )}
          {/* GPS shortcut — single tap finds the nearest active branch
              and selects it. Saves the customer scrolling the picker. */}
          <button
            type="button"
            onClick={findNearest}
            disabled={locating}
            aria-label="Use my location to pick the nearest branch"
            title="Use my location"
            className="inline-flex items-center justify-center w-10 h-10 md:w-auto md:h-auto md:px-3 md:py-2 rounded-full border border-brand-500/40 text-brand-500 hover:bg-brand-500 hover:text-ink hover:border-brand-500 text-[11px] md:text-xs font-mono tracking-wider transition-all disabled:opacity-60"
          >
            {locating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Crosshair size={14} />
            )}
            <span className="hidden md:inline ml-1.5">
              {locating ? 'Locating' : 'Nearest'}
            </span>
          </button>

          <div className="relative">
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-brand-500/40 text-cream/85 hover:text-brand-600 hover:border-brand-500 text-[11px] md:text-xs font-mono tracking-wider transition-all"
              aria-label="Choose fulfillment branch"
            >
              <MapPin size={13} className="text-brand-500" />
              <span className="truncate max-w-[80px] sm:max-w-[120px] md:max-w-[180px]">
                {selected?.name ?? 'Choose branch'}
              </span>
              <ChevronDown
                size={13}
                className={`transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-12 w-72 bg-obsidian-50 border border-brand-500/25 rounded-2xl shadow-luxury overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-brand-500/10">
                  <p className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase">
                    Fulfillment branch
                  </p>
                  <p className="text-cream/75 text-xs mt-1">
                    Pickup happens here. Delivery is dispatched from the same branch.
                  </p>
                </div>
                {branches.map((b) => {
                  const isActive = b.id === selectedBranchId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        onSelectBranch(b.id);
                        setPickerOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 border-t border-brand-500/5 transition-all ${
                        isActive
                          ? 'bg-brand-500/15 text-brand-600'
                          : 'text-cream/80 hover:bg-brand-500/8 hover:text-brand-600'
                      }`}
                    >
                      <p className="font-display italic text-base leading-tight">{b.name}</p>
                      {b.city && (
                        <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 mt-1">
                          {b.city}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={onOpenCart}
            aria-label="Open cart"
            className="relative w-11 h-11 rounded-full border border-brand-500/40 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all duration-300"
          >
            <ShoppingBag size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-500 text-ink text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center font-mono">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ open }: { open: boolean }) {
  return (
    <section className="relative pt-28 pb-10 md:pt-32 md:pb-14 px-4 sm:px-6 lg:px-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.18),transparent_60%)] pointer-events-none" />
      <div className="max-w-5xl mx-auto text-center">
        <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
          Bakery · Pickup &amp; Delivery
        </p>
        <h1 className="font-display italic text-[34px] sm:text-4xl md:text-6xl lg:text-[80px] text-cream leading-[1.05] mb-6">
          Order our breads <span className="gold-shimmer">to your door</span>
        </h1>
        <p className="font-body text-cream/65 max-w-xl mx-auto leading-relaxed mb-6">
          Our artisan loaves, bagels and focaccia — baked fresh each morning,
          packed for pickup or delivered across Hyderabad.
        </p>
        <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase">
          <span
            className={`relative flex w-2 h-2 ${open ? '' : 'opacity-50'}`}
            aria-hidden
          >
            {open && (
              <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-70 animate-ping" />
            )}
            <span
              className={`relative inline-flex w-2 h-2 rounded-full ${
                open ? 'bg-green-500' : 'bg-cream/30'
              }`}
            />
          </span>
          <Clock size={12} className="text-brand-500" />
          <span className={open ? 'text-green-400' : 'text-cream/65'}>
            {open ? 'Bakery open · 9 AM – 11 PM' : 'Bakery closed · opens 9 AM'}
          </span>
        </div>
      </div>
    </section>
  );
}

function ItemCard({ item }: { item: MenuItem }) {
  const quantity =
    useCart((s) => s.items.find((i) => i.id === item.id)?.quantity) ?? 0;
  const addItem = useCart((s) => s.addItem);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const [pulse, setPulse] = useState(false);

  const onAdd = () => {
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      is_veg: item.is_veg,
    });
    setPulse(true);
    setTimeout(() => setPulse(false), 450);
    toast.success(`${item.name} added`);
  };

  return (
    <article
      className={`group relative bg-obsidian-100 rounded-2xl overflow-hidden border border-brand-500/10 hover:border-brand-500/40 transition-all duration-500 flex flex-col md:hover:-translate-y-1 md:hover:shadow-[0_20px_45px_-20px_rgba(193,120,32,0.45)] ${
        pulse ? 'gold-pulse' : ''
      }`}
    >
      <div
        className="relative aspect-square w-full overflow-hidden"
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
          <span className="absolute inset-0 flex items-center justify-center font-display italic text-7xl text-brand-500/35 select-none">
            {item.name.charAt(0)}
          </span>
        )}
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
      </div>

      <div className="p-3 sm:p-5 flex flex-col flex-1 min-w-0">
        <h3 className="font-display italic text-base sm:text-xl text-cream leading-snug line-clamp-1">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-cream/75 text-[11px] sm:text-[12px] leading-snug mt-1 line-clamp-2">
            {item.description}
          </p>
        )}
        <div className="mt-auto pt-3 sm:pt-4 flex items-center justify-between gap-2 min-w-0">
          <span className="font-display text-lg sm:text-2xl leading-none text-brand-500 truncate">
            ₹{formatPrice(item.price)}
          </span>
          {quantity > 0 ? (
            <div className="flex items-center gap-0.5 sm:gap-1 bg-brand-500/10 border border-brand-500/40 rounded-full p-0.5 sm:p-1 flex-shrink-0">
              <button
                onClick={() => updateQuantity(item.id, quantity - 1)}
                aria-label="Decrease quantity"
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all text-base leading-none"
              >
                −
              </button>
              <span className="w-5 sm:w-6 text-center text-cream text-xs sm:text-sm font-mono">
                {quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.id, quantity + 1)}
                aria-label="Increase quantity"
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all text-base leading-none"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 border border-brand-500 text-brand-500 px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-full text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all duration-200 flex-shrink-0 whitespace-nowrap"
            >
              + Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-obsidian-100 rounded-2xl overflow-hidden border border-brand-500/10">
      <div className="aspect-square skeleton-sweep" />
      <div className="p-5 space-y-3">
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

function CartDrawer({
  open,
  onClose,
  onCheckout,
}: {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const subtotal = useCart(selectSubtotal);
  const total = useCart(selectGrandTotal);
  const cgst = subtotal * CGST_RATE;
  const sgst = subtotal * SGST_RATE;

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
          <h2 className="font-display italic text-3xl text-cream">Your Bakery Order</h2>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="w-10 h-10 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-cream/70 gap-3">
              <div className="w-14 h-14 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center">
                <ShoppingBag size={20} />
              </div>
              <p className="font-display italic text-xl">Your cart is empty</p>
              <p className="text-sm">Add a loaf or two to begin.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-start gap-3 pb-4 border-b border-brand-500/5"
                >
                  <div
                    className="w-14 h-14 rounded-xl flex-shrink-0 bg-cover bg-center"
                    style={{
                      backgroundImage: i.image_url ? `url(${i.image_url})` : undefined,
                      background: i.image_url
                        ? undefined
                        : 'linear-gradient(135deg, rgba(193,120,32,0.3), rgba(58,32,9,0.5))',
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
                        −
                      </button>
                      <span className="w-5 text-center text-cream text-xs font-mono">
                        {i.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(i.id, i.quantity + 1)}
                        aria-label="Increase"
                        className="w-6 h-6 rounded-full bg-obsidian text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeItem(i.id)}
                        aria-label="Remove"
                        className="ml-auto text-cream/60 hover:text-red-400 transition-colors text-xs font-mono tracking-wider"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="font-display text-lg text-brand-500 whitespace-nowrap">
                    ₹{formatPrice(i.price * i.quantity)}
                  </div>
                </li>
              ))}
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
              <Row label="Total (excl. delivery)" value={total} large />
            </div>
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 text-center">
              Pickup &amp; delivery confirmed at checkout
            </p>
            <button
              onClick={onCheckout}
              className="w-full bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300 inline-flex items-center justify-center gap-2"
            >
              Continue to Checkout
              <ArrowRight size={16} />
            </button>
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
        large
          ? 'text-cream text-lg font-display'
          : muted
            ? 'text-cream/70'
            : 'text-cream/80'
      }`}
    >
      <span>{label}</span>
      <span>₹{formatPrice(value)}</span>
    </div>
  );
}

function FulfillmentBadge() {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-12 mt-2 mb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-500/15 bg-obsidian-100/60">
          <span className="w-9 h-9 rounded-full border border-brand-500/40 text-brand-500 flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={15} />
          </span>
          <div>
            <p className="font-display italic text-lg text-cream leading-tight">
              Pickup
            </p>
            <p className="text-cream/75 text-xs mt-0.5">
              Walk in to your chosen branch — usually ready in 20 minutes.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-500/15 bg-obsidian-100/60">
          <span className="w-9 h-9 rounded-full border border-brand-500/40 text-brand-500 flex items-center justify-center flex-shrink-0">
            <Truck size={15} />
          </span>
          <div>
            <p className="font-display italic text-lg text-cream leading-tight">
              Delivery
            </p>
            <p className="text-cream/75 text-xs mt-0.5">
              We&apos;ll call to confirm your address and ETA. Hyderabad only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderOnline() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const cartBranchId = useCart((s) => s.branchId);
  const setTableInfo = useCart((s) => s.setTableInfo);
  const clearCart = useCart((s) => s.clearCart);
  const cartItems = useCart((s) => s.items);
  const totalItems = useCart(selectTotalItems);
  const customer = useCustomerAccess((s) => s.getCustomer());

  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [latestActiveOrderId, setLatestActiveOrderId] = useState<string | null>(
    null
  );

  const open = isBakeryOpen();

  // Load active branches once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      setBranches((data ?? []) as Branch[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Track in-flight orders for this customer's phone so the "Track order"
  // pill in the top bar stays available long after the order-success
  // page has closed. Polled every 20 s — same cadence as the Menu page.
  useEffect(() => {
    const phone = customer?.phone;
    if (!phone) {
      setActiveOrderCount(0);
      setLatestActiveOrderId(null);
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
      setActiveOrderCount(count ?? 0);
      setLatestActiveOrderId(data?.[0]?.id ?? null);
    };
    void fetchActive();
    const id = setInterval(fetchActive, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [customer?.phone]);

  // Default the cart branch to the first active branch if unset or invalid.
  // Important: do NOT clobber the cart's branchId on every mount — that would
  // erase a deliberate user choice. Only set when missing or stale.
  useEffect(() => {
    if (branches.length === 0) return;
    const valid = branches.some((b) => b.id === cartBranchId);
    if (!cartBranchId || !valid) {
      setTableInfo('', branches[0].id);
    }
  }, [branches, cartBranchId, setTableInfo]);

  // Load deliverable items for the chosen branch.
  useEffect(() => {
    if (!cartBranchId) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, categories(name, display_order)')
        .eq('branch_id', cartBranchId)
        .eq('is_available', true)
        .eq('is_deliverable', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (error) setLoadError(error.message);
      else setItems((data ?? []) as MenuItem[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [cartBranchId]);

  const onSelectBranch = (id: string) => {
    if (id === cartBranchId) return;
    // Switching branches: prices and availability differ, so the cart is no
    // longer guaranteed valid. Confirm before wiping.
    if (cartItems.length > 0) {
      const ok = window.confirm(
        'Changing branch will clear your cart (prices and availability differ per branch). Continue?'
      );
      if (!ok) return;
      clearCart();
    }
    setTableInfo('', id);
  };

  const proceedToCheckout = () => {
    if (cartItems.length === 0) {
      toast.error('Add something to your cart first');
      return;
    }
    setCartOpen(false);
    navigate('/order/checkout');
  };

  const visibleItems = useMemo(() => items ?? [], [items]);

  return (
    <div className="min-h-screen bg-obsidian text-cream">
      <TopBar
        branches={branches}
        selectedBranchId={cartBranchId}
        onSelectBranch={onSelectBranch}
        cartCount={totalItems}
        onOpenCart={() => setCartOpen(true)}
        activeOrderCount={activeOrderCount}
        latestActiveOrderId={latestActiveOrderId}
      />

      <Hero open={open} />
      <FulfillmentBadge />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 pb-32">
        {loadError ? (
          <div className="text-center py-20">
            <p className="font-display italic text-2xl text-cream mb-3">
              We couldn&apos;t load the bakery
            </p>
            <p className="text-cream/75 text-sm">{loadError}</p>
          </div>
        ) : items === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-display italic text-3xl text-cream mb-3">
              The shelves are bare today
            </p>
            <p className="text-cream/75 max-w-sm mx-auto">
              No deliverable items at this branch right now. Try another branch
              from the picker above, or check back tomorrow morning.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {visibleItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

      {totalItems > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          aria-label={`Open cart (${totalItems} items)`}
          className="md:hidden fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full bg-brand-500 text-ink flex items-center justify-center shadow-glow hover:scale-105 transition-transform"
        >
          <ShoppingBag size={22} />
          <span className="absolute -top-1 -right-1 bg-obsidian text-brand-500 border border-brand-500 text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center font-mono">
            {totalItems}
          </span>
        </button>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={proceedToCheckout}
      />
    </div>
  );
}
