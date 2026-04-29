import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, Star } from 'lucide-react';
import Spinner from '../components/Spinner';
import { supabase } from '../lib/supabase';
import { useCustomerAccess } from '../lib/useCustomerAccess';
import type { OrderRow } from '../types';

const REVIEW_MAX = 500;

const RATING_COPY: Record<number, string> = {
  1: 'We let you down — thank you for telling us',
  2: 'Not our best — we hear you',
  3: 'Decent, not dazzling',
  4: 'Glad you enjoyed it',
  5: "Made your day, thank you ✨",
};

export default function LeaveReview() {
  const [params] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const navigate = useNavigate();
  const customer = useCustomerAccess((s) => s.getCustomer());
  const tableSession = useCustomerAccess((s) => s.getTableSession());

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: orderRow }, { data: existing }] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).maybeSingle(),
        supabase
          .from('reviews')
          .select('id')
          .eq('order_id', orderId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setOrder(orderRow as OrderRow | null);
      if (existing?.id) setAlreadyReviewed(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const shortId = useMemo(
    () => (orderId ? orderId.slice(-6).toUpperCase() : ''),
    [orderId]
  );

  const onSubmit = async () => {
    if (!orderId) return;
    if (rating < 1) {
      toast.error('Please pick a star rating');
      return;
    }
    if (!order?.branch_id) {
      toast.error('This order is missing a branch — cannot submit.');
      return;
    }
    const sessionId =
      tableSession?.customerSessionId ?? order.customer_session_id ?? null;
    if (!sessionId) {
      toast.error(
        'Your table session has expired. Reviews stay open for a limited time — please ask staff to help.'
      );
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('reviews').insert({
      order_id: orderId,
      branch_id: order.branch_id,
      customer_session_id: sessionId,
      customer_name:
        customer?.name?.trim() || order.customer_name?.trim() || null,
      rating,
      body: body.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      console.error(error);
      toast.error(error.message || 'Could not save your review');
      return;
    }
    toast.success('Thank you — your review means a lot.');
    navigate('/customer', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!orderId || !order) {
    return (
      <Shell>
        <p className="font-display italic text-3xl text-cream mb-4">
          Review link is invalid.
        </p>
        <p className="text-cream/60 mb-8">
          We couldn't find this order. If you've just dined, check the link
          on your receipt.
        </p>
        <Link
          to="/customer"
          className="inline-block bg-brand-500 text-ink px-6 py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 transition"
        >
          Back to my orders
        </Link>
      </Shell>
    );
  }

  if (alreadyReviewed) {
    return (
      <Shell>
        <Sparkles className="text-brand-500 mx-auto mb-6" size={48} />
        <p className="font-display italic text-3xl text-cream mb-4">
          You've already shared your thoughts
        </p>
        <p className="text-cream/60 mb-8">
          Thank you for reviewing order #{shortId}.
        </p>
        <Link
          to="/customer"
          className="inline-block bg-brand-500 text-ink px-6 py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 transition"
        >
          Back to my orders
        </Link>
      </Shell>
    );
  }

  const current = hover || rating;
  return (
    <Shell>
      <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase mb-3">
        Order #{shortId}
      </p>
      <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-3">
        How was it?
      </h1>
      <p className="text-cream/60 mb-10 max-w-md mx-auto">
        Your feedback shapes every plate we serve. Even one line helps.
      </p>

      <div
        className="flex justify-center gap-2 mb-3"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`transition-transform duration-200 ${
              current >= n ? 'scale-110' : 'scale-100 opacity-50 hover:opacity-90'
            }`}
          >
            <Star
              size={44}
              className={
                current >= n
                  ? 'text-brand-500 fill-brand-500 drop-shadow-[0_6px_20px_rgba(193,120,32,0.45)]'
                  : 'text-cream/60'
              }
            />
          </button>
        ))}
      </div>
      <p className="font-display italic text-xl text-cream/80 min-h-[28px] mb-8">
        {current > 0 ? RATING_COPY[current] : ' '}
      </p>

      <div className="text-left bg-obsidian-100 border border-brand-500/15 rounded-2xl p-5">
        <label className="font-mono text-[11px] text-brand-500 tracking-[0.3em] uppercase block mb-3">
          A few words (optional)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, REVIEW_MAX))}
          rows={4}
          placeholder="Loved the focaccia… cappuccino was perfect… staff was warm…"
          className="w-full bg-obsidian-200/40 border border-brand-500/15 rounded-xl px-4 py-3 text-cream placeholder:text-cream/45 focus:border-brand-500 focus:outline-none resize-none"
        />
        <div className="flex justify-end">
          <span
            className={`font-mono text-[10px] tracking-wider mt-1 ${
              body.length > REVIEW_MAX - 40 ? 'text-amber-500' : 'text-cream/60'
            }`}
          >
            {body.length}/{REVIEW_MAX}
          </span>
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={submitting || rating < 1}
        className="mt-8 w-full bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting && <Spinner />}
        {submitting ? 'Saving…' : 'Submit review'}
      </button>

      <Link
        to="/customer"
        className="mt-4 inline-block font-mono text-[11px] tracking-[0.25em] uppercase text-cream/70 hover:text-brand-500 transition"
      >
        Skip for now
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.25),transparent_60%)] pointer-events-none" />
      <div className="relative text-center max-w-lg w-full">{children}</div>
    </div>
  );
}
