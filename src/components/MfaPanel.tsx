import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

// Reusable TOTP enrollment + management UI.
//
// Used in two places:
//   - /admin → Security tab, where it lives inside the existing dashboard
//   - /setup-mfa, the standalone enrollment page admins are forced
//     through when they sign in without a verified factor (after the
//     hard-enforcement turn). The standalone page sets `standalone` so
//     copy + sizing nudge slightly toward "this is the page" rather than
//     "this is one tab among many".

interface MfaFactor {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  status: 'unverified' | 'verified';
  created_at: string;
}

interface EnrollmentDraft {
  factorId: string;
  qrSvg: string;
  uri: string;
  secret: string;
}

export interface MfaPanelProps {
  /** Render in standalone-page mode (used by /setup-mfa). Slightly
   *  larger spacing + page-style heading. Default false. */
  standalone?: boolean;
  /** Called after a successful enrollment (factor verified). Useful for
   *  the standalone setup page so we can navigate the admin into /admin. */
  onEnrolled?: () => void;
}

export default function MfaPanel({ standalone = false, onEnrolled }: MfaPanelProps) {
  const user = useAuth((s) => s.user);
  const currentAal = useAuth((s) => s.currentAal);
  const refreshAal = useAuth((s) => s.refreshAal);

  const [factors, setFactors] = useState<MfaFactor[] | null>(null);
  const [draft, setDraft] = useState<EnrollmentDraft | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFactors = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      setFactors([]);
      return;
    }
    setFactors((data.totp ?? []) as MfaFactor[]);
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const verifiedFactor = useMemo(
    () => factors?.find((f) => f.status === 'verified') ?? null,
    [factors]
  );

  async function startEnrollment() {
    setBusy(true);
    try {
      // Wipe stale unverified factors so a re-attempt always presents a
      // fresh QR. Supabase rejects a second `enroll` while one exists.
      const stale = factors?.filter((f) => f.status === 'unverified') ?? [];
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator',
      });
      if (error || !data) {
        toast.error(error?.message ?? 'Could not start enrollment');
        return;
      }
      setDraft({
        factorId: data.id,
        qrSvg: data.totp.qr_code,
        uri: data.totp.uri,
        secret: data.totp.secret,
      });
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || code.length < 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: draft.factorId,
      code,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Code did not match');
      setCode('');
      return;
    }
    toast.success('Two-factor authentication enabled');
    setDraft(null);
    setCode('');
    // Optimistic AAL bump so the routing useEffect in App / SetupMfa
    // can navigate immediately without waiting on a stale getSession.
    useAuth.setState({ currentAal: 'aal2', nextAal: 'aal2' });
    void refreshAal();
    await loadFactors();
    onEnrolled?.();
  }

  async function cancelEnrollment() {
    if (!draft) return;
    setBusy(true);
    await supabase.auth.mfa.unenroll({ factorId: draft.factorId });
    setBusy(false);
    setDraft(null);
    setCode('');
    void loadFactors();
  }

  async function disableMfa(factorId: string) {
    if (
      !window.confirm(
        'Disable two-factor authentication? You will sign in with just your password until you re-enroll.'
      )
    ) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Two-factor authentication disabled');
    await loadFactors();
    await refreshAal();
  }

  return (
    <section className={standalone ? 'p-6 md:p-10 max-w-3xl mx-auto' : 'p-6 md:p-10 max-w-3xl'}>
      <header className="mb-8">
        <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-2">
          {standalone ? 'Set up before you continue' : 'Security'}
        </p>
        <h1 className="font-display italic text-4xl md:text-5xl text-cream leading-tight">
          Two-factor authentication
        </h1>
        <p className="text-cream/65 mt-3 max-w-xl">
          {standalone
            ? 'Admin accounts must enable an authenticator app before reaching the dashboard. This takes about 30 seconds.'
            : "Add a second sign-in step using an authenticator app (Google Authenticator, Authy, 1Password, etc.). Once enabled, you'll enter a 6-digit code after your password every time you sign in."}
        </p>
      </header>

      {factors === null ? (
        <div className="rounded-2xl bg-obsidian-100 border border-brand-500/15 p-6">
          <p className="text-cream/75 font-mono text-xs tracking-[0.25em] uppercase animate-pulse">
            Loading factors…
          </p>
        </div>
      ) : verifiedFactor ? (
        <EnabledCard
          factor={verifiedFactor}
          aal={currentAal}
          email={user?.email ?? ''}
          onDisable={() => disableMfa(verifiedFactor.id)}
          busy={busy}
        />
      ) : draft ? (
        <EnrollmentCard
          draft={draft}
          code={code}
          setCode={setCode}
          onVerify={verifyEnrollment}
          onCancel={cancelEnrollment}
          busy={busy}
        />
      ) : (
        <DisabledCard onEnable={startEnrollment} busy={busy} forced={standalone} />
      )}
    </section>
  );
}

