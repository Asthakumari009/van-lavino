import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Clock, MapPin, ShoppingBag, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import RiderMap from '../components/RiderMap';
import type {
  Branch,
  FulfillmentType,
  OrderItemRow,
  OrderStatus,
  OrderWithItems,
} from '../types';

// ------------------------------------------------------------------
// Step model
// ------------------------------------------------------------------

interface Step {
  key: string;
  label: string;
  description: string;
  emoji: string;
  activeClass: string;
}

// Step copy varies per fulfillment channel — the same `served` status
// reads as "delivered" for delivery, "picked up" for pickup, "served"
// for dine-in. Builder takes the resolved branch name where useful.
function stepsFor(
  fulfillment: FulfillmentType,
  branchName: string | null
): Step[] {
  if (fulfillment === 'pickup') {
    return [
      {
        key: 'placed',
        label: 'Order Placed',
        description: "We've received your order.",
        emoji: '✅',
        activeClass: '',
      },
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        description: 'The bakery has accepted your order.',
        emoji: '⏳',
        activeClass: 'icon-hourglass',
      },
      {
        key: 'preparing',
        label: 'Being Prepared',
        description: 'Your bread is being packed fresh for pickup.',
        emoji: '🥖',
        activeClass: 'icon-chef',
      },
      {
        key: 'ready',
        label: 'Ready for Pickup',
        description: branchName
          ? `Walk in to collect at ${branchName}.`
          : 'Walk in to collect at your chosen branch.',
        emoji: '🛍️',
        activeClass: 'icon-bell',
      },
      {
        key: 'served',
        label: 'Picked Up',
        description: 'Hope you love it — see you soon.',
        emoji: '✨',
        activeClass: 'icon-sparkle',
      },
    ];
  }
  if (fulfillment === 'delivery') {
    return [
      {
        key: 'placed',
        label: 'Order Placed',
        description: "We've received your order.",
        emoji: '✅',
        activeClass: '',
      },
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        description: 'The bakery has accepted your order. We may call to confirm your address.',
        emoji: '⏳',
        activeClass: 'icon-hourglass',
      },
      {
        key: 'preparing',
        label: 'Being Prepared',
        description: 'Your bread is being packed for delivery.',
        emoji: '🥖',
        activeClass: 'icon-chef',
      },
      {
        key: 'ready',
        label: 'Packed & Ready',
        description: 'Sealed and waiting for the rider to pick it up.',
        emoji: '🛍️',
        activeClass: 'icon-bell',
      },
      {
        key: 'out_for_delivery',
        label: 'Out for Delivery',
        description: 'Your rider is on the way — track them on the map below.',
        emoji: '🚚',
        activeClass: 'icon-bell',
      },
      {
        key: 'served',
        label: 'Delivered',
        description: 'Hope you love it — thanks for ordering.',
        emoji: '✨',
        activeClass: 'icon-sparkle',
      },
    ];
  }
  // dine_in
  return [
    {
      key: 'placed',
      label: 'Order Placed',
      description: "We've received your order.",
      emoji: '✅',
      activeClass: '',
    },
    {
      key: 'confirmed',
      label: 'Order Confirmed',
      description: 'Kitchen has accepted your order.',
      emoji: '⏳',
      activeClass: 'icon-hourglass',
    },
    {
      key: 'preparing',
      label: 'Being Prepared',
      description: 'Our chefs are on it — crafting your order now.',
      emoji: '👨‍🍳',
      activeClass: 'icon-chef',
    },
    {
      key: 'ready',
      label: 'Ready to Serve',
      description: 'Staff is bringing it to your table.',
      emoji: '🍽️',
      activeClass: 'icon-bell',
    },
    {
      key: 'served',
      label: 'Served & Enjoyed',
      description: 'Bon appétit — enjoy every bite.',
      emoji: '✨',
      activeClass: 'icon-sparkle',
    },
  ];
}

