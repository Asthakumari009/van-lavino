import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import Spinner from '../components/Spinner';
import type { Staff } from '../types';

function routeForRole(staff: Staff | null): string | null {
  if (!staff) return null;
  if (staff.role === 'admin') return '/admin';
  if (staff.role === 'staff' || staff.role === 'manager') return '/staff';
  return null;
}

type Phase = 'password' | 'mfa';

export default function Login() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const staffRecord = useAuth((s) => s.staffRecord);
  const currentAal = useAuth((s) => s.currentAal);
  const nextAal = useAuth((s) => s.nextAal);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  // MFA challenge state
  const [phase, setPhase] = useState<Phase>('password');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // This effect only handles the "session restored on mount" case (a
  // staff member loads /login while already signed in from a previous
  // visit). Active sign-in flows route themselves directly via the
  // submit handlers below — relying on this useEffect for that was
  // racing the auth listener and leaving users stuck on "Verifying…"
  // until they refreshed. While `submitting` is true, this effect
  // stays out of the way.
  useEffect(() => {
    if (submitting) return;
    if (!user || !isAuthenticated) return;

    const target = routeForRole(staffRecord);

    if (!target) {
      // Authenticated user has no staff record — refuse access.
      void supabase.auth.signOut();
      setError(true);
      setPhase('password');
      setFactorId(null);
      setCode('');
      toast.error('This account has no staff access.');
      return;
    }

    const mfaSatisfied = !nextAal || nextAal !== 'aal2' || currentAal === 'aal2';
    if (mfaSatisfied) navigate(target, { replace: true });
  }, [submitting, user, isAuthenticated, staffRecord, currentAal, nextAal, navigate]);

  // Direct staff lookup that doesn't go through the zustand store. Used
  // by the submit handlers so we never have to wait for the auth listener
  // to finish its Promise.all before deciding where to route.
  async function fetchStaffDirectly(userId: string): Promise<Staff | null> {
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return (data as Staff | null) ?? null;
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setSubmitting(false);
      setError(true);
      toast.error(signInError.message);
      return;
    }

    // Did this account enroll a TOTP factor? Supabase signals that with
    // nextLevel === 'aal2' while the password sign-in only buys aal1.
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa =
      aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2';

    if (needsMfa) {
      const { data: factors, error: factorsErr } =
        await supabase.auth.mfa.listFactors();
      if (factorsErr) {
        toast.error(factorsErr.message);
        await supabase.auth.signOut();
        setSubmitting(false);
        return;
      }
      const verified = factors.totp.find((f) => f.status === 'verified');
      if (!verified) {
        // Misconfig: aal2 demanded but no verified factor exists.
        toast.error('Two-factor required but no verified device on file.');
        await supabase.auth.signOut();
        setSubmitting(false);
        return;
      }
      setFactorId(verified.id);
      setPhase('mfa');
      setSubmitting(false);
      return;
    }

    // No MFA — resolve staff + route. Store-first: if the listener
    // already populated staffRecord we navigate without an extra
    // round-trip. Otherwise fetch directly.
    const result = await resolveStaffAndRoute('Welcome back');
    if (!result.ok) {
      setSubmitting(false);
      setError(true);
    }
  }

  // Hard-redirect helper. Using `window.location.replace` (not SPA
  // `navigate`) is deliberate: the auth listener races the optimistic
  // AAL setState, and SPA-navigated routes have re-rendered into a
  // bounce-back-to-/login state in past versions of this code. A full
  // reload re-runs initialize() against the fresh session and lets
  // ProtectedRoute render the dashboard with zero in-memory race state.
  // We also kick off a 1.5s safety net — in the rare case the browser
  // hasn't actually torn down the page by then (extension hooks, slow
  // unload), we force the navigation again with `href`.
  function hardRedirect(target: string) {
    window.location.replace(target);
    setTimeout(() => {
      // Still on /login? Force it again. Comparing pathname is good
      // enough — the new page would have unmounted this closure.
      if (typeof window !== 'undefined' && window.location.pathname === '/login') {
        window.location.href = target;
      }
    }, 1500);
  }

  // Read the staff record from the auth store; if it's already there
  // (likely — the password sign-in fired the auth listener seconds ago)
  // we route immediately without any further network calls. Falls back
  // to a direct staff fetch only if the store is empty.
  async function resolveStaffAndRoute(
    successMsg: string
  ): Promise<{ ok: boolean; target?: string }> {
    const stored = useAuth.getState().staffRecord;
    if (stored) {
      const target = routeForRole(stored);
      if (!target) {
        toast.error('This account has no staff access.');
        await supabase.auth.signOut();
        return { ok: false };
      }
      toast.success(successMsg);
      hardRedirect(target);
      return { ok: true, target };
    }

    // Store wasn't populated yet — fall back to a direct query so we
    // don't hang waiting for the listener. Cap the staff query at 4s so
    // a network blip can't strand the user on a "Verifying…" spinner.
    const storeUser = useAuth.getState().user;
    let userId = storeUser?.id;
    if (!userId) {
      const { data: sessionData } = await supabase.auth.getSession();
      userId = sessionData.session?.user.id;
    }
    if (!userId) {
      toast.error('Session went away — please sign in again.');
      return { ok: false };
    }
    const staff = await Promise.race([
      fetchStaffDirectly(userId),
      new Promise<Staff | null>((resolve) =>
        setTimeout(() => resolve(null), 4000)
      ),
    ]);
    const target = routeForRole(staff);
    if (!target) {
      // Staff query timed out or returned nothing. Best guess: send them
      // to /admin — ProtectedRoute will bounce non-admins to /staff or
      // back to /login as appropriate, with the freshly-loaded session.
      toast.success(successMsg);
      hardRedirect('/admin');
      return { ok: true, target: '/admin' };
    }
    toast.success(successMsg);
    hardRedirect(target);
    return { ok: true, target };
  }

  async function onMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    if (code.length < 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setError(false);
    setSubmitting(true);

    // 10s ceiling on challengeAndVerify itself — supabase has been seen
    // to hang on flaky mobile networks and we never want the button to
    // sit on "Verifying…" indefinitely.
    let verifyErr: { message?: string } | null = null;
    try {
      const verifyResult = (await Promise.race([
        supabase.auth.mfa.challengeAndVerify({ factorId, code }),
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ error: { message: 'Verify timed out — try again' } }),
            10_000
          )
        ),
      ])) as { error: { message?: string } | null };
      verifyErr = verifyResult.error ?? null;
    } catch (err) {
      verifyErr = {
        message: err instanceof Error ? err.message : 'Verify failed',
      };
    }

    if (verifyErr) {
      setSubmitting(false);
      setError(true);
      setCode('');
      toast.error(verifyErr.message || 'Code did not match');
      return;
    }

    // Server-side AAL is now aal2. Don't try anything fancy — no
    // staff lookup, no SPA navigate, no awaiting the auth listener.
    // The store almost always has the staff record from the password
    // sign-in's listener fire; we read it best-effort and pick the
    // landing route. If we can't tell, default to /admin and let
    // ProtectedRoute redirect non-admins to /staff.
    const stored = useAuth.getState().staffRecord;
    const target = routeForRole(stored) ?? '/admin';
    toast.success('Verified · welcome back');
    // Three concentric escape hatches: replace fires immediately, the
    // 300ms href catches any browser that ignored the first call, and
    // the 1.5s assign is the last-resort belt-and-suspenders.
    window.location.replace(target);
    setTimeout(() => {
      if (window.location.pathname === '/login') window.location.href = target;
    }, 300);
    setTimeout(() => {
      if (window.location.pathname === '/login') window.location.assign(target);
    }, 1500);
  }

  async function cancelMfa() {
    await supabase.auth.signOut();
    setPhase('password');
    setFactorId(null);
    setCode('');
    setPassword('');
    toast('Signed out · sign in again to retry');
  }

  const inputBase =
    'w-full bg-obsidian rounded-xl px-4 py-3 text-cream placeholder:text-cream/45 focus:outline-none transition-colors';
  const inputClass = error
    ? `${inputBase} border border-red-500/60 focus:border-red-500`
    : `${inputBase} border border-brand-500/15 focus:border-brand-500/50`;

  return (
    <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.18),transparent_60%)] pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <Link
            to="/"
            className="font-display italic text-[48px] leading-none text-brand-500 tracking-[0.15em] inline-block"
          >
            VAN LAVINO
          </Link>
          <p className="font-body text-cream/60 mt-4 text-sm md:text-base">
            Staff &amp; Admin Portal
          </p>
        </div>

        {phase === 'password' ? (
          <form
            onSubmit={onPasswordSubmit}
            className="bg-obsidian-100 border border-brand-500/15 rounded-2xl p-8 space-y-5"
          >
            <div>
              <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(false);
                }}
                className={inputClass}
                placeholder="you@vanlavino.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                className={inputClass}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && <Spinner />}
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={onMfaSubmit}
            className="bg-obsidian-100 border border-brand-500/15 rounded-2xl p-8 space-y-5"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="w-10 h-10 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-500 flex items-center justify-center">
                <ShieldCheck size={18} />
              </span>
              <div>
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
                  Two-factor required
                </p>
                <p className="font-display italic text-xl text-cream leading-tight">
                  Enter your code
                </p>
              </div>
            </div>
            <p className="text-cream/65 text-sm leading-relaxed">
              Open your authenticator app and enter the 6-digit code for Van Lavino.
            </p>
            <div>
              <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
                Authenticator code
              </label>
              <input
                inputMode="numeric"
                autoFocus
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (error) setError(false);
                }}
                maxLength={6}
                className={`${inputClass} text-center tracking-[0.5em] font-mono text-lg`}
                placeholder="••••••"
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || code.length < 6}
              className="w-full bg-brand-500 text-ink py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && <Spinner />}
              {submitting ? 'Verifying…' : 'Verify & Continue'}
            </button>
            <button
              type="button"
              onClick={cancelMfa}
              className="block mx-auto font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 hover:text-brand-600 transition-colors"
            >
              Cancel · Sign in as someone else
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