function DisabledCard({
  onEnable,
  busy,
  forced,
}: {
  onEnable: () => void;
  busy: boolean;
  forced: boolean;
}) {
  return (
    <div className="rounded-2xl bg-obsidian-100 border border-amber-500/30 p-6 md:p-8">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-500 flex items-center justify-center flex-shrink-0">
          <Shield size={20} />
        </span>
        <div className="flex-1">
          <p className="font-display italic text-2xl text-cream leading-tight mb-1">
            {forced ? 'Two-factor required' : 'Two-factor is currently off'}
          </p>
          <p className="text-cream/60 text-sm leading-relaxed mb-5">
            {forced
              ? "Your account has admin privileges, which require an authenticator app for sign-in. Enable it once and we won't ask again until next session."
              : "Anyone with your email and password can sign in. Adding an authenticator app means even a stolen password isn't enough to access this dashboard."}
          </p>
          <button
            onClick={onEnable}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-brand-500 text-ink px-6 py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all disabled:opacity-50"
          >
            <ShieldCheck size={16} />
            Enable two-factor authentication
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrollmentCard({
  draft,
  code,
  setCode,
  onVerify,
  onCancel,
  busy,
}: {
  draft: EnrollmentDraft;
  code: string;
  setCode: (v: string) => void;
  onVerify: (e: React.FormEvent) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={onVerify}
      className="rounded-2xl bg-obsidian-100 border border-brand-500/25 p-6 md:p-8 space-y-6"
    >
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500 mb-2">
          Step 1 · Scan the code
        </p>
        <p className="text-cream/70 text-sm mb-4">
          Open your authenticator app and scan this QR. If you can&apos;t scan,
          paste the secret manually.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5 items-center">
          <div className="bg-white p-3 rounded-xl border border-brand-500/15 inline-block">
            {draft.uri ? (
              <QRCodeSVG value={draft.uri} size={180} includeMargin={false} />
            ) : (
              <div
                className="w-[180px] h-[180px]"
                dangerouslySetInnerHTML={{ __html: draft.qrSvg }}
              />
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/70 mb-1">
              Manual setup secret
            </p>
            <p className="font-mono text-sm text-cream break-all bg-obsidian/60 border border-brand-500/15 rounded-lg px-3 py-2 select-all">
              {draft.secret}
            </p>
            <p className="text-cream/70 text-xs mt-2">
              Type / time-based · 6 digits · 30-second period
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-brand-500/10 pt-6">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500 mb-2">
          Step 2 · Verify
        </p>
        <label className="block text-sm text-cream/70 mb-2">
          Enter the 6-digit code your app is showing right now.
        </label>
        <input
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          maxLength={6}
          placeholder="••••••"
          className="w-full max-w-[240px] bg-obsidian border border-brand-500/20 rounded-xl px-4 py-3 text-cream text-center tracking-[0.5em] font-mono text-lg focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="inline-flex items-center gap-2 bg-brand-500 text-ink px-6 py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all disabled:opacity-50"
        >
          <Check size={16} />
          {busy ? 'Verifying…' : 'Verify & enable'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="font-mono text-[11px] tracking-[0.25em] uppercase text-cream/70 hover:text-brand-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EnabledCard({
  factor,
  aal,
  email,
  onDisable,
  busy,
}: {
  factor: MfaFactor;
  aal: 'aal1' | 'aal2' | null;
  email: string;
  onDisable: () => void;
  busy: boolean;
}) {
  const enrolledOn = new Date(factor.created_at).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return (
    <div className="rounded-2xl bg-obsidian-100 border border-green-500/30 p-6 md:p-8">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/40 text-green-400 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={20} />
        </span>
        <div className="flex-1">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-green-400 mb-1">
            Enabled
          </p>
          <p className="font-display italic text-2xl text-cream leading-tight mb-2">
            Two-factor is on
          </p>
          <p className="text-cream/65 text-sm leading-relaxed mb-4">
            Sign-ins to <span className="text-cream">{email || 'this account'}</span>
            {' '}require a 6-digit authenticator code in addition to your password.
            Enrolled on {enrolledOn}.
          </p>
          {aal === 'aal2' ? (
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] uppercase text-green-400 mb-5">
              <ShieldCheck size={12} /> This session is verified (AAL2)
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] uppercase text-amber-400 mb-5">
              Sign out and back in to verify this session
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onDisable}
              disabled={busy}
              className="inline-flex items-center gap-2 border border-red-500/40 text-red-400 px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.25em] font-mono hover:bg-red-500/15 transition-all disabled:opacity-50"
            >
              <Trash2 size={13} />
              Disable
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
