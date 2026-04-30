import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BookOpenCheck,
  Check,
  Download,
  Flame,
  History,
  LayoutGrid,
  LogOut,
  MapPin,
  Monitor,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  Truck,
  UserX,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { initiatePayment } from '../lib/razorpay';
import { generateReceipt } from '../components/ReceiptGenerator';
import { summariseItems, timeAgo } from '../lib/format';
import type {
  Branch,
  MenuItem,
  OrderStatus,
  OrderWithItems,
  PaymentStatus,
  Reservation,
  ReservationStatus,
  RestaurantTable,
  Staff,
} from '../types';

// ============================================================
// Root
// ============================================================

type View = 'live' | 'manual' | 'history' | 'tables' | 'kd' | 'reservations';

export default function StaffDashboard() {
  const staffRecord = useAuth((s) => s.staffRecord);
  const signOut = useAuth((s) => s.signOut);
  const [view, setView] = useState<View>('live');
  const [branch, setBranch] = useState<Branch | null>(null);

  const branchId = staffRecord?.branch_id ?? null;

  useEffect(() => {
    if (!branchId) return;
    supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .maybeSingle()
      .then(({ data }) => setBranch((data as Branch | null) ?? null));
  }, [branchId]);

  if (!staffRecord || !branchId) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6">
        <p className="text-center text-cream/60 max-w-md">
          Your staff profile is missing a branch assignment. Please contact an
          admin.
        </p>
      </div>
    );
  }

  const onSignOut = async () => {
    // Fire signOut in the background. We do NOT await it before
    // redirecting — supabase.auth.signOut() occasionally hangs on a slow
    // network and was leaving the sidebar button feeling unresponsive
    // (the user would click 2–3 times and then refresh). The
    // window.location.replace below tears down the page regardless;
    // initialize() on the freshly-loaded /login picks up the cleared
    // session.
    void signOut().catch(() => {
      /* network error during signOut isn't fatal — the local session is
       * already wiped by the store's set, and the server will time the
       * token out on its own. */
    });
    window.location.replace('/login');
  };

  return (
    <div className="min-h-screen bg-obsidian text-cream">
      <Sidebar
        active={view}
        onChange={setView}
        staff={staffRecord}
        branch={branch}
        onSignOut={onSignOut}
      />
      <main className="md:ml-[260px] min-h-screen">
        {view === 'live' && <LiveOrders branchId={branchId} />}
        {view === 'manual' && (
          <ManualOrder branchId={branchId} staffName={staffRecord.name} />
        )}
        {view === 'history' && <OrderHistory branchId={branchId} />}
        {view === 'tables' && <TableStatus branchId={branchId} />}
        {view === 'kd' && <KitchenDisplay branchId={branchId} />}
        {view === 'reservations' && <Reservations branchId={branchId} />}
      </main>
    </div>
  );
}

// ============================================================
// Sidebar
// ============================================================

const NAV: { key: View; label: string; Icon: typeof Flame }[] = [
  { key: 'live', label: 'Live Orders', Icon: Flame },
  { key: 'kd', label: 'Kitchen Display (KD)', Icon: Monitor },
  { key: 'reservations', label: 'Reservations', Icon: BookOpenCheck },
  { key: 'manual', label: 'New Manual Order', Icon: Plus },
  { key: 'history', label: 'Order History', Icon: History },
  { key: 'tables', label: 'Table Status', Icon: LayoutGrid },
];

