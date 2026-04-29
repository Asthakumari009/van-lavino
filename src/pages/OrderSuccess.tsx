import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCart } from '../lib/useCart';
import { supabase } from '../lib/supabase';
import Spinner from '../components/Spinner';
import type { Branch, OrderItemRow, OrderRow } from '../types';

const AUTO_REDIRECT_SECONDS = 30;

export default function OrderSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const tableNumber = useCart((s) => s.tableNumber);
  const branchId = useCart((s) => s.branchId);
  const clearCart = useCart((s) => s.clearCart);
  const [remaining, setRemaining] = useState(AUTO_REDIRECT_SECONDS);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [downloading, setDownloading] = useState(false);

  const stateOrderId = (location.state as { orderId?: string } | null)?.orderId;
  const fallbackDisplayId = useMemo(
    () => `VL-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    []
  );
  const displayOrderId = order?.id ?? stateOrderId ?? fallbackDisplayId;

  // Fulfillment drives every channel-specific decision below: copy, return-CTA
  // target, and whether auto-redirect even makes sense (a bakery customer
  // bouncing back to /menu-with-table-required is broken UX).
  const fulfillment = order?.fulfillment_type ?? 'dine_in';
  const isBakery = fulfillment === 'pickup' || fulfillment === 'delivery';

  // For dine-in: bounce back into the table menu after the timer.
  // For bakery: there's no table session to return to — point to /order so
  // they can keep shopping if they want, and don't auto-redirect (less rude).
  const returnUrl = useMemo(() => {
    if (isBakery) return '/order';
    const params = new URLSearchParams();
    if (branchId) params.set('branch', branchId);
    if (tableNumber) params.set('table', tableNumber);
    const qs = params.toString();
    return qs ? `/menu?${qs}` : '/menu';
  }, [isBakery, branchId, tableNumber]);

  // Drain the cart now that an order has been successfully placed. Done
  // here (instead of in OrderCheckout's submit handler) so that clearing
  // doesn't race the navigate to this page — see comment on placingRef in
  // OrderCheckout.
  useEffect(() => {
    if (stateOrderId) clearCart();
  }, [stateOrderId, clearCart]);

  useEffect(() => {
    if (!stateOrderId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', stateOrderId)
        .maybeSingle();
      if (cancelled || !data) return;
      const { order_items, ...orderRow } = data as OrderRow & {
        order_items: OrderItemRow[];
      };
      setOrder(orderRow as OrderRow);
      setItems(order_items ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [stateOrderId]);

  // Look up branch by id once the order arrives — receipt + bakery copy
  // both want the human-readable branch name.
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

  useEffect(() => {
    // Auto-redirect only for dine-in. Bakery customers should be free to
    // download the receipt or head to tracking on their own time.
    if (isBakery) return;
    const id = setInterval(
      () => setRemaining((r) => Math.max(0, r - 1)),
      1000
    );
    return () => clearInterval(id);
  }, [isBakery]);

  useEffect(() => {
    if (isBakery) return;
    if (remaining === 0) navigate(returnUrl, { replace: true });
  }, [isBakery, remaining, navigate, returnUrl]);

  const onDownload = async () => {
    if (!order) {
      toast.error('Receipt not ready yet');
      return;
    }
    setDownloading(true);
    try {
      const { generateReceipt } = await import('../components/ReceiptGenerator');
      await generateReceipt(order, items, {
        branchName: branch?.name ?? '',
      });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not generate receipt');
    } finally {
      setDownloading(false);
    }
  };

  const heroSub = (() => {
    if (fulfillment === 'pickup') {
      return branch?.name
        ? `Your order is being prepared. We'll let you know the moment it's ready for pickup at ${branch.name}.`
        : "Your order is being prepared. We'll let you know the moment it's ready for pickup.";
    }
    if (fulfillment === 'delivery') {
      return "Your order is being prepared. Our team will call shortly to confirm your address and delivery ETA.";
    }
    return "Your order is being prepared. We'll serve it to your table shortly.";
  })();

  const returnLabel = isBakery ? 'Browse Bakery' : 'View Menu Again';

  return (
    <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.25),transparent_60%)] pointer-events-none" />

      <div className="relative text-center max-w-lg w-full">
        <div className="flex justify-center mb-8">
          <div className="relative w-32 h-32 check-mark">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="46" className="check-circle" />
              <path d="M30 52 L45 67 L72 38" className="check-tick" />
            </svg>
          </div>
        </div>

        <h1 className="font-display text-4xl md:text-[56px] leading-tight text-brand-500 mb-4">
          Order Placed!
        </h1>

        <p className="font-mono text-sm md:text-base text-brand-600 tracking-[0.25em] mb-6">
          #{displayOrderId.slice(-6).toUpperCase()}
        </p>

        <p className="font-body text-cream/80 text-base md:text-lg leading-relaxed mb-10">
          {heroSub}
        </p>

        <div className="flex flex-col items-center gap-4 w-full">
          {stateOrderId && (
            <Link
              to={`/track?order=${encodeURIComponent(stateOrderId)}`}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-brand-500 text-ink px-8 py-4 rounded-full font-semibold tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300"
            >
              Track Your Order →
            </Link>
          )}

          <Link
            to={returnUrl}
            className="w-full md:w-auto inline-flex items-center justify-center border border-brand-500/40 text-brand-500 px-8 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
          >
            {returnLabel}
          </Link>

          {stateOrderId && (
            <Link
              to={`/review?order=${encodeURIComponent(stateOrderId)}`}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 text-brand-600 hover:text-brand-500 px-4 py-2 text-xs uppercase tracking-[0.3em] font-mono transition"
            >
              ★ Leave a review
            </Link>
          )}

          <button
            onClick={onDownload}
            disabled={downloading || !order}
            className="inline-flex items-center gap-2 text-cream/60 hover:text-brand-600 px-4 py-2 text-sm uppercase tracking-[0.2em] font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Spinner /> : <Download size={14} />}
            {downloading ? 'Preparing…' : 'Download Receipt'}
          </button>

          {!isBakery && (
            <div className="flex items-center gap-3 mt-2">
              <div className="relative w-10 h-10">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(193,120,32,0.15)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#c17820"
                    strokeWidth="6"
                    strokeLinecap="round"
                    className="countdown-ring"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-brand-500">
                  {remaining}
                </span>
              </div>
              <span className="font-mono text-[11px] text-cream/70 uppercase tracking-[0.3em]">
                Redirecting
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