// "5s ago", "20s ago", "2m ago" — kept very compact for the map caption.
function timeAgoShort(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function activeIndex(status: OrderStatus, fulfillment: FulfillmentType): number {
  // Delivery has a 6-step timeline; pickup/dine-in stay at 5. The new
  // `out_for_delivery` status sits between `ready` (packed) and
  // `served` (handed over) and only appears for delivery orders.
  if (fulfillment === 'delivery') {
    switch (status) {
      case 'pending':
        return 0;
      case 'confirmed':
        return 1;
      case 'preparing':
        return 2;
      case 'ready':
        return 3;
      case 'out_for_delivery':
        return 4;
      case 'served':
        return 5;
      default:
        return 0;
    }
  }
  switch (status) {
    case 'pending':
      return 0;
    case 'confirmed':
      return 1;
    case 'preparing':
      return 2;
    case 'ready':
      return 3;
    case 'served':
      return 4;
    default:
      return 0;
  }
}

function estimateWait(status: OrderStatus, fulfillment: FulfillmentType): string {
  if (status === 'cancelled') return 'Order cancelled';
  if (status === 'pending' || status === 'confirmed') return '15–20 mins';
  if (status === 'preparing') return '5–12 mins';
  if (status === 'ready') {
    if (fulfillment === 'pickup') return 'Ready for pickup';
    if (fulfillment === 'delivery') return 'Packed · waiting for rider';
    return 'Coming to your table';
  }
  if (status === 'out_for_delivery') return 'Rider on the way';
  if (status === 'served') {
    if (fulfillment === 'pickup') return 'Picked up · enjoy';
    if (fulfillment === 'delivery') return 'Delivered · enjoy';
    return 'Enjoy your meal';
  }
  return '—';
}

// ------------------------------------------------------------------
// Chime (soft two-note via Web Audio API)
// ------------------------------------------------------------------

function playReadyChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [523.25, 659.25]; // C5, E5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  } catch (err) {
    console.warn('[chime] play failed', err);
  }
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function OrderTracking() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order') ?? '';

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const prevStatusRef = useRef<OrderStatus | null>(null);

  // Initial fetch.
  useEffect(() => {
    if (!orderId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setOrder(data as OrderWithItems);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Look up branch — needed for the pickup/delivery pill and the
  // "Ready for Pickup at <branch>" step copy.
  useEffect(() => {
    if (!order?.branch_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('id', order.branch_id!)
        .maybeSingle();
      if (!cancelled && data) setBranch(data as Branch);
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.branch_id]);

  // Realtime subscription.
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder((prev) => {
            const next = payload.new as OrderWithItems;
            // payload doesn't include nested order_items; preserve them.
            return {
              ...next,
              order_items: prev?.order_items ?? next.order_items ?? [],
            };
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // React to status transitions (chime + celebration), skipping the very
  // first render so a returning user isn't re-notified for old state.
  useEffect(() => {
    if (!order) return;
    const prev = prevStatusRef.current;
    if (prev !== null && prev !== order.status) {
      if (order.status === 'ready') {
        playReadyChime();
        const readyMsg =
          order.fulfillment_type === 'pickup'
            ? `🛍️ Your order is ready for pickup${branch?.name ? ` at ${branch.name}` : ''}.`
            : order.fulfillment_type === 'delivery'
              ? '📦 Your order is packed — waiting for the rider.'
              : '🍽️ Your order is ready! The staff will serve you shortly.';
        toast.success(readyMsg, { duration: 6000 });
      }
      if (order.status === 'out_for_delivery') {
        playReadyChime();
        toast.success('🚚 Your rider is on the way — track them on the map.', {
          duration: 6000,
        });
      }
      if (order.status === 'served') {
        setCelebrating(true);
        window.setTimeout(() => setCelebrating(false), 4000);
      }
    }
    prevStatusRef.current = order.status;
  }, [order, branch]);

  // The footer "order something else" CTA points back to the channel the
  // customer came from — table menu for dine-in, bakery catalog for online.
  const backUrl = useMemo(() => {
    if (!order) return '/menu';
    if (order.fulfillment_type === 'pickup' || order.fulfillment_type === 'delivery') {
      return '/order';
    }
    const params = new URLSearchParams();
    if (order.branch_id) params.set('branch', order.branch_id);
    if (order.table_number) params.set('table', order.table_number);
    const qs = params.toString();
    return qs ? `/menu?${qs}` : '/menu';
  }, [order]);

  const backLabel =
    order?.fulfillment_type === 'pickup' || order?.fulfillment_type === 'delivery'
      ? 'Order more bread →'
      : 'Order something else →';

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center">
        <span className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase animate-pulse">
          Loading your order…
        </span>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
            Not Found
          </p>
          <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-6">
            We couldn't find that order.
          </h1>
          <Link
            to="/"
            className="inline-block border border-brand-500 text-brand-500 px-6 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const fulfillment: FulfillmentType = order.fulfillment_type ?? 'dine_in';
  const currentIdx = activeIndex(order.status, fulfillment);
  const cancelled = order.status === 'cancelled';
  const steps = stepsFor(fulfillment, branch?.name ?? null);
  // Show the live tracking map for any delivery order that's at least
  // dispatched (out_for_delivery) — even before the rider has shared
  // their first GPS fix. The bakery's branch coords act as the origin
  // pin so the map is meaningful immediately; the rider pin appears
  // as soon as they grant location.
  const isInTransit =
    fulfillment === 'delivery' &&
    (order.status === 'out_for_delivery' || order.status === 'served');
  const hasRiderPosition =
    order.rider_lat != null && order.rider_lng != null;
  const hasBranchOrigin =
    branch?.lat != null && branch?.lng != null;
  const hasDestination =
    order.delivery_lat != null && order.delivery_lng != null;
  const showMap = isInTransit && (hasRiderPosition || hasBranchOrigin || hasDestination);

  return (
    <div className="min-h-screen bg-obsidian text-cream relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.18),transparent_60%)] pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-5 md:px-6 py-8 md:py-12">
        <header className="flex items-center justify-between mb-8 gap-4">
          <Link
            to="/"
            className="font-display italic text-xl md:text-2xl text-brand-500 tracking-[0.2em]"
          >
            VAN LAVINO
          </Link>
          <ChannelPill order={order} branchName={branch?.name ?? null} />
        </header>

        <div className="mb-8">
          <p className="font-mono text-[11px] text-brand-500 tracking-[0.35em] uppercase mb-2">
            Order #{order.id.slice(-6).toUpperCase()}
          </p>
          <h1 className="font-display italic text-4xl md:text-5xl leading-tight text-cream">
            Track Your Order
          </h1>
          <div className="mt-4 inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/25 text-brand-600 rounded-full px-4 py-2 text-xs md:text-sm font-mono tracking-wider">
            <Clock size={14} />
            {estimateWait(order.status, fulfillment)}
          </div>
        </div>

        {fulfillment === 'delivery' && order.delivery_address && (
          <DeliveryAddressBanner order={order} />
        )}

        {cancelled ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <p className="font-display italic text-3xl text-red-300 mb-2">
              This order was cancelled.
            </p>
            <p className="text-cream/60">Please place a new order to continue.</p>
          </div>
        ) : (
          <Timeline currentIdx={currentIdx} steps={steps} />
        )}

        {showMap && (
          <section className="mt-10">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500 inline-flex items-center gap-2">
                <Truck size={12} />
                {hasRiderPosition ? 'Live · rider on the way' : 'Rider dispatched'}
              </p>
              {order.rider_updated_at && hasRiderPosition && (
                <span className="font-mono text-[10px] tracking-wider text-cream/75">
                  Updated {timeAgoShort(order.rider_updated_at)}
                </span>
              )}
            </div>
            <RiderMap
              rider={
                hasRiderPosition
                  ? {
                      lat: order.rider_lat as number,
                      lng: order.rider_lng as number,
                      label: 'Rider',
                    }
                  : null
              }
              origin={
                hasBranchOrigin
                  ? {
                      lat: branch!.lat as number,
                      lng: branch!.lng as number,
                      label: branch?.name ?? 'Bakery',
                    }
                  : null
              }
              destination={
                hasDestination
                  ? {
                      lat: order.delivery_lat as number,
                      lng: order.delivery_lng as number,
                      label: 'You',
                    }
                  : null
              }
              className="w-full h-[320px] md:h-[380px]"
            />
            {!hasRiderPosition && (
              <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 flex items-center gap-3">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-amber-400 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-500" />
                </span>
                <p className="text-cream/85 text-sm leading-snug flex-1">
                  Your rider has the bag and is on the way. The live pin
                  appears as soon as they accept location sharing.
                </p>
              </div>
            )}
          </section>
        )}

        <ItemsSection
          open={itemsOpen}
          onToggle={() => setItemsOpen((o) => !o)}
          order={order}
        />

        <div className="mt-10 flex justify-center">
          <Link
            to={backUrl}
            className="inline-flex items-center gap-2 border border-brand-500/40 text-brand-500 rounded-full px-6 py-3 text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
          >
            {backLabel}
          </Link>
        </div>
      </div>

      {celebrating && <Celebration />}
    </div>
  );
}

// ------------------------------------------------------------------
// Channel pill (top-right) — replaces the dine-in-only "Table X" pill
// with a channel-aware version that calls out pickup/delivery and the
// branch when applicable.
// ------------------------------------------------------------------

function ChannelPill({
  order,
  branchName,
}: {
  order: OrderWithItems;
  branchName: string | null;
}) {
  if (order.fulfillment_type === 'pickup') {
    return (
      <span className="inline-flex items-center gap-1.5 border border-brand-500/50 text-brand-600 px-4 py-1.5 rounded-full text-xs md:text-sm font-mono tracking-wider">
        <ShoppingBag size={13} />
        Pickup{branchName ? ` · ${branchName}` : ''}
      </span>
    );
  }
  if (order.fulfillment_type === 'delivery') {
    return (
      <span className="inline-flex items-center gap-1.5 border border-amber-500/60 text-amber-300 px-4 py-1.5 rounded-full text-xs md:text-sm font-mono tracking-wider">
        <Truck size={13} />
        Delivery
      </span>
    );
  }
  if (order.table_number) {
    return (
      <span className="border border-brand-500/50 text-brand-600 px-4 py-1.5 rounded-full text-xs md:text-sm font-mono tracking-wider">
        Table {order.table_number}
      </span>
    );
  }
  return null;
}

// ------------------------------------------------------------------
// Delivery address banner — surfaces the address inline on the
// tracking page so the customer can verify what we've got while
// the order is in flight.
// ------------------------------------------------------------------

function DeliveryAddressBanner({ order }: { order: OrderWithItems }) {
  return (
    <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center flex-shrink-0">
          <MapPin size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-amber-300 mb-1">
            Delivering to
          </p>
          <p className="text-cream/90 text-sm leading-snug whitespace-pre-wrap">
            {order.delivery_address}
          </p>
          {(order.delivery_landmark || order.delivery_pincode) && (
            <p className="font-mono text-[11px] text-cream/60 mt-1 tracking-wider">
              {order.delivery_landmark}
              {order.delivery_landmark && order.delivery_pincode ? ' · ' : ''}
              {order.delivery_pincode}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Timeline
// ------------------------------------------------------------------

function Timeline({
  currentIdx,
  steps,
}: {
  currentIdx: number;
  steps: Step[];
}) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const state: 'done' | 'active' | 'future' =
          i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'future';
        const isLast = i === steps.length - 1;
        return (
          <li key={step.key} className="flex gap-5 pb-8 last:pb-0 relative">
            {/* Connector line (behind node) */}
            {!isLast && (
              <span
                className={`absolute left-[22px] top-12 bottom-0 w-[2px] ${
                  state === 'future'
                    ? 'bg-brand-500/10'
                    : 'bg-brand-500/60'
                }`}
              />
            )}

            {/* Node */}
            <span
              className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center text-lg border-2 transition-all duration-500 flex-shrink-0 ${
                state === 'done'
                  ? 'bg-brand-500 border-brand-500 text-ink shadow-glow'
                  : state === 'active'
                    ? 'bg-brand-500/15 border-brand-500 text-brand-600 animate-pulse'
                    : 'bg-obsidian-100 border-brand-500/15 text-cream/70'
              }`}
            >
              <span className={state === 'active' ? step.activeClass : ''}>
                {state === 'done' ? '✓' : step.emoji}
              </span>
            </span>

            {/* Copy */}
            <div
              className={`flex-1 pt-1 transition-all duration-500 ${
                state === 'future' ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <p
                className={`font-display leading-tight ${
                  state === 'active'
                    ? 'text-2xl md:text-[28px] text-brand-500'
                    : 'text-xl md:text-2xl text-cream'
                }`}
              >
                {step.label}
              </p>
              {state === 'active' && (
                <p className="text-cream/70 text-sm md:text-base mt-1.5 leading-snug">
                  {step.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------
// Items collapsible
// ------------------------------------------------------------------

function ItemsSection({
  order,
  open,
  onToggle,
}: {
  order: OrderWithItems;
  open: boolean;
  onToggle: () => void;
}) {
  const items: OrderItemRow[] = order.order_items ?? [];
  return (
    <section className="mt-10 bg-obsidian-100 border border-brand-500/15 rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-obsidian-50 transition-colors"
      >
        <div>
          <p className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase mb-1">
            Your Order · {items.length} item{items.length === 1 ? '' : 's'}
          </p>
          <p className="font-display italic text-xl text-cream">
            ₹{Number(order.total ?? 0).toFixed(2)}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`text-brand-500 transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-brand-500/10 p-5 space-y-3 animate-in">
          {items.length === 0 ? (
            <p className="text-cream/70 italic">No items recorded.</p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="text-cream">
                    <span className="text-brand-500 font-semibold mr-2">
                      {i.quantity}×
                    </span>
                    {i.item_name}
                  </span>
                  <span className="font-mono text-cream/70 whitespace-nowrap">
                    ₹{Number(i.total_price ?? i.unit_price * i.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {order.customer_note && (
            <div className="pt-3 border-t border-brand-500/10">
              <p className="font-mono text-[10px] text-amber-400 tracking-[0.25em] uppercase mb-1">
                📝 Your Note
              </p>
              <p className="text-cream/70 italic text-sm leading-snug">
                "{order.customer_note}"
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// Celebration overlay
// ------------------------------------------------------------------

const CONFETTI_COLORS = ['#c17820', '#e2b066', '#7d4a14', '#d4903a', '#1c1510'];
const CONFETTI_COUNT = 36;

function Celebration() {
  const pieces = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 1.8;
      const duration = 2.6 + Math.random() * 2;
      const drift = (Math.random() - 0.5) * 240;
      const spin = 360 + Math.random() * 720;
      const color =
        CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const width = 8 + Math.round(Math.random() * 6);
      const height = 12 + Math.round(Math.random() * 8);
      return {
        id: i,
        left,
        delay,
        duration,
        drift,
        spin,
        color,
        width,
        height,
      };
    });
  }, []);

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              backgroundColor: p.color,
              width: `${p.width}px`,
              height: `${p.height}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              ['--drift' as string]: `${p.drift}px`,
              ['--spin' as string]: `${p.spin}deg`,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-center px-6">
        <div className="celebration-title">
          <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
            Served
          </p>
          <h2
            className="font-display italic text-cream leading-tight"
            style={{ fontSize: 'clamp(32px, 8vw, 48px)' }}
          >
            Enjoy your meal! <span className="inline-block">🥂</span>
          </h2>
        </div>
      </div>
    </div>
  );
}