function Sidebar({
  active,
  onChange,
  staff,
  branch,
  onSignOut,
}: {
  active: View;
  onChange: (v: View) => void;
  staff: Staff;
  branch: Branch | null;
  onSignOut: () => void;
}) {
  return (
    <aside className="fixed top-0 left-0 z-40 h-full w-[260px] bg-obsidian-100 border-r border-brand-500/10 hidden md:flex flex-col">
      <div className="p-6 border-b border-brand-500/10">
        <Link
          to="/"
          className="font-display italic text-xl text-brand-500 tracking-[0.2em]"
        >
          VAN LAVINO
        </Link>
        <p className="font-mono text-[10px] text-cream/60 tracking-[0.3em] uppercase mt-2">
          Staff Console
        </p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1 scrollbar-hide">
        {NAV.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-brand-500/15 text-brand-600 border border-brand-500/30'
                  : 'text-cream/70 hover:text-brand-600 hover:bg-obsidian-50 border border-transparent'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-shrink-0 px-4 py-3 border-t border-brand-500/10">
        <p className="text-[10px] text-cream/70 uppercase tracking-[0.3em] font-mono mb-0.5">
          Signed in
        </p>
        <p className="text-cream font-display text-base italic truncate">
          {staff.name || 'Staff'}
        </p>
        <p className="text-[10px] text-cream/70 mb-3 truncate font-mono tracking-wider uppercase">
          {branch?.name ?? 'Branch'} · {staff.role}
        </p>
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 border border-brand-500/30 text-brand-500 rounded-full py-2 text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ============================================================
// Live Orders (Kanban + realtime)
// ============================================================

const ACTIVE_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'served',
];

// Lightweight summary of an in-flight rider trip, passed through the
// kanban so DispatchRiderControl can offer "Add to trip".
interface TripSummary {
  token: string;
  firstLabel: string;
  stopCount: number;
}

// Pickup + dine-in: ready → served. Delivery uses an extra step
// (ready → out_for_delivery → served), but that transition is dispatched
// via the Dispatch button which mints a rider token and is handled out
// of band; here we just provide "Mark Served" as the safety-net action.
const NEXT_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  pending: { next: 'confirmed', label: 'Confirm →' },
  confirmed: { next: 'preparing', label: 'Mark Preparing' },
  preparing: { next: 'ready', label: 'Mark Ready' },
  ready: { next: 'served', label: 'Mark Served' },
  out_for_delivery: { next: 'served', label: 'Mark Delivered' },
};

function LiveOrders({ branchId }: { branchId: string }) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // triggers "time ago" re-render

  const fetchActive = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('branch_id', branchId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false });
    // Always lift the loading state, even on error — otherwise a transient
    // error on the first fetch leaves the kanban stuck on "Loading…" until
    // a manual refresh.
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrders((data ?? []) as OrderWithItems[]);
  }, [branchId]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-live-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${branchId}`,
        },
        () => fetchActive()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, fetchActive]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => {
    const m: Record<OrderStatus, OrderWithItems[]> = {
      pending: [],
      confirmed: [],
      preparing: [],
      ready: [],
      out_for_delivery: [],
      served: [],
      cancelled: [],
    };
    for (const o of orders) m[o.status].push(o);
    return m;
  }, [orders]);

  // Compute the in-flight rider trips visible to this branch — fed
  // into DispatchRiderControl so staff can attach a freshly-ready
  // delivery to a trip a rider is already on.
  const activeTrips = useMemo<TripSummary[]>(() => {
    const map = new Map<string, OrderWithItems[]>();
    for (const o of orders) {
      if (
        o.fulfillment_type === 'delivery' &&
        o.rider_token &&
        o.status === 'out_for_delivery'
      ) {
        const list = map.get(o.rider_token) ?? [];
        list.push(o);
        map.set(o.rider_token, list);
      }
    }
    return Array.from(map.entries()).map(([token, ords]) => {
      const sorted = [...ords].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return {
        token,
        firstLabel:
          sorted[0]?.delivery_landmark ||
          sorted[0]?.delivery_address?.split(/[,\n]/)[0]?.trim() ||
          `#${sorted[0]?.id.slice(-6).toUpperCase()}`,
        stopCount: sorted.length,
      };
    });
  }, [orders]);

  const advance = async (order: OrderWithItems) => {
    const next = NEXT_ACTION[order.status]?.next;
    if (!next) return;
    // Optimistic: move the card to the next column immediately so the
    // operator sees their click landed. Realtime fetchActive() will
    // reconcile in ~1s; if the DB update fails we roll back below.
    const previousStatus = order.status;
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: next } : o))
    );
    const { error } = await supabase
      .from('orders')
      .update({ status: next })
      .eq('id', order.id);
    if (error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: previousStatus } : o
        )
      );
      toast.error(error.message);
      return;
    }
    toast.success(`Order #${order.id.slice(-6)} → ${next}`);
  };

  return (
    <div className="p-6 md:p-10">
      <header className="flex items-center gap-4 mb-10">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream">
          Live Orders
        </h1>
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-green-400" />
          </span>
          <span className="font-mono text-[11px] text-green-400 tracking-[0.3em] uppercase">
            Live
          </span>
        </div>
      </header>

      {loading ? (
        <p className="text-cream/70">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {ACTIVE_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              orders={grouped[status]}
              onAdvance={advance}
              tick={tick}
              activeTrips={activeTrips}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  orders,
  onAdvance,
  tick,
  activeTrips,
}: {
  status: OrderStatus;
  orders: OrderWithItems[];
  onAdvance: (o: OrderWithItems) => void;
  tick: number;
  activeTrips: TripSummary[];
}) {
  return (
    <div className="bg-obsidian-100 rounded-2xl border border-brand-500/10 p-4 min-h-[200px] flex flex-col">
      <header className="flex items-center justify-between mb-4 px-1">
        <h3 className="font-mono text-xs text-brand-500 uppercase tracking-[0.3em]">
          {status}
        </h3>
        <span className="bg-brand-500/20 text-brand-600 text-[10px] font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center">
          {orders.length}
        </span>
      </header>
      <div className="space-y-3 flex-1 overflow-y-auto">
        {orders.length === 0 ? (
          <p className="text-cream/70 text-xs italic text-center py-6">
            Nothing here yet
          </p>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id + tick}
              order={o}
              onAdvance={onAdvance}
              activeTrips={activeTrips}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FulfillmentPill({ order }: { order: OrderWithItems }) {
  if (order.fulfillment_type === 'pickup') {
    return (
      <span className="inline-flex items-center gap-1 border border-brand-500/40 bg-brand-500/10 text-brand-600 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
        <ShoppingBag size={10} />
        Pickup
      </span>
    );
  }
  if (order.fulfillment_type === 'delivery') {
    if (order.status === 'out_for_delivery') {
      return (
        <span className="inline-flex items-center gap-1 border border-amber-500/60 bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
          <Truck size={10} />
          On the way
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 border border-amber-500/50 bg-amber-500/15 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
        <Truck size={10} />
        Delivery
      </span>
    );
  }
  return (
    <span className="border border-cream/20 text-cream/80 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
      T{order.table_number ?? '—'}
    </span>
  );
}

function DeliveryAddressBlock({ order }: { order: OrderWithItems }) {
  if (order.fulfillment_type !== 'delivery' || !order.delivery_address) {
    return null;
  }
  return (
    <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <MapPin size={11} className="text-amber-400" />
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-400">
          Delivery address
        </p>
      </div>
      <p className="text-cream/90 text-[12px] leading-snug whitespace-pre-wrap">
        {order.delivery_address}
      </p>
      {(order.delivery_landmark || order.delivery_pincode) && (
        <p className="font-mono text-[10px] text-cream/75 mt-1 tracking-wider">
          {order.delivery_landmark}
          {order.delivery_landmark && order.delivery_pincode ? ' · ' : ''}
          {order.delivery_pincode}
        </p>
      )}
      {order.customer_phone && (
        <a
          href={`tel:+91${order.customer_phone}`}
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-amber-300 hover:text-amber-200"
        >
          📞 +91 {order.customer_phone}
        </a>
      )}
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
  activeTrips,
}: {
  order: OrderWithItems;
  onAdvance: (o: OrderWithItems) => void;
  activeTrips: TripSummary[];
}) {
  const action = NEXT_ACTION[order.status];
  const itemsText = summariseItems(order.order_items);
  return (
    <article className="bg-obsidian-50 border border-brand-500/10 rounded-xl p-4 hover:border-brand-500/30 transition-colors">
      <header className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-brand-500">
          #{order.id.slice(-6).toUpperCase()}
        </span>
        <FulfillmentPill order={order} />
      </header>
      <p className="text-cream text-sm leading-snug line-clamp-2 mb-3">
        {itemsText || <span className="italic text-cream/70">No items</span>}
      </p>
      <DeliveryAddressBlock order={order} />
      {order.customer_note && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2">
          <span className="text-brand-500 text-sm leading-none mt-[1px]">📝</span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-400 mb-0.5">
              Kitchen Note
            </p>
            <p className="font-body italic text-[12px] text-cream/80 leading-snug">
              "{order.customer_note}"
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <span className="font-display text-lg text-brand-500">
          ₹{Number(order.total ?? 0).toFixed(2)}
        </span>
        <PaymentPill status={order.payment_status} />
      </div>
      {order.fulfillment_type === 'delivery' && (
        <DispatchRiderControl order={order} activeTrips={activeTrips} />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-cream/60 uppercase tracking-wider">
          {timeAgo(order.created_at)}
        </span>
        <div className="flex items-center gap-2">
          <ReceiptButton order={order} />
          {action && (
            <button
              onClick={() => onAdvance(order)}
              className="bg-brand-500/10 border border-brand-500/40 text-brand-500 text-[11px] uppercase tracking-[0.2em] font-mono px-3 py-1.5 rounded-full hover:bg-brand-500 hover:text-ink transition-all whitespace-nowrap"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// Inline control on every delivery order. Three states:
//   - Not yet dispatched + active trips exist → "Dispatch ▾" splits into
//     "New trip" or "Add to <existing>" so a rider already on the road
//     can pick up additional orders.
//   - Not yet dispatched, no active trips → simple "Dispatch" button.
//   - Already dispatched → "Show link" re-opens the modal.
function DispatchRiderControl({
  order,
  activeTrips,
}: {
  order: OrderWithItems;
  activeTrips: TripSummary[];
}) {
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [link, setLink] = useState<string | null>(
    order.rider_token
      ? `${window.location.origin}/rider/${order.rider_token}`
      : null
  );

  // Settled: served or cancelled. No point dispatching.
  if (order.status === 'served' || order.status === 'cancelled') return null;

  async function dispatchRider() {
    setBusy(true);
    // Mint locally and open the modal immediately. The DB UPDATE runs
    // in parallel — earlier we awaited it before showing the link,
    // which made the dispatch button feel unresponsive. The token is
    // valid the moment we mint it; the only thing the UPDATE buys
    // server-side is the rider_token<->order binding, and even if the
    // network is slow, the modal already shows the URL so staff can
    // start sharing.
    const token =
      order.rider_token ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));

    const url = `${window.location.origin}/rider/${token}`;
    setLink(url);
    setLinkOpen(true);

    // Best-effort clipboard write — fires before the network round-trip
    // so a fast hand can paste into WhatsApp without waiting.
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard fails in some contexts; modal still shows the URL */
    }

    // Persist the binding + status flip. If this fails we surface the
    // error and roll the modal back so staff doesn't share a link the
    // server doesn't know about.
    if (!order.rider_token) {
      const { error } = await supabase
        .from('orders')
        .update({
          rider_token: token,
          status: 'out_for_delivery' as OrderStatus,
        })
        .eq('id', order.id);
      if (error) {
        toast.error(`Dispatch failed: ${error.message}`);
        setLinkOpen(false);
        setLink(null);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
  }

  // Attach this order to an existing trip so the rider already on the
  // road picks up one more bag instead of getting a fresh link.
  async function attachToTrip(trip: TripSummary) {
    setMenuOpen(false);
    setBusy(true);
    setLink(`${window.location.origin}/rider/${trip.token}`);
    const { error } = await supabase
      .from('orders')
      .update({
        rider_token: trip.token,
        status: 'out_for_delivery' as OrderStatus,
      })
      .eq('id', order.id);
    setBusy(false);
    if (error) {
      toast.error(`Could not attach: ${error.message}`);
      setLink(null);
      return;
    }
    toast.success(`Added to ${trip.firstLabel} trip`);
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed — long-press the link to copy manually');
    }
  }

  const dispatched = !!order.rider_token || !!link;
  const otherTrips = activeTrips.filter((t) => t.token !== order.rider_token);
  const showSplitMenu = !dispatched && otherTrips.length > 0;
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 relative">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-400 mb-0.5">
            Rider
          </p>
          <p className="font-body text-[12px] text-cream/80 leading-snug">
            {dispatched
              ? order.status === 'out_for_delivery'
                ? 'Out for delivery · share the link with your rider.'
                : 'Link minted · share with your rider.'
              : showSplitMenu
                ? 'Dispatch as a new trip, or hand off to a rider already on the road.'
                : 'Hand the bag to the rider, then dispatch to share the live link.'}
          </p>
        </div>
        {dispatched ? (
          <button
            onClick={() => setLinkOpen(true)}
            disabled={busy}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono bg-amber-500 text-ink hover:bg-amber-400 transition disabled:opacity-50"
          >
            <Truck size={12} />
            Show link
          </button>
        ) : showSplitMenu ? (
          <button
            onClick={() => setMenuOpen((o) => !o)}
            disabled={busy}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono bg-amber-500 text-ink hover:bg-amber-400 transition disabled:opacity-50"
          >
            <Truck size={12} />
            Dispatch ▾
          </button>
        ) : (
          <button
            onClick={dispatchRider}
            disabled={busy}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono bg-amber-500 text-ink hover:bg-amber-400 transition disabled:opacity-50"
          >
            <Truck size={12} />
            Dispatch
          </button>
        )}

        {menuOpen && (
          <div
            className="absolute right-2 top-full mt-1 z-30 w-60 bg-obsidian-50 border border-amber-500/40 rounded-2xl shadow-luxury overflow-hidden"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                void dispatchRider();
              }}
              className="w-full text-left px-4 py-3 hover:bg-amber-500/15 transition border-b border-brand-500/10"
            >
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-amber-400 mb-0.5">
                New trip
              </p>
              <p className="text-cream/85 text-sm">Mint a fresh link for a new rider</p>
            </button>
            <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-cream/65 px-4 pt-3 pb-1">
              Add to in-flight trip
            </p>
            {otherTrips.map((t) => (
              <button
                key={t.token}
                onClick={() => attachToTrip(t)}
                className="w-full text-left px-4 py-2.5 hover:bg-brand-500/10 transition"
              >
                <p className="text-cream/90 text-sm leading-tight truncate">
                  {t.firstLabel}
                </p>
                <p className="font-mono text-[10px] tracking-wider text-cream/75">
                  {t.stopCount} stop{t.stopCount === 1 ? '' : 's'} on the way
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {linkOpen && link && (
        <RiderLinkModal
          link={link}
          onCopy={copyLink}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </>
  );
}

function RiderLinkModal({
  link,
  onCopy,
  onClose,
}: {
  link: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  // WhatsApp deep-link with a pre-filled rider message — works on phones
  // and falls back to the desktop site otherwise.
  const waText = encodeURIComponent(
    `Van Lavino delivery — your live tracking link: ${link}`
  );
  const waHref = `https://wa.me/?text=${waText}`;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-obsidian-100 border border-amber-500/40 rounded-2xl shadow-luxury overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-brand-500/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Truck size={15} />
            </span>
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-amber-400">
                Rider link
              </p>
              <p className="font-display italic text-lg text-cream leading-tight">
                Send to your rider
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-cream/20 text-cream/65 hover:border-red-500/40 hover:text-red-400 flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-cream/65 text-sm leading-relaxed">
            Open this URL on the rider&apos;s phone — they grant
            location once and the customer sees a live map.
          </p>
          <div className="bg-obsidian rounded-xl border border-brand-500/15 px-3 py-3 break-all font-mono text-[12px] text-cream/85 select-all">
            {link}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onCopy}
              className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 bg-brand-500 text-ink py-2.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition"
            >
              Copy link
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 border border-amber-500/40 text-amber-300 py-2.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-amber-500/10 transition"
            >
              Send via WhatsApp
            </a>
          </div>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 text-center">
            Tip: keep this open until the rider has the page loaded.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReceiptButton({
  order,
  small = true,
}: {
  order: OrderWithItems;
  small?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await generateReceipt(order, order.order_items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Download receipt"
      aria-label="Download receipt"
      className={`rounded-full border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-ink transition-all disabled:opacity-50 flex items-center justify-center ${
        small ? 'w-8 h-8' : 'w-10 h-10'
      }`}
    >
      <Receipt size={small ? 14 : 16} />
    </button>
  );
}

function PaymentPill({ status }: { status: PaymentStatus }) {
  const style = {
    paid: 'bg-green-500/15 border-green-500/30 text-green-400',
    cash: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    unpaid: 'bg-red-500/15 border-red-500/30 text-red-400',
  }[status];
  const label = { paid: 'Paid', cash: 'Cash', unpaid: 'Unpaid' }[status];
  return (
    <span
      className={`border rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${style}`}
    >
      {label}
    </span>
  );
}

// ============================================================
// Manual Order
// ============================================================

interface ManualCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

function ManualOrder({
  branchId,
  staffName,
}: {
  branchId: string;
  staffName: string | null;
}) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tableNumber, setTableNumber] = useState('');
  const [cart, setCart] = useState<ManualCartItem[]>([]);
  const [payment, setPayment] = useState<'razorpay' | 'cash'>('cash');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from('restaurant_tables')
      .select('*')
      .eq('branch_id', branchId)
      .order('table_number', { ascending: true })
      .then(({ data }) => setTables((data ?? []) as RestaurantTable[]));

    supabase
      .from('menu_items')
      .select('*, categories(name, display_order)')
      .eq('branch_id', branchId)
      .eq('is_available', true)
      .order('created_at')
      .then(({ data }) => setMenu((data ?? []) as MenuItem[]));
  }, [branchId]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = subtotal * 1.05;

  const add = (item: MenuItem) => {
    setCart((c) => {
      const found = c.find((i) => i.id === item.id);
      if (found) {
        return c.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...c,
        { id: item.id, name: item.name, price: item.price, quantity: 1 },
      ];
    });
  };

  const updateQty = (id: string, qty: number) =>
    setCart((c) =>
      qty <= 0
        ? c.filter((i) => i.id !== id)
        : c.map((i) => (i.id === id ? { ...i, quantity: qty } : i))
    );

  const placeOrder = async () => {
    if (!tableNumber) {
      toast.error('Pick a table first');
      return;
    }
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    setSubmitting(true);
    try {
      const table = tables.find((t) => t.table_number === tableNumber);
      const sub = Number(subtotal.toFixed(2));
      const tot = Number(total.toFixed(2));

      const persist = async (args: {
        paymentStatus: PaymentStatus;
        paymentMethod: string;
        razorpayOrderId?: string | null;
        razorpayPaymentId?: string | null;
      }) => {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            branch_id: branchId,
            table_id: table?.id ?? null,
            table_number: tableNumber,
            status: 'confirmed',
            payment_status: args.paymentStatus,
            payment_method: args.paymentMethod,
            razorpay_order_id: args.razorpayOrderId ?? null,
            razorpay_payment_id: args.razorpayPaymentId ?? null,
            subtotal: sub,
            total: tot,
            customer_note: staffName ? `Manual · by ${staffName}` : 'Manual',
            is_manual: true,
          })
          .select('id')
          .single();

        if (error || !order) throw new Error(error?.message ?? 'Insert failed');

        const rows = cart.map((i) => ({
          order_id: order.id,
          menu_item_id: i.id,
          item_name: i.name,
          quantity: i.quantity,
          unit_price: i.price,
          total_price: Number((i.price * i.quantity).toFixed(2)),
        }));
        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(rows);
        if (itemsErr) throw new Error(itemsErr.message);
        return order.id as string;
      };

      if (payment === 'cash') {
        await persist({ paymentStatus: 'cash', paymentMethod: 'cash' });
        toast.success('Manual order placed');
        setCart([]);
        setTableNumber('');
      } else {
        const { data: rp, error: rpErr } = await supabase.functions.invoke<{
          id: string;
          amount: number;
          currency: string;
        }>('create-razorpay-order', {
          body: {
            amount: Math.round(tot * 100),
            receipt: `manual_${Date.now()}`,
          },
        });
        if (rpErr || !rp?.id)
          throw new Error(rpErr?.message ?? 'Could not create payment order');

        await initiatePayment({
          amount: rp.amount,
          orderId: rp.id,
          tableNumber,
          description: `Manual · Table ${tableNumber}`,
          onSuccess: async (resp) => {
            try {
              await persist({
                paymentStatus: 'paid',
                paymentMethod: 'razorpay',
                razorpayOrderId: resp.razorpay_order_id,
                razorpayPaymentId: resp.razorpay_payment_id,
              });
              toast.success('Paid & placed');
              setCart([]);
              setTableNumber('');
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : 'Failed to save order'
              );
            } finally {
              setSubmitting(false);
            }
          },
          onFailure: () => setSubmitting(false),
        });
        return; // Razorpay handler will finalize
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (payment === 'cash') setSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-10 flex flex-col xl:flex-row gap-8">
      <section className="flex-1 min-w-0">
        <header className="mb-8">
          <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
            New Manual Order
          </h1>
          <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
            Walk-in · Phone · Counter
          </p>
        </header>

        <div className="mb-8">
          <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
            Table
          </label>
          <select
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            className="w-full md:w-72 bg-obsidian-100 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          >
            <option value="">Select table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.table_number}>
                Table {t.table_number}
                {t.is_occupied ? ' · occupied' : ''}
              </option>
            ))}
          </select>
        </div>

        <h2 className="font-display text-2xl text-brand-500 mb-4">Menu</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {menu.map((item) => (
            <button
              key={item.id}
              onClick={() => add(item)}
              className="text-left bg-obsidian-100 border border-brand-500/10 rounded-xl p-4 hover:border-brand-500/40 hover:shadow-glow transition-all"
            >
              <p className="text-cream text-sm font-semibold line-clamp-1">
                {item.name}
              </p>
              <p className="text-cream/70 text-xs line-clamp-1 mt-1">
                {item.categories?.name ?? ''}
              </p>
              <p className="font-display text-xl text-brand-500 mt-2">
                ₹{Number(item.price).toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      </section>

      <aside className="xl:w-[360px] w-full bg-obsidian-100 border border-brand-500/15 rounded-2xl p-6 flex flex-col h-fit xl:sticky xl:top-6">
        <h2 className="font-display italic text-2xl text-cream mb-4">
          Cart
        </h2>
        {cart.length === 0 ? (
          <p className="text-cream/60 italic text-sm">Empty — pick items from the menu.</p>
        ) : (
          <ul className="space-y-3 mb-4">
            {cart.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-cream text-sm font-semibold line-clamp-1">
                    {i.name}
                  </p>
                  <p className="font-mono text-xs text-cream/70">
                    ₹{i.price.toFixed(2)} × {i.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-obsidian rounded-full p-1 border border-brand-500/20">
                  <button
                    onClick={() => updateQty(i.id, i.quantity - 1)}
                    className="w-6 h-6 rounded-full text-brand-500 hover:bg-brand-500 hover:text-ink text-sm"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-cream text-xs font-mono">
                    {i.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(i.id, i.quantity + 1)}
                    className="w-6 h-6 rounded-full text-brand-500 hover:bg-brand-500 hover:text-ink text-sm"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => updateQty(i.id, 0)}
                  className="text-cream/60 hover:text-red-400"
                  aria-label="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-brand-500/10 pt-4 space-y-1.5 font-mono text-sm mb-4">
          <div className="flex justify-between text-cream/70">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-cream/70">
            <span>GST 5%</span>
            <span>₹{(subtotal * 0.05).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-cream text-lg font-display pt-2 border-t border-brand-500/10">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {(['razorpay', 'cash'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPayment(m)}
              className={`flex-1 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono border transition-all ${
                payment === m
                  ? 'bg-brand-500 text-ink border-brand-500'
                  : 'border-brand-500/30 text-cream/70'
              }`}
            >
              {m === 'razorpay' ? 'Razorpay' : 'Cash'}
            </button>
          ))}
        </div>

        <button
          onClick={placeOrder}
          disabled={submitting || cart.length === 0 || !tableNumber}
          className="bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Placing…' : 'Place Order'}
        </button>
      </aside>
    </div>
  );
}

// ============================================================
// Order History
// ============================================================

function OrderHistory({ branchId }: { branchId: string }) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(100);
      setOrders((data ?? []) as OrderWithItems[]);
      setLoading(false);
    })();
  }, [branchId]);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Order History
        </h1>
        <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
          Last 100 orders
        </p>
      </header>
      {loading ? (
        <p className="text-cream/70">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-cream/70 italic">No orders yet.</p>
      ) : (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-500/10 text-left font-mono text-[11px] tracking-[0.2em] uppercase text-brand-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">When</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-brand-500/5 hover:bg-obsidian-50/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-brand-500">
                    #{o.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-cream/80">
                    <FulfillmentPill order={o} />
                  </td>
                  <td className="px-4 py-3 text-cream/70 line-clamp-1 max-w-xs">
                    {summariseItems(o.order_items) || '—'}
                  </td>
                  <td className="px-4 py-3 text-cream/80 capitalize">
                    {o.status}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentPill status={o.payment_status} />
                  </td>
                  <td className="px-4 py-3 text-right font-display text-brand-500">
                    ₹{Number(o.total ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-cream/70 font-mono text-xs">
                    {timeAgo(o.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <HistoryReceiptButton order={o} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Table Status
// ============================================================

function TableStatus({ branchId }: { branchId: string }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [activeOrders, setActiveOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [tblRes, ordRes] = await Promise.all([
      supabase
        .from('restaurant_tables')
        .select('*')
        .eq('branch_id', branchId)
        .order('table_number'),
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('branch_id', branchId)
        .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
        .order('created_at', { ascending: false }),
    ]);
    setTables((tblRes.data ?? []) as RestaurantTable[]);
    setActiveOrders((ordRes.data ?? []) as OrderWithItems[]);
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`tables-live-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_tables',
          filter: `branch_id=eq.${branchId}`,
        },
        () => fetchAll()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${branchId}`,
        },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, fetchAll]);

  const markFree = async (t: RestaurantTable) => {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ is_occupied: false })
      .eq('id', t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Table ${t.table_number} cleared`);
  };

  const markOccupied = async (t: RestaurantTable) => {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ is_occupied: true })
      .eq('id', t.id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Table Status
        </h1>
        <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
          Branch floor
        </p>
      </header>
      {loading ? (
        <p className="text-cream/70">Loading…</p>
      ) : tables.length === 0 ? (
        <p className="text-cream/70 italic">No tables configured for this branch.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tables.map((t) => {
            const current = activeOrders.find(
              (o) => o.table_id === t.id || o.table_number === t.table_number
            );
            return (
              <div
                key={t.id}
                className={`rounded-2xl p-5 border transition-all ${
                  t.is_occupied
                    ? 'bg-brand-500/10 border-brand-500/40'
                    : 'bg-obsidian-100 border-brand-500/10'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="font-display italic text-3xl text-cream">
                    T{t.table_number}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border ${
                      t.is_occupied
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        : 'bg-green-500/15 border-green-500/30 text-green-400'
                    }`}
                  >
                    {t.is_occupied ? 'Occupied' : 'Free'}
                  </span>
                </div>
                {current ? (
                  <div className="mb-4">
                    <p className="font-mono text-[10px] text-brand-500 uppercase tracking-[0.2em] mb-1">
                      Order #{current.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="text-cream/70 text-xs capitalize">
                      {current.status} · ₹
                      {Number(current.total ?? 0).toFixed(2)}
                    </p>
                  </div>
                ) : (
                  <p className="text-cream/60 italic text-xs mb-4">
                    No active order
                  </p>
                )}
                {t.is_occupied ? (
                  <button
                    onClick={() => markFree(t)}
                    className="w-full border border-brand-500/40 text-brand-500 rounded-full py-2 text-[11px] uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
                  >
                    Mark Free
                  </button>
                ) : (
                  <button
                    onClick={() => markOccupied(t)}
                    className="w-full border border-cream/20 text-cream/60 rounded-full py-2 text-[11px] uppercase tracking-[0.2em] font-mono hover:border-brand-500/50 hover:text-brand-500 transition-all"
                  >
                    Mark Occupied
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Kitchen Display (KD)
// ============================================================

const KD_STATUSES: OrderStatus[] = ['confirmed', 'preparing'];
const AGED_MINS = 15;

function KitchenDisplay({ branchId }: { branchId: string }) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [tick, setTick] = useState(0);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('branch_id', branchId)
      .in('status', KD_STATUSES)
      .order('created_at', { ascending: true });
    if (error) return;
    setOrders((data ?? []) as OrderWithItems[]);
  }, [branchId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime subscription for immediate updates.
  useEffect(() => {
    const channel = supabase
      .channel(`kd-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${branchId}`,
        },
        () => fetchOrders()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, fetchOrders]);

  // 10-second poll (belt-and-braces) + 1s tick so the red-aged counter updates.
  useEffect(() => {
    const poll = setInterval(fetchOrders, 10_000);
    const t = setInterval(() => setTick((x) => x + 1), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(t);
    };
  }, [fetchOrders]);

  const advance = async (order: OrderWithItems, next: OrderStatus) => {
    const previousStatus = order.status;
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: next } : o))
    );
    const { error } = await supabase
      .from('orders')
      .update({ status: next })
      .eq('id', order.id);
    if (error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: previousStatus } : o
        )
      );
      toast.error(error.message);
    } else {
      toast.success(`#${order.id.slice(-6).toUpperCase()} → ${next}`);
    }
  };

  return (
    <div
      className="min-h-screen p-6 md:p-8"
      // Warm near-black instead of raw #000 so the KD feels like an
      // intentional dark-mode panel next to the ivory admin sidebar while
      // keeping kitchen-grade contrast for line cooks.
      style={{ background: '#0a0706' }}
    >
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display italic text-4xl md:text-5xl text-white">
            Kitchen Display
          </h1>
          <p className="font-mono text-[11px] text-white/40 tracking-[0.3em] uppercase mt-1">
            {orders.length} active · live
          </p>
        </div>
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-green-400" />
          </span>
          <span className="font-mono text-[11px] text-green-400 tracking-[0.3em] uppercase">
            Live
          </span>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="flex items-center justify-center h-[60vh]">
          <p className="font-display italic text-4xl text-white/30">
            Kitchen is clear.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {orders.map((o) => (
            <KdCard
              key={o.id + tick /* force aged-colour refresh */}
              order={o}
              onAdvance={advance}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KdCard({
  order,
  onAdvance,
}: {
  order: OrderWithItems;
  onAdvance: (o: OrderWithItems, next: OrderStatus) => void;
}) {
  const mins = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 60_000
  );
  const aged = mins >= AGED_MINS;
  const nextAction: { label: string; next: OrderStatus } =
    order.status === 'confirmed'
      ? { label: 'Mark Preparing', next: 'preparing' }
      : { label: 'Mark Ready', next: 'ready' };

  return (
    <article className="rounded-2xl border border-white/10 bg-neutral-950 p-5 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <span
          className="text-white font-bold tracking-[0.12em]"
          style={{ fontFamily: 'Space Mono, ui-monospace, monospace', fontSize: 32 }}
        >
          #{order.id.slice(-6).toUpperCase()}
        </span>
        <span className="text-brand-500 font-semibold text-2xl tracking-wide whitespace-nowrap">
          {order.fulfillment_type === 'pickup'
            ? 'Pickup'
            : order.fulfillment_type === 'delivery'
              ? 'Delivery'
              : `T${order.table_number ?? '—'}`}
        </span>
      </header>

      <div
        className={`inline-flex self-start items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[13px] tracking-wider ${
          aged
            ? 'bg-red-500/20 border border-red-500/60 text-red-400 animate-pulse'
            : 'bg-white/5 border border-white/15 text-white/70'
        }`}
      >
        {aged ? '⏰ ' : ''}
        {mins < 1 ? 'just now' : `${mins} min${mins === 1 ? '' : 's'} ago`}
      </div>

      <ul className="space-y-1.5">
        {order.order_items.map((i) => (
          <li
            key={i.id}
            className="text-white leading-snug"
            style={{ fontSize: 20 }}
          >
            <span className="text-brand-500 font-bold mr-2">{i.quantity}×</span>
            {i.item_name}
          </li>
        ))}
      </ul>

      {order.fulfillment_type === 'delivery' && order.delivery_address && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: '#fde68a' }}
        >
          <p
            className="font-mono tracking-[0.2em] uppercase mb-1"
            style={{ color: '#000', fontSize: 11, fontWeight: 700 }}
          >
            🚚 Delivery to
          </p>
          <p
            style={{ color: '#000', fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}
          >
            {order.delivery_address}
          </p>
          {(order.delivery_landmark || order.delivery_pincode) && (
            <p
              className="font-mono"
              style={{ color: '#000', fontSize: 12, marginTop: 4 }}
            >
              {order.delivery_landmark}
              {order.delivery_landmark && order.delivery_pincode ? ' · ' : ''}
              {order.delivery_pincode}
            </p>
          )}
        </div>
      )}

      {order.customer_note && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: '#fbbf24' }}
        >
          <p
            className="font-mono tracking-[0.2em] uppercase mb-1"
            style={{ color: '#000', fontSize: 11, fontWeight: 700 }}
          >
            ⚠️ Note
          </p>
          <p
            style={{ color: '#000', fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}
          >
            "{order.customer_note}"
          </p>
        </div>
      )}

      <button
        onClick={() => onAdvance(order, nextAction.next)}
        className="mt-auto w-full bg-brand-500 text-black font-bold uppercase tracking-[0.15em] text-base py-4 rounded-xl hover:bg-brand-400 transition-all"
      >
        {nextAction.label}
      </button>
    </article>
  );
}

// ============================================================
// Helpers
// ============================================================

function HistoryReceiptButton({ order }: { order: OrderWithItems }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    try {
      await generateReceipt(order, order.order_items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Download receipt"
      aria-label="Download receipt"
      className="inline-flex items-center justify-center gap-1.5 border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-ink rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] font-mono transition-all disabled:opacity-50"
    >
      <Download size={12} />
      PDF
    </button>
  );
}

// ============================================================
// Reservations (staff view — branch-scoped)
// ============================================================

const RES_TABS: Array<{ key: 'today' | 'upcoming' | 'past'; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
];

const RES_STATUS_META: Record<
  ReservationStatus,
  { label: string; chip: string }
> = {
  pending: {
    label: 'Pending',
    chip: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  },
  confirmed: {
    label: 'Confirmed',
    chip: 'bg-brand-500/15 border-brand-500/40 text-brand-600',
  },
  seated: {
    label: 'Seated',
    chip: 'bg-green-500/15 border-green-500/40 text-green-300',
  },
  completed: {
    label: 'Completed',
    chip: 'bg-cream/10 border-cream/20 text-cream/60',
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'bg-red-500/10 border-red-500/40 text-red-300',
  },
  no_show: {
    label: 'No-show',
    chip: 'bg-red-500/20 border-red-500/60 text-red-300',
  },
};

function Reservations({ branchId }: { branchId: string }) {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'today' | 'upcoming' | 'past'>('today');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reservations')
      .select('*, branches(name, city)')
      .eq('branch_id', branchId)
      .order('reserved_at', { ascending: true })
      .limit(500);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as Reservation[]);
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    load();
    const channel = supabase
      .channel(`reservations-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `branch_id=eq.${branchId}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, load]);

  const buckets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const out = { today: [] as Reservation[], upcoming: [] as Reservation[], past: [] as Reservation[] };
    for (const r of rows) {
      const when = new Date(r.reserved_at);
      if (when >= today && when < tomorrow) out.today.push(r);
      else if (when >= tomorrow) out.upcoming.push(r);
      else out.past.push(r);
    }
    out.past.reverse(); // newest past first
    return out;
  }, [rows]);

  const visible = buckets[tab];

  const updateStatus = async (id: string, status: ReservationStatus) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${RES_STATUS_META[status].label.toLowerCase()}`);
  };

  return (
    <div className="p-6 md:p-8">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-display italic text-4xl md:text-5xl text-cream">
            Reservations
          </h1>
          <p className="font-mono text-[11px] text-cream/60 tracking-[0.3em] uppercase mt-1">
            {buckets.today.length} today · {buckets.upcoming.length} upcoming
          </p>
        </div>
      </header>

      <div className="inline-flex gap-1 bg-obsidian-100 border border-brand-500/10 rounded-full p-1 mb-6">
        {RES_TABS.map((t) => {
          const count = buckets[t.key].length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono transition-all ${
                active
                  ? 'bg-brand-500 text-ink'
                  : 'text-cream/70 hover:text-brand-600'
              }`}
            >
              {t.label}
              <span className="ml-2 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-cream/70 italic">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-10 text-center">
          <BookOpenCheck
            size={40}
            className="text-brand-500/40 mx-auto mb-3"
          />
          <p className="font-display italic text-2xl text-cream mb-1">
            No reservations {tab === 'today' ? 'for today' : 'in this window'}
          </p>
          <p className="text-cream/70 text-sm">
            Bookings from /reserve land here automatically.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((r) => (
            <ResCard
              key={r.id}
              reservation={r}
              onStatus={(s) => updateStatus(r.id, s)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResCard({
  reservation,
  onStatus,
}: {
  reservation: Reservation;
  onStatus: (s: ReservationStatus) => void;
}) {
  const when = new Date(reservation.reserved_at);
  const timeLabel = when.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dateLabel = when.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const meta = RES_STATUS_META[reservation.status];
  const isDone =
    reservation.status === 'completed' ||
    reservation.status === 'cancelled' ||
    reservation.status === 'no_show';

  return (
    <li className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display italic text-2xl text-cream leading-tight">
            {reservation.customer_name}
          </p>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/70 mt-0.5">
            {reservation.confirmation_code ?? '—'}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider ${meta.chip}`}
        >
          {meta.label}
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-cream/60 font-mono text-[10px] tracking-wider uppercase self-center">
          When
        </dt>
        <dd className="text-cream">
          {dateLabel} · <span className="text-brand-600">{timeLabel}</span>
        </dd>
        <dt className="text-cream/60 font-mono text-[10px] tracking-wider uppercase self-center">
          Party
        </dt>
        <dd className="text-cream">
          {reservation.party_size}{' '}
          <span className="text-cream/70">guest{reservation.party_size > 1 ? 's' : ''}</span>
        </dd>
        <dt className="text-cream/60 font-mono text-[10px] tracking-wider uppercase self-center">
          Phone
        </dt>
        <dd>
          <a
            href={`tel:+91${reservation.customer_phone}`}
            className="text-cream hover:text-brand-500 font-mono tracking-wider"
          >
            +91 {reservation.customer_phone}
          </a>
        </dd>
        {reservation.occasion && (
          <>
            <dt className="text-cream/60 font-mono text-[10px] tracking-wider uppercase self-center">
              Occasion
            </dt>
            <dd className="text-cream/80 italic">{reservation.occasion}</dd>
          </>
        )}
      </dl>

      {reservation.note && (
        <div className="bg-obsidian-50 border border-brand-500/10 rounded-xl px-3 py-2">
          <p className="font-mono text-[10px] text-brand-500 tracking-wider uppercase mb-1">
            Note
          </p>
          <p className="text-cream/85 italic text-sm leading-snug">
            "{reservation.note}"
          </p>
        </div>
      )}

      {!isDone && (
        <div className="flex flex-wrap gap-2 mt-1">
          {reservation.status === 'pending' && (
            <ActionBtn
              label="Confirm"
              Icon={Check}
              tone="gold"
              onClick={() => onStatus('confirmed')}
            />
          )}
          {(reservation.status === 'pending' ||
            reservation.status === 'confirmed') && (
            <ActionBtn
              label="Seated"
              Icon={Check}
              tone="green"
              onClick={() => onStatus('seated')}
            />
          )}
          {reservation.status === 'seated' && (
            <ActionBtn
              label="Complete"
              Icon={Check}
              tone="gold"
              onClick={() => onStatus('completed')}
            />
          )}
          <ActionBtn
            label="No-show"
            Icon={UserX}
            tone="red"
            onClick={() => onStatus('no_show')}
          />
          <ActionBtn
            label="Cancel"
            Icon={Trash2}
            tone="neutral"
            onClick={() => onStatus('cancelled')}
          />
        </div>
      )}
    </li>
  );
}

function ActionBtn({
  label,
  Icon,
  tone,
  onClick,
}: {
  label: string;
  Icon: typeof Flame;
  tone: 'gold' | 'green' | 'red' | 'neutral';
  onClick: () => void;
}) {
  const tones: Record<typeof tone, string> = {
    gold: 'border-brand-500/40 text-brand-500 hover:bg-brand-500 hover:text-ink',
    green: 'border-green-500/40 text-green-400 hover:bg-green-500 hover:text-ink',
    red: 'border-red-500/40 text-red-400 hover:bg-red-500/20',
    neutral: 'border-cream/20 text-cream/60 hover:text-red-400 hover:border-red-500/50',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono transition border ${tones[tone]}`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

