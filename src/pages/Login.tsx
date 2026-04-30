import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
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

export default function Login() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const staffRecord = useAuth((s) => s.staffRecord);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  // Session restored on mount: if a staff member already has a session
  // when they hit /login, route them to the right dashboard instead of
  // showing the form. While submitting, this stays out of the way so we
  // don't race the active-sign-in handler.
  useEffect(() => {
    if (submitting) return;
    if (!user || !isAuthenticated) return;
    const target = routeForRole(staffRecord);
    if (!target) {
      void supabase.auth.signOut();
      setError(true);
      toast.error('This account has no staff access.');
      return;
    }
    navigate(target, { replace: true });
  }, [submitting, user, isAuthenticated, staffRecord, navigate]);

  // Direct staff lookup — used by the submit handler so we don't have
  // to wait for the auth listener's Promise.all to settle.
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

    // Resolve target route. Store-first; fall back to a direct staff
    // query (capped at 4s) if the auth listener hasn't populated yet.
    const TIMEOUT = '__T__';
    const stored = useAuth.getState().staffRecord;
    let target = routeForRole(stored);
    if (!target) {
      const sessionUserId =
        useAuth.getState().user?.id ??
        (await supabase.auth.getSession()).data.session?.user.id ??
        null;
      if (sessionUserId) {
        const staff = await Promise.race<Staff | null | typeof TIMEOUT>([
          fetchStaffDirectly(sessionUserId),
          new Promise<typeof TIMEOUT>((resolve) =>
            setTimeout(() => resolve(TIMEOUT), 4000)
          ),
        ]);
        if (staff !== TIMEOUT) target = routeForRole(staff);
      }
    }

    if (!target) {
      // Last resort — let ProtectedRoute sort it out from a known route.
      target = '/admin';
    }

    toast.success('Welcome back');
    // Hard redirect via window.location so we sidestep any SPA-router
    // race with the auth listener. Three concentric attempts: replace
    // immediately, href at 300ms, assign at 1.5s.
    window.location.replace(target);
    setTimeout(() => {
      if (window.location.pathname === '/login') window.location.href = target!;
    }, 300);
    setTimeout(() => {
      if (window.location.pathname === '/login') window.location.assign(target!);
    }, 1500);
  }

  // Last-resort escape hatch. Wipes localStorage + sessionStorage +
  // every cache + every SW, then reloads. Should never normally be
  // needed, but it's there for any genuinely stuck state.
  function forceReset() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') || k.startsWith('vanlavino:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* noop */
    }
    try {
      sessionStorage.clear();
    } catch {
      /* noop */
    }
    const reload = () => window.location.replace('/login');
    const swDone =
      'serviceWorker' in navigator
        ? navigator.serviceWorker
            .getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())))
            .catch(() => {})
        : Promise.resolve();
    const cachesDone =
      typeof caches !== 'undefined'
        ? caches
            .keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .catch(() => {})
        : Promise.resolve();
    Promise.allSettled([swDone, cachesDone]).finally(reload);
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

        <button
          type="button"
          onClick={forceReset}
          className="block mx-auto mt-6 font-mono text-[10px] tracking-[0.25em] uppercase text-cream/45 hover:text-amber-400 transition-colors"
        >
          Stuck? Reset session &amp; reload
        </button>
      </div>
    </div>
  );
}
