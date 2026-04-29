import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  History,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
  Sun,
  Ticket,
  Users,
  X as XIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { isValidIndianPhone, normalizePhone } from '../lib/useCustomerAccess';
import type { Branch, Reservation, ReservationStatus } from '../types';

// Opening window, local time. Kept aligned with the Menu kitchen-open heuristic.
const SLOT_START_HOUR = 11;
const SLOT_END_HOUR = 22;
const SLOT_INTERVAL_MIN = 30;

const OCCASIONS = [
  'Just dining',
  'Birthday',
  'Anniversary',
  'Business',
  'Date night',
  'Family',
] as const;

const DURATIONS: Array<{ label: string; minutes: number; default?: boolean }> = [
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90, default: true },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
];

type Step = 'form' | 'success';
type Tab = 'new' | 'my';

type CustomerReservationRow = {
  id: string;
  branch_id: string;
  branch_name: string;
  branch_city: string | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  reserved_at: string;
  occasion: string | null;
  note: string | null;
  status: ReservationStatus;
  confirmation_code: string | null;
  created_at: string;
};

function toLocalDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildSlots(dateStr: string): string[] {
  const slots: string[] = [];
  const now = new Date();
  const isToday = dateStr === toLocalDateInputValue(now);
  for (let h = SLOT_START_HOUR; h <= SLOT_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_INTERVAL_MIN) {
      if (h === SLOT_END_HOUR && m > 0) break;
      if (isToday) {
        const slot = new Date(dateStr + 'T00:00:00');
        slot.setHours(h, m, 0, 0);
        if (slot.getTime() - now.getTime() < 45 * 60_000) continue;
      }
      slots.push(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      );
    }
  }
  return slots;
}

