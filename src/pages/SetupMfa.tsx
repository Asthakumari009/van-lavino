import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import MfaPanel from '../components/MfaPanel';
import { useAuth } from '../lib/useAuth';

// Standalone MFA enrollment for admins. The ProtectedRoute on /admin
// redirects here when an admin signs in without a verified TOTP factor;
// we keep the page outside the dashboard chrome so they can't browse
// around until they've enrolled.
//
// Once verified, MfaPanel sets currentAal=aal2 in the store and calls
// onEnrolled, which sends the admin into /admin.

export default function SetupMfa() {
  const navigate = useNavigate();
  const isLoading = useAuth((s) => s.isLoading);
  const user = useAuth((s) => s.user);
  const staffRecord = useAuth((s) => s.staffRecord);
  const currentAal = useAuth((s) => s.currentAal);
  const signOut = useAuth((s) => s.signOut);

  // Anyone arriving here without an authenticated session — punt to
  // login. Anyone already at aal2 doesn't need this page; send them
  // home.
  useEffect(() => {
    if (isLoading) return;
    if (!user || !staffRecord) {
      navigate('/login', { replace: true });
      return;
    }
    if (currentAal === 'aal2') {
      navigate(staffRecord.role === 'admin' ? '/admin' : '/staff', {
        replace: true,
      });
    }
  }, [isLoading, user, staffRecord, currentAal, navigate]);

  async function onSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  if (isLoading || !user || !staffRecord) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center">
        <span className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase animate-pulse">
          Loading…
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-cream relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.18),transparent_60%)] pointer-events-none" />
      <header className="relative px-6 md:px-10 py-6 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="font-display italic text-xl md:text-2xl text-brand-500 tracking-[0.2em]"
        >
          VAN LAVINO
        </Link>
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-2 border border-brand-500/30 text-brand-500 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.25em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </header>

      <div className="relative">
        <MfaPanel
          standalone
          onEnrolled={() => {
            // Routing happens here once the panel flips the store to
            // aal2 — the useEffect above picks it up on the next tick
            // and navigates. Calling navigate() too is fine; double
            // navigates with `replace` are idempotent.
            navigate(staffRecord.role === 'admin' ? '/admin' : '/staff', {
              replace: true,
            });
          }}
        />
      </div>
    </div>
  );
}
