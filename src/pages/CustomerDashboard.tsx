import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Download,
  History,
  LogOut,
  QrCode,
  ShoppingBag,
  Truck,
  UserRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCustomerAccess } from '../lib/useCustomerAccess';
import { useCart } from '../lib/useCart';
import Spinner from '../components/Spinner';
import {
  formatPhone,
  formatShortDate,
  summariseItems,
} from '../lib/format';
import type { OrderWithItems } from '../types';

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const customer = useCustomerAccess((s) => s.getCustomer());
  const tableSession = useCustomerAccess((s) => s.getTableSession());
  const clearAll = useCustomerAccess((s) => s.clearAll);
  const clearCart = useCart((s) => s.clearCart);

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) {
      navigate('/customer-auth', { replace: true });
    }
  }, [customer, navigate]);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_phone', customer.phone)
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancelled) return;
      if (!error) {
        setOrders((data ?? []) as OrderWithItems[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const { totalOrders, totalSpent, lastVisit } = useMemo(() => {
    const completed = orders.filter((o) => o.status !== 'cancelled');
    const total = completed.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const latest = orders[0]?.created_at ?? null;
    return {
      totalOrders: completed.length,
      totalSpent: total,
      lastVisit: latest,
    };
  }, [orders]);

  const onSignOut = () => {
    clearAll();
    clearCart();
    toast.success('Signed out');
    navigate('/customer-auth', { replace: true });
  };

  if (!customer) return null;

  return (
    <div className="min-h-screen bg-obsidian text-cream relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(193,120,32,0.2),transparent_40%),radial-gradient(circle_at_90%_80%,rgba(193,120,32,0.16),transparent_45%)] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-6 py-10 md:py-14">
        <header className="flex items-start justify-between gap-6 flex-wrap mb-10">
          <div>
            <Link
              to="/"
              className="font-display italic text-xl text-brand-500 tracking-[0.2em] inline-block mb-6"
            >
              VAN LAVINO
            </Link>
            <h1 className="font-display italic text-4xl md:text-5xl leading-tight text-cream">
              Welcome back, {customer.name.split(' ')[0]}
            </h1>
            <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase mt-3">
              {formatPhone(customer.phone)}
            </p>
          </div>

          <button
            onClick={onSignOut}
            className="inline-flex items-center gap-2 border border-brand-500/30 text-brand-500 rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </header>

        {tableSession ? (
          <section className="bg-obsidian-100 border border-brand-500/20 rounded-3xl p-6 md:p-8 mb-8 flex flex-wrap items-center gap-4 shadow-luxury card-shimmer">
            <div className="flex-1 min-w-[200px]">
              <p className="font-mono text-[11px] text-brand-500 tracking-[0.35em] uppercase mb-2">
                Active Table
              </p>
              <p className="font-display italic text-3xl text-cream leading-none">
                Table {tableSession.tableNumber}
              </p>
              <p className="text-cream/60 mt-1">{tableSession.branchName}</p>
            </div>
            <Link
              to="/menu"
              className="bg-brand-500 text-ink rounded-full px-6 py-3 text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-400 hover:shadow-glow transition-all"
            >
              Open Menu →
            </Link>
          </section>
        ) : (
          <section className="bg-obsidian-100 border border-brand-500/15 rounded-3xl p-6 md:p-8 mb-8 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="font-mono text-[11px] text-brand-500 tracking-[0.35em] uppercase mb-2">
                No active table
              </p>
              <p className="text-cream/70">
                Scan your table's QR to start a new order.
              </p>
            </div>
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 border border-brand-500/40 text-brand-500 rounded-full px-6 py-3 text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
            >
              <QrCode size={16} />
              Scan QR
            </Link>
          </section>
        )}

        <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          <Stat label="Orders" value={totalOrders.toString()} />
          <Stat label="Total Spent" value={`₹${totalSpent.toFixed(0)}`} />
          <Stat
            label="Last visit"
            value={lastVisit ? formatShortDate(lastVisit) : '—'}
          />
        </section>

        <section>
          <header className="flex items-center justify-between mb-4">
            <h2 className="font-display italic text-2xl md:text-3xl text-cream">
              Your Orders
            </h2>
            <span className="font-mono text-[11px] text-cream/60 tracking-[0.3em] uppercase">
              Last 30
            </span>
          </header>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size={22} />
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-10 text-center">
              <p className="font-display italic text-2xl text-cream mb-2">
                Your story begins here.
              </p>
              <p className="text-cream/60">
                Place your first order and we'll remember it for you.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-16 text-center text-cream/60 text-xs font-mono tracking-[0.3em] uppercase">
          <UserRound size={14} className="inline mr-2 -mt-0.5" />
          Van Lavino · Hyderabad
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-obsidian-100 rounded-2xl p-5 border-t-2 border-brand-500">
      <p className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase mb-2">
        {label}
      </p>
      <p className="font-display text-3xl text-cream">{value}</p>
    </div>
  );
}

const ACTIVE_STATUSES = new Set<OrderWithItems['status']>([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
]);

// Pretty label for the status pill — DB enum is snake_case, customers
// shouldn't see that.
function statusLabel(s: OrderWithItems['status']): string {
  if (s === 'out_for_delivery') return 'out for delivery';
  return s;
}

function ChannelChip({ order }: { order: OrderWithItems }) {
  if (order.fulfillment_type === 'delivery') {
    return (
      <span className="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
        <Truck size={10} />
        Delivery
      </span>
    );
  }
  if (order.fulfillment_type === 'pickup') {
    return (
      <span className="inline-flex items-center gap-1 border border-brand-500/40 bg-brand-500/10 text-brand-600 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
        <ShoppingBag size={10} />
        Pickup
      </span>
    );
  }
  if (order.table_number) {
    return (
      <span className="border border-cream/20 text-cream/65 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wider">
        Table {order.table_number}
      </span>
    );
  }
  return null;
}

function OrderCard({ order }: { order: OrderWithItems }) {
  const [busy, setBusy] = useState(false);
  const isActive = ACTIVE_STATUSES.has(order.status);
  const onReceipt = async () => {
    setBusy(true);
    try {
      const { generateReceipt } = await import('../components/ReceiptGenerator');
      await generateReceipt(order, order.order_items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li
      className={`bg-obsidian-100 border rounded-2xl p-5 transition-colors ${
        isActive
          ? 'border-brand-500/40 hover:border-brand-500'
          : 'border-brand-500/10 hover:border-brand-500/25'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-mono text-xs text-brand-500 tracking-[0.2em]">
            #{order.id.slice(-6).toUpperCase()}
          </p>
          <p className="text-cream/70 text-xs mt-1 font-mono flex items-center gap-2 flex-wrap">
            {formatShortDate(order.created_at)} ·{' '}
            <span
              className={`capitalize px-2 py-0.5 rounded-full text-[10px] tracking-wider ${
                isActive
                  ? 'bg-brand-500/15 text-brand-600 border border-brand-500/30'
                  : 'text-cream/70'
              }`}
            >
              {statusLabel(order.status)}
            </span>
            <ChannelChip order={order} />
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-xl text-brand-500">
            ₹{Number(order.total ?? 0).toFixed(2)}
          </span>
          <button
            onClick={onReceipt}
            disabled={busy}
            title="Download receipt"
            className="inline-flex items-center gap-2 border border-brand-500/30 text-brand-500 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all disabled:opacity-50"
          >
            {busy ? <Spinner size={12} /> : <Download size={12} />}
            PDF
          </button>
        </div>
      </div>
      <p className="text-cream/80 text-sm leading-snug">
        {summariseItems(order.order_items) || '—'}
      </p>
      {order.customer_note && (
        <p className="text-cream/70 italic text-xs mt-2">
          "{order.customer_note}"
        </p>
      )}
      {isActive && (
        <Link
          to={`/track?order=${encodeURIComponent(order.id)}`}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-brand-500 text-ink px-4 py-2.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 hover:shadow-glow transition-all"
        >
          <History size={14} />
          Track Live Status
        </Link>
      )}
      {order.status === 'served' && (
        <Link
          to={`/review?order=${encodeURIComponent(order.id)}`}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 border border-brand-500/40 text-brand-500 px-4 py-2.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
        >
          ★ Leave a review
        </Link>
      )}
    </li>
  );
}