function formatDisplayTime(t: string) {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

const STATUS_CHIP: Record<ReservationStatus, string> = {
  pending: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  confirmed: 'bg-brand-500/15 border-brand-500/40 text-brand-500',
  seated: 'bg-green-500/15 border-green-500/50 text-green-500',
  completed: 'bg-cream/10 border-cream/25 text-cream/70',
  cancelled: 'bg-red-500/10 border-red-500/50 text-red-500',
  no_show: 'bg-red-500/20 border-red-500/60 text-red-500',
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export default function Reserve() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Tabs
  const [tab, setTab] = useState<Tab>(
    params.get('tab') === 'my' ? 'my' : 'new'
  );

  // Branches (shared between tabs)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setBranches((data ?? []) as Branch[]);
      setLoadingBranches(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-obsidian text-cream overflow-x-hidden">
      <Navbar />

      <div className="relative pt-32 md:pt-36 pb-20 px-6 md:px-12 max-w-4xl mx-auto">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(193,120,32,0.12),transparent_55%)] pointer-events-none" />

        <Link
          to="/"
          className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.25em] uppercase text-cream/60 hover:text-brand-500 mb-6 transition"
        >
          <ChevronLeft size={14} />
          Back
        </Link>

        <header className="mb-8 text-center">
          <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-3">
            Van Lavino · Hyderabad
          </p>
          <h1 className="font-display italic text-4xl md:text-6xl text-cream leading-tight mb-3">
            Reservations
          </h1>
          <p className="font-body text-cream/70 max-w-xl mx-auto">
            Book a table or check one you already have — the candles and the
            coffee will be ready.
          </p>
        </header>

        {/* Tab bar */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex gap-1 bg-obsidian-100 border border-brand-500/15 rounded-full p-1">
            <TabButton
              active={tab === 'new'}
              onClick={() => setTab('new')}
              icon={<Sparkles size={14} />}
              label="Book a table"
            />
            <TabButton
              active={tab === 'my'}
              onClick={() => setTab('my')}
              icon={<History size={14} />}
              label="My bookings"
            />
          </div>
        </div>

        {tab === 'new' && (
          <NewBooking
            branches={branches}
            loadingBranches={loadingBranches}
            onFinished={(r) =>
              navigate(`/reserve?tab=my&phone=${r.customer_phone}`, {
                replace: true,
              })
            }
          />
        )}

        {tab === 'my' && (
          <MyBookings initialPhone={params.get('phone') ?? ''} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Tab button
// ------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.22em] font-mono transition-all ${
        active
          ? 'bg-brand-500 text-ink shadow-glow'
          : 'text-cream/70 hover:text-brand-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ------------------------------------------------------------------
// New booking — form + success
// ------------------------------------------------------------------

function NewBooking({
  branches,
  loadingBranches,
  onFinished,
}: {
  branches: Branch[];
  loadingBranches: boolean;
  onFinished: (r: Reservation) => void;
}) {
  const [step, setStep] = useState<Step>('form');
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);

  const [branchId, setBranchId] = useState<string>('');
  const [date, setDate] = useState<string>(toLocalDateInputValue(new Date()));
  const [time, setTime] = useState<string>('');
  const [partySize, setPartySize] = useState<number>(2);
  const [duration, setDuration] = useState<number>(
    DURATIONS.find((d) => d.default)!.minutes
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [occasion, setOccasion] = useState<string>('Just dining');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Default to first branch once loaded, if user didn't pick one.
  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const slots = useMemo(() => buildSlots(date), [date]);
  const { lunch, dinner } = useMemo(() => {
    const l: string[] = [];
    const d: string[] = [];
    for (const s of slots) {
      const hour = Number(s.split(':')[0]);
      if (hour < 16) l.push(s);
      else d.push(s);
    }
    return { lunch: l, dinner: d };
  }, [slots]);

  const todayStr = toLocalDateInputValue(new Date());
  const selectedBranch = branches.find((b) => b.id === branchId);

  // Completeness signal for the sticky summary card
  const isValid =
    !!branchId && !!time && partySize >= 1 && name.trim().length >= 2 &&
    isValidIndianPhone(phone);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) return toast.error('Pick a branch');
    if (!time) return toast.error('Pick a time');
    if (!isValidIndianPhone(phone))
      return toast.error('Please enter a valid 10-digit Indian mobile');
    if (name.trim().length < 2) return toast.error('Enter your full name');

    const [hh, mm] = time.split(':').map(Number);
    const reservedAt = new Date(date + 'T00:00:00');
    reservedAt.setHours(hh, mm, 0, 0);

    setSubmitting(true);
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        branch_id: branchId,
        customer_name: name.trim(),
        customer_phone: normalizePhone(phone),
        customer_email: email.trim() || null,
        party_size: partySize,
        reserved_at: reservedAt.toISOString(),
        duration_minutes: duration,
        occasion: occasion === 'Just dining' ? null : occasion,
        note: note.trim() || null,
      })
      .select('*, branches(name, city)')
      .single();
    setSubmitting(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Could not place reservation');
      return;
    }
    setConfirmed(data as Reservation);
    setStep('success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (step === 'success' && confirmed) {
    return (
      <Success
        reservation={confirmed}
        onAnother={() => {
          setConfirmed(null);
          setStep('form');
          setTime('');
          setNote('');
          setOccasion('Just dining');
        }}
        onMyBookings={() => onFinished(confirmed)}
      />
    );
  }

  return (
    <div className="grid md:grid-cols-[1fr_280px] gap-6 items-start">
      <form
        onSubmit={submit}
        className="relative bg-obsidian-100 border border-brand-500/15 rounded-3xl p-6 md:p-10 space-y-8 shadow-[0_40px_100px_-40px_rgba(10,7,5,0.45)]"
      >
        <Field
          label="Branch"
          icon={<MapPin size={14} />}
          hint={selectedBranch?.city ?? undefined}
        >
          {loadingBranches ? (
            <p className="text-cream/70 text-sm">Loading branches…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {branches.map((b) => {
                const active = branchId === b.id;
                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => setBranchId(b.id)}
                    className={`text-left rounded-xl border px-4 py-3 transition-all ${
                      active
                        ? 'border-brand-500 bg-brand-500/10 text-cream shadow-[0_0_0_1px_rgba(193,120,32,0.35)_inset]'
                        : 'border-brand-500/15 bg-obsidian-50 text-cream/80 hover:border-brand-500/40'
                    }`}
                  >
                    <span className="font-display italic text-lg block leading-tight">
                      {b.name}
                    </span>
                    <span className="font-mono text-[10px] tracking-wider uppercase text-cream/70">
                      {b.city ?? 'Hyderabad'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Date" icon={<Calendar size={14} />}>
            <input
              type="date"
              min={todayStr}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime('');
              }}
              className="w-full bg-obsidian-50 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500 focus:outline-none"
            />
          </Field>
          <Field label="Party size" icon={<Users size={14} />}>
            <div className="flex items-center gap-3 bg-obsidian-50 border border-brand-500/20 rounded-xl px-3 py-2.5">
              <button
                type="button"
                onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                className="w-9 h-9 rounded-full border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-ink transition font-bold"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="flex-1 text-center font-display text-2xl text-cream">
                {partySize}
              </span>
              <button
                type="button"
                onClick={() => setPartySize((n) => Math.min(30, n + 1))}
                className="w-9 h-9 rounded-full border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-ink transition font-bold"
                aria-label="Increase"
              >
                +
              </button>
            </div>
          </Field>
        </div>

        <Field label="Time" icon={<Clock size={14} />}>
          {slots.length === 0 ? (
            <p className="text-cream/75 text-sm italic">
              No seatings left today. Try tomorrow.
            </p>
          ) : (
            <div className="space-y-4">
              {lunch.length > 0 && (
                <SlotGroup
                  title="Lunch · Afternoon"
                  icon={<Sun size={12} />}
                  slots={lunch}
                  selected={time}
                  onSelect={setTime}
                />
              )}
              {dinner.length > 0 && (
                <SlotGroup
                  title="Dinner · Evening"
                  icon={<Sparkles size={12} />}
                  slots={dinner}
                  selected={time}
                  onSelect={setTime}
                />
              )}
            </div>
          )}
        </Field>

        <Field label="How long do you plan to stay?" icon={<Clock size={14} />}>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => {
              const active = duration === d.minutes;
              return (
                <button
                  type="button"
                  key={d.label}
                  onClick={() => setDuration(d.minutes)}
                  className={`px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono transition ${
                    active
                      ? 'bg-brand-500 text-ink'
                      : 'bg-obsidian-50 border border-brand-500/15 text-cream/70 hover:border-brand-500/40'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <p className="font-mono text-[10px] text-cream/60 tracking-wider mt-2">
            Helps us keep the next party on time. Flexible — stay longer if
            you like.
          </p>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Full name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              required
              className="w-full bg-obsidian-50 border border-brand-500/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/35 focus:border-brand-500 focus:outline-none"
            />
          </Field>
          <Field label="Mobile">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              required
              inputMode="tel"
              className="w-full bg-obsidian-50 border border-brand-500/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/35 focus:border-brand-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="Email (optional)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="For a reminder nearer the time"
            className="w-full bg-obsidian-50 border border-brand-500/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/35 focus:border-brand-500 focus:outline-none"
          />
        </Field>

        <Field label="Occasion" icon={<Sparkles size={14} />}>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => {
              const active = o === occasion;
              return (
                <button
                  type="button"
                  key={o}
                  onClick={() => setOccasion(o)}
                  className={`px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono transition ${
                    active
                      ? 'bg-brand-500 text-ink'
                      : 'bg-obsidian-50 border border-brand-500/15 text-cream/70 hover:border-brand-500/40'
                  }`}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Anything we should prepare?">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 400))}
            rows={3}
            placeholder="High chair for toddler · Quiet corner preferred · Surprise cake at 9:00…"
            className="w-full bg-obsidian-50 border border-brand-500/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/35 focus:border-brand-500 focus:outline-none resize-none"
          />
          <p className="text-right font-mono text-[10px] text-cream/60 tracking-wider mt-1">
            {note.length}/400
          </p>
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-500 text-ink py-4 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {submitting ? 'Reserving…' : 'Confirm reservation'}
        </button>
        <p className="text-center text-[11px] text-cream/70 font-mono tracking-wider">
          Free to cancel up to 1 hour before your booking.
        </p>
      </form>

      {/* Sticky live summary — desktop only */}
      <aside className="hidden md:block sticky top-32">
        <LiveSummary
          branch={selectedBranch}
          date={date}
          time={time}
          partySize={partySize}
          duration={duration}
          occasion={occasion}
          isValid={isValid}
        />
      </aside>
    </div>
  );
}

// Time slot group with icon header (Lunch / Dinner)
function SlotGroup({
  title,
  icon,
  slots,
  selected,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  slots: string[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70 mb-2">
        {icon}
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => {
          const active = s === selected;
          return (
            <button
              type="button"
              key={s}
              onClick={() => onSelect(s)}
              className={`px-3.5 py-2 rounded-full text-[12px] font-mono tracking-wider transition-all ${
                active
                  ? 'bg-brand-500 text-ink shadow-glow'
                  : 'bg-obsidian-50 border border-brand-500/20 text-cream/75 hover:border-brand-500/50 hover:text-cream'
              }`}
            >
              {formatDisplayTime(s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Sticky live summary — shows the booking as it's built
function LiveSummary({
  branch,
  date,
  time,
  partySize,
  duration,
  occasion,
  isValid,
}: {
  branch: Branch | undefined;
  date: string;
  time: string;
  partySize: number;
  duration: number;
  occasion: string;
  isValid: boolean;
}) {
  const dateLabel = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '—';
  return (
    <div
      className={`bg-obsidian-100 border rounded-3xl p-6 transition-all duration-500 ${
        isValid
          ? 'border-brand-500/50 shadow-[0_0_0_1px_rgba(193,120,32,0.25),0_30px_70px_-30px_rgba(193,120,32,0.45)]'
          : 'border-brand-500/15'
      }`}
    >
      <p className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase mb-3">
        Your table
      </p>
      <h3 className="font-display italic text-2xl text-cream leading-tight mb-5">
        {branch ? `Van Lavino · ${branch.name}` : 'Pick a branch →'}
      </h3>
      <dl className="space-y-3.5 text-sm">
        <SummaryLine
          label="Date"
          value={dateLabel}
          icon={<Calendar size={12} />}
        />
        <SummaryLine
          label="Time"
          value={time ? formatDisplayTime(time) : '—'}
          icon={<Clock size={12} />}
          gold={!!time}
        />
        <SummaryLine
          label="Party"
          value={`${partySize} guest${partySize > 1 ? 's' : ''}`}
          icon={<Users size={12} />}
        />
        <SummaryLine
          label="Stay"
          value={`${duration} min`}
          icon={<Clock size={12} />}
        />
        {occasion && occasion !== 'Just dining' && (
          <SummaryLine
            label="Occasion"
            value={occasion}
            icon={<Sparkles size={12} />}
          />
        )}
      </dl>
      {isValid && (
        <div className="mt-5 pt-4 border-t border-brand-500/15 flex items-center gap-2 text-brand-500 text-xs font-mono tracking-wider">
          <Check size={14} />
          Ready to confirm
        </div>
      )}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  icon,
  gold,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-cream/70">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm ${
          gold ? 'text-brand-500 font-display text-base' : 'text-cream'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------
// Success screen — after a new booking
// ------------------------------------------------------------------

function Success({
  reservation,
  onAnother,
  onMyBookings,
}: {
  reservation: Reservation;
  onAnother: () => void;
  onMyBookings: () => void;
}) {
  const when = new Date(reservation.reserved_at);
  const dateLabel = when.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = when.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return (
    <div className="relative text-center">
      <div className="flex justify-center mb-8">
        <div className="relative w-28 h-28 rounded-full border-2 border-brand-500 flex items-center justify-center">
          <Check size={48} className="text-brand-500" strokeWidth={2.5} />
          <span className="absolute inset-0 rounded-full border-2 border-brand-500/60 animate-ping" />
        </div>
      </div>
      <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
        Table Reserved
      </p>
      <h1 className="font-display italic text-5xl md:text-6xl text-cream mb-5 leading-tight">
        See you {reservation.party_size > 1 ? 'both' : 'soon'}.
      </h1>

      <div className="bg-obsidian-100 border border-brand-500/20 rounded-3xl p-8 max-w-md mx-auto mb-8 text-left space-y-4 shadow-[0_40px_100px_-40px_rgba(10,7,5,0.5)]">
        <SummaryRow
          label="Confirmation"
          value={reservation.confirmation_code ?? '—'}
          code
        />
        <SummaryRow
          label="Branch"
          value={reservation.branches?.name ?? 'Van Lavino'}
        />
        <SummaryRow label="Date" value={dateLabel} />
        <SummaryRow label="Time" value={timeLabel} />
        <SummaryRow
          label="Party"
          value={`${reservation.party_size} guest${
            reservation.party_size > 1 ? 's' : ''
          }`}
        />
        {reservation.occasion && (
          <SummaryRow label="Occasion" value={reservation.occasion} />
        )}
      </div>

      <p className="text-cream/60 text-sm mb-8">
        A host from {reservation.branches?.name ?? 'the branch'} will call on
        your registered mobile to confirm closer to the time. Save the
        confirmation code above.
      </p>

      <div className="flex flex-col md:flex-row gap-3 items-center justify-center">
        <button
          onClick={onMyBookings}
          className="w-full md:w-auto bg-brand-500 text-ink px-8 py-3.5 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition"
        >
          See My Bookings
        </button>
        <button
          onClick={onAnother}
          className="w-full md:w-auto border border-brand-500/40 text-brand-500 px-8 py-3.5 rounded-full text-sm uppercase tracking-[0.25em] font-mono hover:bg-brand-500 hover:text-ink transition"
        >
          Book another
        </button>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  code,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/75">
        {label}
      </span>
      <span
        className={
          code
            ? 'font-mono text-xl text-brand-500 tracking-[0.35em]'
            : 'font-display italic text-lg text-cream'
        }
      >
        {value}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------
// My Bookings — phone-gated lookup + past/upcoming split + cancel
// ------------------------------------------------------------------

function MyBookings({ initialPhone }: { initialPhone: string }) {
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [loaded, setLoaded] = useState<CustomerReservationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const normalized = normalizePhone(raw);
    if (!isValidIndianPhone(normalized)) {
      toast.error('Enter a valid 10-digit Indian mobile');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('reservations_by_phone', {
      phone_digits: normalized,
    });
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error(error.message);
      return;
    }
    setLoaded((data ?? []) as CustomerReservationRow[]);
  };

  // Auto-lookup if we arrived here after creating a booking
  useEffect(() => {
    if (initialPhone && isValidIndianPhone(initialPhone)) {
      lookup(initialPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(phoneInput);
  };

  const { upcoming, past } = useMemo(() => {
    if (!loaded) return { upcoming: [], past: [] };
    const now = Date.now();
    const up: CustomerReservationRow[] = [];
    const pa: CustomerReservationRow[] = [];
    for (const r of loaded) {
      const when = new Date(r.reserved_at).getTime();
      const isActive =
        r.status !== 'cancelled' &&
        r.status !== 'no_show' &&
        r.status !== 'completed';
      if (when >= now && isActive) up.push(r);
      else pa.push(r);
    }
    // Upcoming — soonest first; Past — most recent first
    up.sort(
      (a, b) =>
        new Date(a.reserved_at).getTime() - new Date(b.reserved_at).getTime()
    );
    pa.sort(
      (a, b) =>
        new Date(b.reserved_at).getTime() - new Date(a.reserved_at).getTime()
    );
    return { upcoming: up, past: pa };
  }, [loaded]);

  const doCancel = async (r: CustomerReservationRow) => {
    if (!r.confirmation_code) {
      toast.error("Missing confirmation code — ask the restaurant to cancel for you.");
      return;
    }
    if (
      !window.confirm(
        `Cancel your booking for ${new Date(r.reserved_at).toLocaleString(
          'en-IN'
        )}?`
      )
    )
      return;
    setCancelling(r.id);
    const { data, error } = await supabase.rpc('cancel_reservation_by_code', {
      reservation_id: r.id,
      code: r.confirmation_code,
    });
    setCancelling(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data === true) {
      toast.success('Reservation cancelled');
      lookup(r.customer_phone);
    } else {
      toast.error(
        "Couldn't cancel — it may be too close to the booking. Please call the branch."
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* Lookup */}
      <form
        onSubmit={onSubmit}
        className="bg-obsidian-100 border border-brand-500/15 rounded-3xl p-6 md:p-8 shadow-[0_40px_100px_-40px_rgba(10,7,5,0.45)]"
      >
        <p className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase mb-2 inline-flex items-center gap-2">
          <Phone size={12} />
          Look up by mobile
        </p>
        <p className="text-cream/60 text-sm mb-4">
          Enter the 10-digit number you used when booking — your past and
          upcoming reservations will appear below.
        </p>
        <div className="flex gap-2">
          <input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="9876543210"
            inputMode="tel"
            className="flex-1 bg-obsidian-50 border border-brand-500/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/35 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 bg-brand-500 text-ink px-6 rounded-xl font-medium tracking-wide hover:bg-brand-400 transition disabled:opacity-60"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Ticket size={14} />
            )}
            {loading ? 'Checking…' : 'Find'}
          </button>
        </div>
      </form>

      {loaded !== null && loaded.length === 0 && (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-3xl p-10 text-center">
          <Ticket size={40} className="text-brand-500/40 mx-auto mb-3" />
          <p className="font-display italic text-2xl text-cream mb-1">
            No bookings found
          </p>
          <p className="text-cream/60 text-sm">
            We couldn't find a reservation on that number. Double-check the
            digits or go ahead and book a new table.
          </p>
        </div>
      )}

      {loaded !== null && loaded.length > 0 && (
        <>
          <section>
            <h2 className="font-display italic text-3xl text-cream mb-1">
              Upcoming
            </h2>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70 mb-4">
              {upcoming.length} booking{upcoming.length === 1 ? '' : 's'}
            </p>
            {upcoming.length === 0 ? (
              <p className="text-cream/75 text-sm italic">
                Nothing upcoming — ready to book another?
              </p>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcoming.map((r) => (
                  <MyResCard
                    key={r.id}
                    r={r}
                    canCancel
                    cancelling={cancelling === r.id}
                    onCancel={() => doCancel(r)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display italic text-3xl text-cream mb-1">
              Past
            </h2>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70 mb-4">
              {past.length} record{past.length === 1 ? '' : 's'}
            </p>
            {past.length === 0 ? (
              <p className="text-cream/75 text-sm italic">
                No past bookings on record.
              </p>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {past.map((r) => (
                  <MyResCard key={r.id} r={r} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MyResCard({
  r,
  canCancel,
  cancelling,
  onCancel,
}: {
  r: CustomerReservationRow;
  canCancel?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
}) {
  const when = new Date(r.reserved_at);
  const dateLabel = when.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeLabel = when.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const chip = STATUS_CHIP[r.status];
  const label = STATUS_LABEL[r.status];
  const tooClose = when.getTime() - Date.now() < 60 * 60_000;

  return (
    <li className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-5 flex flex-col gap-3 hover:border-brand-500/40 transition">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display italic text-xl text-cream leading-tight">
            {r.branch_name}
          </p>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/70 mt-1">
            {r.confirmation_code ?? '—'}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider ${chip}`}
        >
          {label}
        </span>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-cream/65 font-mono text-[10px] tracking-wider uppercase self-center">
          When
        </dt>
        <dd className="text-cream">
          {dateLabel} · <span className="text-brand-600">{timeLabel}</span>
        </dd>
        <dt className="text-cream/65 font-mono text-[10px] tracking-wider uppercase self-center">
          Party
        </dt>
        <dd className="text-cream">
          {r.party_size}{' '}
          <span className="text-cream/75">guest{r.party_size > 1 ? 's' : ''}</span>
        </dd>
        {r.occasion && (
          <>
            <dt className="text-cream/65 font-mono text-[10px] tracking-wider uppercase self-center">
              Occasion
            </dt>
            <dd className="text-cream/85 italic">{r.occasion}</dd>
          </>
        )}
      </dl>
      {r.note && (
        <p className="text-cream/70 italic text-sm leading-snug">"{r.note}"</p>
      )}
      {canCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling || tooClose}
          className="mt-2 inline-flex items-center justify-center gap-1.5 border border-red-500/40 text-red-400 rounded-full py-2 text-[11px] uppercase tracking-[0.2em] font-mono hover:bg-red-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            tooClose ? 'Too close to the booking — call the branch' : undefined
          }
        >
          {cancelling ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <XIcon size={12} />
          )}
          {tooClose ? 'Cancel unavailable' : 'Cancel reservation'}
        </button>
      )}
    </li>
  );
}

// ------------------------------------------------------------------
// Small field wrapper
// ------------------------------------------------------------------

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
          {icon}
          {label}
        </span>
        {hint && <span className="text-[11px] text-cream/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
