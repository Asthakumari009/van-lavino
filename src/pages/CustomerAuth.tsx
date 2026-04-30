import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import Spinner from '../components/Spinner';
import {
  isValidIndianPhone,
  normalizePhone,
  useCustomerAccess,
} from '../lib/useCustomerAccess';
import { supabase } from '../lib/supabase';

type OtpPhase = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

// Allowed post-auth landing paths. Anything else falls back to /scan so a
// crafted ?next= can't be used to redirect into staff/admin areas.
const SAFE_NEXT_PATHS = new Set(['/scan', '/order', '/order/checkout']);

function resolveNext(raw: string | null): string {
  if (!raw) return '/scan';
  // Only accept absolute on-site paths — block protocol-relative or external URLs.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/scan';
  // Ignore querystring/hash for the allowlist check.
  const path = raw.split(/[?#]/)[0];
  return SAFE_NEXT_PATHS.has(path) ? raw : '/scan';
}

export default function CustomerAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = resolveNext(searchParams.get('next'));
  const setCustomer = useCustomerAccess((s) => s.setCustomer);
  const clearAll = useCustomerAccess((s) => s.clearAll);
  const isCustomerActive = useCustomerAccess((s) => s.isCustomerActive);
  const existingCustomer = useCustomerAccess((s) => s.customer);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [otpPhase, setOtpPhase] = useState<OtpPhase>('idle');
  const [otpCode, setOtpCode] = useState('');

  // Live validity — powers field styling, hint copy, and submit-disabled state.
  const phoneValid = isValidIndianPhone(phone);
  const nameValid = name.trim().length >= 2;
  const canSubmit = nameValid && phoneValid && consent && !submitting;

  useEffect(() => {
    if (isCustomerActive()) {
      navigate(nextPath, { replace: true });
    }
  }, [isCustomerActive, navigate]);

  const e164 = (raw: string) => `+91${normalizePhone(raw)}`;

  async function sendOtp() {
    if (!isValidIndianPhone(phone)) {
      toast.error('Enter a valid Indian phone first');
      return;
    }
    setOtpPhase('sending');
    const { error } = await supabase.auth.signInWithOtp({ phone: e164(phone) });
    if (error) {
      setOtpPhase('idle');
      // Graceful fallback: phone auth not configured on this Supabase project.
      console.error('[otp] send failed', error);
      toast.error(
        "Phone verification isn't available right now. You can still continue without it.",
        { duration: 5000 }
      );
      return;
    }
    setOtpPhase('sent');
    toast.success('Verification code sent');
  }

  async function verifyOtp() {
    if (otpCode.trim().length < 4) {
      toast.error('Enter the code you received');
      return;
    }
    setOtpPhase('verifying');
    const { error } = await supabase.auth.verifyOtp({
      phone: e164(phone),
      token: otpCode.trim(),
      type: 'sms',
    });
    if (error) {
      setOtpPhase('sent');
      toast.error(error.message || 'Code did not match');
      return;
    }
    setOtpPhase('verified');
    toast.success('Phone verified');
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Please enter your full name');
      return;
    }
    if (!isValidIndianPhone(phone)) {
      toast.error('Please enter a valid Indian phone number');
      return;
    }
    if (!consent) {
      toast.error('Please accept to continue');
      return;
    }
    setSubmitting(true);
    setCustomer({ name: trimmed, phone });
    toast.success(otpPhase === 'verified' ? 'Welcome, verified guest' : 'Welcome to Van Lavino');
    navigate('/scan', { replace: true });
  };

  return (
    <div className="min-h-screen bg-obsidian text-cream relative overflow-hidden px-4 sm:px-6 py-12 flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(193,120,32,0.25),transparent_35%),radial-gradient(circle_at_90%_90%,rgba(193,120,32,0.18),transparent_45%)] pointer-events-none" />
      <div className="relative w-full max-w-xl">
        <div className="text-center mb-8">
          <p className="font-mono text-xs text-brand-500 tracking-[0.35em] uppercase mb-4">
            Customer Access
          </p>
          <h1 className="font-display italic text-5xl md:text-6xl text-brand-500 leading-none">
            VAN LAVINO
          </h1>
          <p className="mt-4 text-cream/70 max-w-md mx-auto">
            {nextPath.startsWith('/order')
              ? 'Sign in with your name and phone to continue to bakery checkout.'
              : 'Sign in with your name and phone to continue to your table QR scan.'}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-obsidian-100/90 backdrop-blur-md border border-brand-500/20 rounded-3xl p-5 sm:p-7 md:p-9 shadow-luxury space-y-5"
        >
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-[0.3em] text-brand-500 mb-2">
              Full Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full bg-obsidian border border-brand-500/20 rounded-xl px-4 py-3.5 text-cream placeholder:text-cream/45 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-end justify-between mb-2">
              <label className="block font-mono text-[11px] uppercase tracking-[0.3em] text-brand-500">
                Phone Number
              </label>
              {otpPhase === 'verified' ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] uppercase text-green-400">
                  <ShieldCheck size={12} /> Verified
                </span>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={otpPhase === 'sending' || otpPhase === 'sent'}
                  className="font-mono text-[10px] tracking-[0.2em] uppercase text-cream/70 hover:text-brand-600 transition-colors disabled:opacity-40"
                >
                  {otpPhase === 'sending'
                    ? 'Sending…'
                    : otpPhase === 'sent'
                      ? 'Code sent'
                      : 'Verify with OTP'}
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center px-4 text-cream/70 font-mono text-sm border-r border-brand-500/20 pointer-events-none select-none z-10">
                +91
              </span>
              <input
                value={phone}
                onChange={(e) => {
                  // Normalize as user types: strips +, spaces, country code,
                  // leading zero. What stays in state is always a clean 10-digit
                  // (or in-progress) number.
                  setPhone(normalizePhone(e.target.value).slice(0, 10));
                  if (otpPhase !== 'idle') setOtpPhase('idle');
                }}
                placeholder="98765 43210"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                className={`w-full bg-obsidian rounded-xl pl-16 pr-20 py-3.5 text-cream placeholder:text-cream/45 focus:outline-none transition-colors tracking-wider border ${
                  phone.length === 0
                    ? 'border-brand-500/20 focus:border-brand-500'
                    : phoneValid
                      ? 'border-green-500/50 focus:border-green-500'
                      : 'border-red-500/50 focus:border-red-500'
                }`}
              />
              <span
                className={`absolute inset-y-0 right-0 flex items-center px-4 font-mono text-xs pointer-events-none select-none ${
                  phone.length === 0
                    ? 'text-cream/70'
                    : phoneValid
                      ? 'text-green-400'
                      : 'text-red-400'
                }`}
              >
                {phone.length}/10
              </span>
            </div>
            <p
              className={`mt-1.5 text-[11px] font-mono transition-colors ${
                phone.length === 0
                  ? 'text-cream/60'
                  : phoneValid
                    ? 'text-green-400'
                    : 'text-amber-400'
              }`}
            >
              {phone.length === 0
                ? 'Enter your 10-digit Indian mobile. Country code added automatically.'
                : phoneValid
                  ? '✓ Looks good'
                  : phone.length < 10
                    ? `${10 - phone.length} more digit${10 - phone.length === 1 ? '' : 's'} needed`
                    : 'Indian mobiles start with 6, 7, 8 or 9'}
            </p>

            {(otpPhase === 'sent' || otpPhase === 'verifying') && (
              <div className="mt-3 flex gap-2 animate-in fade-in duration-300 min-w-0">
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter code"
                  inputMode="numeric"
                  maxLength={6}
                  className="flex-1 min-w-0 bg-obsidian border border-brand-500/30 rounded-xl px-3 sm:px-4 py-3 text-cream tracking-[0.25em] sm:tracking-[0.4em] font-mono text-center focus:outline-none focus:border-brand-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otpPhase === 'verifying'}
                  className="flex-shrink-0 px-4 sm:px-5 py-3 rounded-xl border border-brand-500/40 text-brand-500 hover:bg-brand-500 hover:text-ink transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-mono text-sm"
                >
                  {otpPhase === 'verifying' ? <Spinner /> : 'Verify'}
                </button>
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 text-sm text-cream/70 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-brand-500"
            />
            <span>
              I agree to share my details for table service and order updates.
            </span>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-brand-500 text-ink py-3.5 font-medium tracking-wide hover:bg-brand-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Spinner />}
            {nextPath.startsWith('/order') ? 'Continue to Checkout' : 'Continue to QR Scan'}
          </button>

          {existingCustomer && (
            <button
              type="button"
              onClick={() => {
                clearAll();
                setName('');
                setPhone('');
                setConsent(false);
                setOtpPhase('idle');
                setOtpCode('');
                toast.success('Switched to new sign-in');
              }}
              className="block mx-auto font-mono text-[10px] tracking-[0.25em] uppercase text-cream/60 hover:text-brand-600 transition-colors"
            >
              Wrong phone? Switch account
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
