import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  MapPin,
  ShoppingBag,
  Truck,
  Wallet,
} from 'lucide-react';
import Spinner from '../components/Spinner';
import DeliveryPinPicker from '../components/DeliveryPinPicker';
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
import { useCustomerAccess } from '../lib/useCustomerAccess';
import { initiatePayment } from '../lib/razorpay';
import { formatPrice } from '../lib/format';
import type { Branch, CartItem, FulfillmentType } from '../types';

type PaymentMode = 'online' | 'cash';

// Pincodes are India-format 6 digits when supplied. Empty is allowed
// (customer may not know it; staff will confirm by phone).
function isValidPincode(value: string): boolean {
  if (value.length === 0) return true;
  return /^\d{6}$/.test(value);
}

export default function OrderCheckout() {
  const navigate = useNavigate();
  const customer = useCustomerAccess((s) => s.getCustomer());
  const isCustomerActive = useCustomerAccess((s) => s.isCustomerActive);

  const cartItems = useCart((s) => s.items);
  const branchId = useCart((s) => s.branchId);
  const cartNote = useCart((s) => s.customerNote);
  const setCartNote = useCart((s) => s.setCustomerNote);
  const totalItems = useCart(selectTotalItems);
  const subtotal = useCart(selectSubtotal);
  const grandTotal = useCart(selectGrandTotal);

  // Once we kick off persistOrder + navigate, we don't want the
  // "cart empty? bounce to /order" effect below to race the navigate to
  // /order-success. The cart is cleared on the success page itself; this
  // ref is a backstop in case anything mutates cartItems mid-flight.
  const placingRef = useRef(false);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentType>('pickup');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState<PaymentMode | null>(null);

  // Auth gate: punt to customer-auth with ?next= so they bounce back here.
  useEffect(() => {
    if (!isCustomerActive()) {
      navigate('/customer-auth?next=/order/checkout', { replace: true });
    }
  }, [isCustomerActive, navigate]);

  // Bounce back to /order if they wandered here without a cart or branch.
  // Skip while we're mid-placement: clearing the cart on the success page
  // would otherwise trigger this redirect and race the success navigate.
  useEffect(() => {
    if (placingRef.current) return;
    if (cartItems.length === 0) {
      navigate('/order', { replace: true });
    }
  }, [cartItems.length, navigate]);

  // Load branch details for the chosen fulfillment branch.
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .maybeSingle();
      if (!cancelled && data) setBranch(data as Branch);
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const cgst = subtotal * CGST_RATE;
  const sgst = subtotal * SGST_RATE;

  const addressTrimmed = address.trim();
  const isDelivery = fulfillment === 'delivery';
  const addressValid = !isDelivery || addressTrimmed.length >= 10;
  const pincodeValid = isValidPincode(pincode);
  const noteUsed = cartNote.length;
  const noteRemaining = CUSTOMER_NOTE_MAX - noteUsed;
  const noteNearLimit = noteRemaining <= 20;

  const canSubmit = useMemo(() => {
    if (!customer) return false;
    if (cartItems.length === 0) return false;
    if (!branchId) return false;
    if (isDelivery && !addressValid) return false;
    if (!pincodeValid) return false;
    if (submitting !== null) return false;
    return true;
  }, [
    customer,
    cartItems.length,
    branchId,
    isDelivery,
    addressValid,
    pincodeValid,
    submitting,
  ]);

  async function handleSubmit(method: PaymentMode) {
    if (!canSubmit || !customer || !branchId) return;
    placingRef.current = true;
    setSubmitting(method);

    try {
      // 1. Mint a server-issued online customer session bound to this branch.
      //    The orders RLS requires customer_session_id to point at a session
      //    matching the order's branch_id and not yet expired.
      const { data: sessData, error: sessErr } = await supabase.functions.invoke<{
        ok: boolean;
        sessionId?: string;
        error?: string;
      }>('create-online-session', {
        body: {
          branch_id: branchId,
          customer_name: customer.name,
          customer_phone: customer.phone,
        },
      });

      if (sessErr || !sessData?.ok || !sessData.sessionId) {
        const msg =
          sessErr?.message ?? sessData?.error ?? 'Could not start your order session';
        console.error('[checkout] create-online-session failed', sessErr, sessData);
        toast.error(msg);
        placingRef.current = false;
        setSubmitting(null);
        return;
      }

      const sessionId = sessData.sessionId;
      const sub = Number(subtotal.toFixed(2));
      const total = Number(grandTotal.toFixed(2));

      const persistInput: PersistOrderInput = {
        branchId,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerSessionId: sessionId,
        fulfillmentType: fulfillment,
        deliveryAddress: isDelivery ? addressTrimmed : null,
        deliveryLandmark: isDelivery ? landmark.trim() || null : null,
        deliveryPincode: isDelivery ? pincode.trim() || null : null,
        deliveryLat: isDelivery && pin ? pin.lat : null,
        deliveryLng: isDelivery && pin ? pin.lng : null,
        subtotal: sub,
        total,
        note: cartNote,
        items: cartItems,
      };

      if (method === 'cash') {
        const orderId = await persistOrder({
          ...persistInput,
          status: 'confirmed',
          paymentStatus: 'cash',
          paymentMethod: 'cash',
        });
        useCustomerAccess.getState().setLastOrderId(orderId);
        toast.success(
          isDelivery
            ? 'Order placed — pay on delivery'
            : 'Order placed — pay at pickup'
        );
        // Cart cleared on /order-success mount — see comment on placingRef.
        navigate('/order-success', { state: { orderId } });
        return;
      }

      // Online payment path: server-create the Razorpay order so we have a
      // verifiable order_id, then open checkout.
      const amountPaise = Math.round(total * 100);
      let rpOrder: { id: string; amount: number; currency: string } | null = null;
      try {
        const { data, error: rpErr } = await supabase.functions.invoke<{
          id: string;
          amount: number;
          currency: string;
        }>('create-razorpay-order', {
          body: { amount: amountPaise, receipt: `vlnk_${Date.now()}` },
        });
        if (rpErr) throw rpErr;
        rpOrder = data ?? null;
      } catch (err) {
        console.error('[razorpay] create-order failed', err);
        toast.error(
          'Online payment is unavailable right now. Please use Cash on ' +
            (isDelivery ? 'Delivery' : 'Pickup') +
            '.',
          { duration: 6000 }
        );
        placingRef.current = false;
        setSubmitting(null);
        return;
      }

      if (!rpOrder?.id) {
        toast.error('Could not create payment order');
        placingRef.current = false;
        setSubmitting(null);
        return;
      }

      // Pre-persist the order BEFORE opening Razorpay. Two reasons:
      //   1. Mobile UPI flow swaps to a UPI app and Razorpay redirects back
      //      to `callback_url` (not the modal handler). The JS context that
      //      held the cart + persistInput may be gone by then, so the only
      //      way to recover the order on the success page is to have it
      //      already in the DB, keyed by id in the callback URL.
      //   2. Even on desktop, this means a successful payment never fails
      //      to save — verify-razorpay-payment just flips the status.
      let internalOrderId: string;
      try {
        internalOrderId = await persistOrder({
          ...persistInput,
          status: 'confirmed',
          paymentStatus: 'unpaid',
          paymentMethod: 'razorpay',
          razorpayOrderId: rpOrder.id,
        });
      } catch (err) {
        console.error('[checkout] pre-persist failed', err);
        toast.error('Could not save your order. Please try again.');
        placingRef.current = false;
        setSubmitting(null);
        return;
      }
      useCustomerAccess.getState().setLastOrderId(internalOrderId);

      // Mobile UPI flow → Razorpay POSTs the response to this URL.
      // /api/razorpay-callback is a Vercel serverless function that
      // 303-redirects to the SPA's /order-success page (Razorpay POSTs,
      // static hosting only accepts GET, so we need a real handler).
      const successUrl = `${window.location.origin}/api/razorpay-callback?orderId=${encodeURIComponent(internalOrderId)}`;

      await initiatePayment({
        amount: rpOrder.amount,
        orderId: rpOrder.id,
        tableNumber: '-', // online order, no table
        description: isDelivery
          ? `Bakery delivery · ${branch?.name ?? 'Van Lavino'}`
          : `Bakery pickup · ${branch?.name ?? 'Van Lavino'}`,
        callbackUrl: successUrl,
        prefill: {
          name: customer.name,
          contact: customer.phone,
        },
        onSuccess: async (resp) => {
          // Desktop modal path. Verify on the server (best-effort —
          // failure here just means staff has to reconcile manually,
          // the order itself is already saved).
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
            console.error('[verify-razorpay] desktop verify failed', err);
          }
          toast.success('Payment received');
          navigate('/order-success', { state: { orderId: internalOrderId } });
          setSubmitting(null);
        },
        onFailure: () => {
          // Modal dismissed without paying. The pre-persisted order stays
          // as `unpaid` — staff can clean it up, or the customer can
          // retry. Nothing to delete because RLS doesn't let customers
          // remove orders, and we don't want to anyway (audit trail).
          placingRef.current = false;
          setSubmitting(null);
          toast('Payment cancelled', { icon: 'ℹ️' });
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      placingRef.current = false;
      setSubmitting(null);
    }
  }

  if (!customer) {
    // Auth effect will bounce; render nothing in the meantime.
    return null;
  }

  return (
    <div className="min-h-screen bg-obsidian text-cream">
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-obsidian/85 border-b border-brand-500/10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <Link
            to="/order"
            className="inline-flex items-center gap-2 text-cream/70 hover:text-brand-600 font-mono text-[11px] uppercase tracking-[0.25em] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to bakery
          </Link>
          <Link
            to="/"
            className="font-display italic text-base md:text-lg text-brand-500 tracking-[0.2em]"
          >
            VAN LAVINO
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-cream/65 hidden sm:inline">
            Checkout
          </span>
        </div>
      </header>

      <div className="h-[68px]" />

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-10 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 lg:gap-10 pb-32">
        {/* Left: form */}
        <section className="space-y-8">
          <div>
            <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-2">
              Step Two
            </p>
            <h1 className="font-display italic text-4xl md:text-5xl text-cream leading-tight">
              How should we get this to you?
            </h1>
          </div>

          {/* Fulfillment toggle */}
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="sr-only">Fulfillment</legend>
            {(
              [
                {
                  value: 'pickup' as const,
                  Icon: ShoppingBag,
                  title: 'Pickup',
                  desc: 'Walk in to your branch',
                },
                {
                  value: 'delivery' as const,
                  Icon: Truck,
                  title: 'Delivery',
                  desc: 'Hyderabad only · we phone-confirm',
                },
              ]
            ).map((opt) => {
              const active = fulfillment === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`relative flex flex-col items-start gap-2 p-5 rounded-2xl border cursor-pointer transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-500/10 shadow-[0_0_0_1px_rgba(193,120,32,0.4)]'
                      : 'border-brand-500/15 bg-obsidian-100/60 hover:border-brand-500/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value={opt.value}
                    checked={active}
                    onChange={() => setFulfillment(opt.value)}
                    className="sr-only"
                  />
                  <span className="w-10 h-10 rounded-full border border-brand-500/40 flex items-center justify-center text-brand-500">
                    <opt.Icon size={16} />
                  </span>
                  <p className="font-display italic text-xl text-cream leading-tight">
                    {opt.title}
                  </p>
                  <p className="text-cream/75 text-xs">{opt.desc}</p>
                  {active && (
                    <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-brand-500" />
                  )}
                </label>
              );
            })}
          </fieldset>

          {/* Branch summary */}
          <div className="rounded-2xl border border-brand-500/15 bg-obsidian-100/60 p-5 flex items-start gap-3">
            <span className="w-9 h-9 rounded-full border border-brand-500/40 text-brand-500 flex items-center justify-center flex-shrink-0">
              <MapPin size={15} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500 mb-1">
                {isDelivery ? 'Dispatched from' : 'Pickup at'}
              </p>
              <p className="font-display italic text-xl text-cream leading-tight">
                {branch?.name ?? '…'}
              </p>
              {branch?.city && (
                <p className="text-cream/75 text-xs mt-0.5">{branch.city}</p>
              )}
              <Link
                to="/order"
                className="inline-block mt-2 font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 hover:text-brand-600 transition-colors"
              >
                Change branch →
              </Link>
            </div>
          </div>

          {/* Delivery address — only when delivery */}
          {isDelivery && (
            <div className="space-y-4 rounded-2xl border border-brand-500/15 bg-obsidian-100/60 p-5">
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
                Delivery details
              </p>
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-[0.25em] text-cream/65 mb-2">
                  Address <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value.slice(0, 400))}
                  rows={3}
                  placeholder="House / flat, building name, street, area"
                  className={`w-full bg-obsidian border rounded-xl px-4 py-3 text-cream placeholder:text-cream/45 focus:outline-none transition-colors text-sm resize-none ${
                    addressTrimmed.length === 0
                      ? 'border-brand-500/20 focus:border-brand-500'
                      : addressValid
                        ? 'border-green-500/40 focus:border-green-500'
                        : 'border-amber-500/50 focus:border-amber-500'
                  }`}
                />
                {addressTrimmed.length > 0 && !addressValid && (
                  <p className="mt-1.5 font-mono text-[10px] tracking-wider text-amber-400">
                    Add a bit more detail so the courier can find you.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-[0.25em] text-cream/65 mb-2">
                    Landmark
                  </label>
                  <input
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value.slice(0, 120))}
                    placeholder="Near…"
                    className="w-full bg-obsidian border border-brand-500/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/45 focus:outline-none focus:border-brand-500 transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-[0.25em] text-cream/65 mb-2">
                    Pincode
                  </label>
                  <input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="500033"
                    className={`w-full bg-obsidian border rounded-xl px-4 py-3 text-cream placeholder:text-cream/45 focus:outline-none transition-colors text-sm tracking-wider font-mono ${
                      pincodeValid
                        ? 'border-brand-500/20 focus:border-brand-500'
                        : 'border-amber-500/50 focus:border-amber-500'
                    }`}
                  />
                  {!pincodeValid && (
                    <p className="mt-1.5 font-mono text-[10px] tracking-wider text-amber-400">
                      Pincode must be 6 digits.
                    </p>
                  )}
                </div>
              </div>

              {/* Drop-pin map. Optional — order saves without it, but
                  including it lights up the destination pin on the
                  customer's /track map and on the rider's console. */}
              <div className="space-y-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cream/65">
                  Pin your exact location <span className="text-cream/60">· optional</span>
                </p>
                <p className="text-cream/75 text-xs leading-relaxed">
                  Tap the map where you&apos;d like the rider to deliver, or
                  use your current GPS. Helps the rider see exactly where
                  you are on their map.
                </p>
                <DeliveryPinPicker
                  value={pin}
                  onChange={setPin}
                  initialCenter={
                    branch?.lat != null && branch?.lng != null
                      ? { lat: branch.lat, lng: branch.lng }
                      : null
                  }
                />
              </div>
            </div>
          )}

          {/* Customer note */}
          <div>
            <div className="flex items-end justify-between mb-2">
              <label
                htmlFor="customer-note"
                className="font-mono text-[11px] uppercase tracking-[0.25em] text-cream/65"
              >
                Notes for the bakery
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
              value={cartNote}
              onChange={(e) => setCartNote(e.target.value)}
              maxLength={CUSTOMER_NOTE_MAX}
              rows={3}
              placeholder="Slice the loaf · No nuts · Buzzer doesn't work"
              className="w-full bg-obsidian-200/40 border border-brand-500/20 rounded-xl px-4 py-3 text-cream text-sm placeholder:text-cream/45 focus:border-brand-500 focus:outline-none resize-none transition-colors"
            />
          </div>
        </section>

        {/* Right: order summary + payment */}
        <aside className="lg:sticky lg:top-24 lg:self-start space-y-6">
          <div className="rounded-3xl border border-brand-500/15 bg-obsidian-100/70 p-6">
            <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
              Your Order · {totalItems} item{totalItems === 1 ? '' : 's'}
            </p>
            <ul className="space-y-3 mb-5 max-h-72 overflow-y-auto pr-2">
              {cartItems.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-brand-500">
                      {i.quantity}×
                    </span>
                    <span className="text-cream/85 truncate">{i.name}</span>
                  </span>
                  <span className="font-display text-base text-brand-500 tabular-nums whitespace-nowrap">
                    ₹{formatPrice(i.price * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-brand-500/10 pt-4 space-y-1.5 font-mono text-sm">
              <div className="flex justify-between text-cream/80">
                <span>Subtotal</span>
                <span>₹{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-cream/70">
                <span>CGST 2.5%</span>
                <span>₹{formatPrice(cgst)}</span>
              </div>
              <div className="flex justify-between text-cream/70">
                <span>SGST 2.5%</span>
                <span>₹{formatPrice(sgst)}</span>
              </div>
              <div className="h-px bg-brand-500/10 my-2" />
              <div className="flex justify-between text-cream font-display text-lg">
                <span>Total</span>
                <span>₹{formatPrice(grandTotal)}</span>
              </div>
              {isDelivery && (
                <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 pt-2">
                  Delivery fee (if any) confirmed by phone
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-brand-500/15 bg-obsidian-100/70 p-6 space-y-3">
            <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase">
              Payment
            </p>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => handleSubmit('online')}
              className="w-full bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting === 'online' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CreditCard size={16} />
              )}
              {submitting === 'online' ? 'Opening checkout…' : 'Pay Online'}
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => handleSubmit('cash')}
              className="w-full border border-brand-500/50 text-brand-600 py-3.5 rounded-full font-medium tracking-wide hover:border-brand-500 hover:text-brand-500 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting === 'cash' ? <Spinner /> : <Wallet size={16} />}
              {submitting === 'cash'
                ? 'Placing order…'
                : isDelivery
                  ? 'Cash on Delivery'
                  : 'Pay at Pickup'}
            </button>
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 text-center pt-1">
              Ordering as {customer.name} · +91 {customer.phone}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------
// persistence
// ----------------------------------------------------------------

interface PersistOrderInput {
  branchId: string;
  customerName: string;
  customerPhone: string;
  customerSessionId: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string | null;
  deliveryLandmark: string | null;
  deliveryPincode: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  subtotal: number;
  total: number;
  note: string;
  items: CartItem[];
  status?: 'pending' | 'confirmed';
  paymentStatus?: 'unpaid' | 'paid' | 'cash';
  paymentMethod?: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}

async function persistOrder(input: PersistOrderInput): Promise<string> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      branch_id: input.branchId,
      table_id: null,
      table_number: null,
      table_token: null,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_session_id: input.customerSessionId,
      status: input.status ?? 'confirmed',
      payment_status: input.paymentStatus ?? 'unpaid',
      payment_method: input.paymentMethod ?? null,
      razorpay_order_id: input.razorpayOrderId ?? null,
      razorpay_payment_id: input.razorpayPaymentId ?? null,
      subtotal: input.subtotal,
      total: input.total,
      customer_note: input.note || null,
      is_manual: false,
      fulfillment_type: input.fulfillmentType,
      delivery_address: input.deliveryAddress,
      delivery_landmark: input.deliveryLandmark,
      delivery_pincode: input.deliveryPincode,
      delivery_lat: input.deliveryLat,
      delivery_lng: input.deliveryLng,
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
