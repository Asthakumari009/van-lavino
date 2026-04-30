import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import { QRCodeSVG } from 'qrcode.react';
import MfaPanel from '../components/MfaPanel';
import DeliveryPinPicker from '../components/DeliveryPinPicker';
import { markdownToHtml, slugify } from '../lib/markdown';
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  BookOpenCheck,
  Building2,
  ChartBar,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutGrid,
  LogOut,
  MessageSquareQuote,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Star,
  Trash2,
  UsersRound,
  UtensilsCrossed,
  Wand2,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import type {
  BlogPost,
  Branch,
  Category,
  MenuItem,
  OrderRow,
  OrderWithItems,
  Reservation,
  ReservationStatus,
  RestaurantTable,
  Review,
  Staff,
  StaffRole,
} from '../types';

// ============================================================
// Root
// ============================================================

type View =
  | 'overview'
  | 'branches'
  | 'menu'
  | 'qr'
  | 'reports'
  | 'staff'
  | 'reservations'
  | 'reviews'
  | 'blog'
  | 'security';

const GOLD_SHADES = [
  '#e2b066',
  '#d4903a',
  '#c17820',
  '#a3621a',
  '#7d4a14',
  '#edcf9f',
  '#5a340e',
];

// ------------------------------------------------------------
// Branch filter context — global "viewing which branch" toggle
// that every data-view panel consumes. `branchId = null` means
// aggregate across all branches.
// ------------------------------------------------------------

interface BranchFilterValue {
  branchId: string | null;
  setBranchId: (id: string | null) => void;
  branches: Branch[];
  branchName: string | null;
}

const BranchFilterCtx = createContext<BranchFilterValue>({
  branchId: null,
  setBranchId: () => {},
  branches: [],
  branchName: null,
});

function useBranchFilter() {
  return useContext(BranchFilterCtx);
}

export default function AdminDashboard() {
  const staffRecord = useAuth((s) => s.staffRecord);
  const signOut = useAuth((s) => s.signOut);
  const [view, setView] = useState<View>('overview');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem('vl-admin-branch') || null
  );

  // Persist the selection across reloads so an owner focused on one
  // branch doesn't have to re-pick it every time.
  useEffect(() => {
    if (branchId) window.localStorage.setItem('vl-admin-branch', branchId);
    else window.localStorage.removeItem('vl-admin-branch');
  }, [branchId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      setBranches((data ?? []) as Branch[]);
    })();
  }, []);

  const branchName =
    branches.find((b) => b.id === branchId)?.name ?? null;
  const ctxValue: BranchFilterValue = {
    branchId,
    setBranchId,
    branches,
    branchName,
  };

  const onSignOut = () => {
    // Synchronously wipe Supabase's auth tokens from localStorage so
    // /login boots into an unauthenticated state. Without this,
    // initialize() on /login still finds a cached session and
    // Login.tsx's useEffect bounces the admin right back to /admin —
    // which presents as "I keep clicking sign out and it just goes
    // back to the dashboard". signOut() runs in the background to
    // invalidate the token server-side; we don't await.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* private mode etc. */
    }
    void signOut().catch(() => {});
    window.location.replace('/login');
  };

  return (
    <BranchFilterCtx.Provider value={ctxValue}>
    <div className="min-h-screen bg-obsidian text-cream">
      <Sidebar
        active={view}
        onChange={setView}
        staff={staffRecord}
        onSignOut={onSignOut}
      />
      <main className="md:ml-[260px] min-h-screen">
        {view === 'overview' && <Overview />}
        {view === 'branches' && <Branches />}
        {view === 'menu' && <MenuManagement />}
        {view === 'qr' && <QRGenerator />}
        {view === 'reports' && <SalesReports />}
        {view === 'staff' && <StaffManagement />}
        {view === 'reservations' && <ReservationsAdmin />}
        {view === 'reviews' && <ReviewsManagement />}
        {view === 'blog' && <BlogAdmin />}
        {view === 'security' && <SecurityAdmin />}
      </main>
    </div>
    </BranchFilterCtx.Provider>
  );
}

// ============================================================
// Sidebar
// ============================================================

const NAV: { key: View; label: string; Icon: typeof Building2 }[] = [
  { key: 'overview', label: 'Overview', Icon: ChartBar },
  { key: 'branches', label: 'Branches', Icon: Building2 },
  { key: 'menu', label: 'Menu Management', Icon: UtensilsCrossed },
  { key: 'qr', label: 'QR Generator', Icon: QrCode },
  { key: 'reports', label: 'Sales Reports', Icon: LayoutGrid },
  { key: 'staff', label: 'Staff Management', Icon: UsersRound },
  { key: 'reservations', label: 'Reservations', Icon: BookOpenCheck },
  { key: 'reviews', label: 'Reviews', Icon: MessageSquareQuote },
  { key: 'blog', label: 'Blog', Icon: BookOpen },
  { key: 'security', label: 'Security', Icon: Shield },
];

function Sidebar({
  active,
  onChange,
  staff,
  onSignOut,
}: {
  active: View;
  onChange: (v: View) => void;
  staff: Staff | null;
  onSignOut: () => void;
}) {
  return (
    <aside className="fixed top-0 left-0 z-40 h-full w-[260px] bg-obsidian-100 border-r border-brand-500/10 hidden md:flex flex-col">
      <div className="p-6 border-b border-brand-500/10">
        <Link
          to="/"
          className="font-display italic text-xl text-brand-500 tracking-[0.2em]"
        >
          VAN LAVINO
        </Link>
        <p className="font-mono text-[10px] text-cream/60 tracking-[0.3em] uppercase mt-2">
          Admin
        </p>
      </div>
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <BranchPicker />
      </div>
      {/* Scrollable middle section — nav grows with tabs added, and the
          "Signed in" footer below stays pinned so Sign Out never clips. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1 scrollbar-hide">
        {NAV.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-brand-500/15 text-brand-600 border border-brand-500/30'
                  : 'text-cream/70 hover:text-brand-600 hover:bg-obsidian-50 border border-transparent'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex-shrink-0 px-4 py-3 border-t border-brand-500/10">
        <p className="text-[10px] text-cream/70 uppercase tracking-[0.3em] font-mono mb-0.5">
          Signed in
        </p>
        <p className="text-cream font-display text-base italic truncate">
          {staff?.name || 'Admin'}
        </p>
        <p className="text-[10px] text-cream/70 mb-3 truncate font-mono tracking-wider uppercase">
          {staff?.role}
        </p>
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 border border-brand-500/30 text-brand-500 rounded-full py-2 text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// Sidebar branch picker — feeds BranchFilterCtx for every downstream
// panel. "All branches" means `branchId = null` and aggregate queries.
function BranchPicker() {
  const { branchId, setBranchId, branches, branchName } = useBranchFilter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <p className="font-mono text-[10px] text-cream/60 tracking-[0.3em] uppercase mb-2">
        Viewing
      </p>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-obsidian border border-brand-500/20 hover:border-brand-500/50 rounded-xl px-3 py-2.5 text-left transition"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 size={14} className="text-brand-500 flex-shrink-0" />
          <span className="truncate text-sm text-cream">
            {branchName ?? 'All branches'}
          </span>
        </span>
        <span className="text-cream/60 text-xs font-mono">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-obsidian-50 border border-brand-500/25 rounded-xl shadow-luxury overflow-hidden">
          <button
            onClick={() => {
              setBranchId(null);
              setOpen(false);
            }}
            className={`w-full text-left px-4 py-2.5 text-sm transition ${
              branchId === null
                ? 'bg-brand-500/15 text-brand-600'
                : 'text-cream/80 hover:bg-brand-500/10 hover:text-brand-600'
            }`}
          >
            All branches
            <span className="block font-mono text-[9px] tracking-wider text-cream/60 uppercase mt-0.5">
              Aggregate across {branches.length} location
              {branches.length === 1 ? '' : 's'}
            </span>
          </button>
          <div className="h-px bg-brand-500/10" />
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBranchId(b.id);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition ${
                branchId === b.id
                  ? 'bg-brand-500/15 text-brand-600'
                  : 'text-cream/80 hover:bg-brand-500/10 hover:text-brand-600'
              }`}
            >
              {b.name}
              {b.city && (
                <span className="block font-mono text-[9px] tracking-wider text-cream/60 uppercase mt-0.5">
                  {b.city}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Overview
// ============================================================

function Overview() {
  const { branchId: filterBranchId, branchName } = useBranchFilter();
  const [kpis, setKpis] = useState({
    ordersToday: 0,
    revenueToday: 0,
    activeBranches: 0,
    pendingOrders: 0,
  });
  const [weekly, setWeekly] = useState<Record<string, number | string>[]>([]);
  const [branchNames, setBranchNames] = useState<string[]>([]);
  const [statusPie, setStatusPie] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);

    // Apply branch filter inline on each order query; branches stays
    // unfiltered so we can still show the total branch count.
    let todayQ = supabase
      .from('orders')
      .select('id,total,status')
      .gte('created_at', todayStart.toISOString());
    if (filterBranchId) todayQ = todayQ.eq('branch_id', filterBranchId);

    let weekQ = supabase
      .from('orders')
      .select('id,total,status,branch_id,created_at')
      .gte('created_at', weekStart.toISOString());
    if (filterBranchId) weekQ = weekQ.eq('branch_id', filterBranchId);

    let pendingQ = supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (filterBranchId) pendingQ = pendingQ.eq('branch_id', filterBranchId);

    const [branchesRes, todayRes, weekRes, pendingRes] = await Promise.all([
      supabase.from('branches').select('*'),
      todayQ,
      weekQ,
      pendingQ,
    ]);

    const branches = (branchesRes.data ?? []) as Branch[];
    const activeBranches = branches.filter((b) => b.is_active).length;
    const todayOrders = (todayRes.data ?? []) as OrderRow[];
    const ordersToday = todayOrders.length;
    const revenueToday = todayOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + Number(o.total ?? 0), 0);
    const pendingOrders = pendingRes.count ?? 0;

    setKpis({ ordersToday, revenueToday, activeBranches, pendingOrders });

    // Weekly stacked by branch
    const weekOrders = (weekRes.data ?? []) as OrderRow[];
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const rows: Record<string, Record<string, number>> = {};
    for (const date of dates) rows[date] = {};
    for (const o of weekOrders) {
      if (o.status === 'cancelled') continue;
      const date = new Date(o.created_at).toISOString().slice(0, 10);
      const name = branchMap.get(o.branch_id ?? '') ?? 'Unknown';
      rows[date] = rows[date] ?? {};
      rows[date][name] = (rows[date][name] ?? 0) + Number(o.total ?? 0);
    }
    const names = Array.from(
      new Set(
        weekOrders
          .filter((o) => o.status !== 'cancelled')
          .map((o) => branchMap.get(o.branch_id ?? '') ?? 'Unknown')
      )
    );
    setBranchNames(names);
    setWeekly(
      dates.map((date) => ({
        date: date.slice(5),
        ...Object.fromEntries(names.map((n) => [n, rows[date][n] ?? 0])),
      }))
    );

    // Status distribution
    const counts: Record<string, number> = {};
    for (const o of weekOrders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    setStatusPie(
      Object.entries(counts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    );
    setLoading(false);
  }, [filterBranchId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Overview
        </h1>
        <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
          At a glance · {branchName ?? 'All branches'}
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <KpiCard label="Orders Today" value={kpis.ordersToday.toString()} />
        <KpiCard
          label="Revenue Today"
          value={`₹${kpis.revenueToday.toFixed(2)}`}
        />
        <KpiCard label="Active Branches" value={kpis.activeBranches.toString()} />
        <KpiCard
          label="Pending Orders"
          value={kpis.pendingOrders.toString()}
          live
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6">
          <h2 className="font-display text-2xl text-cream mb-1">
            Revenue by Branch
          </h2>
          <p className="font-mono text-xs text-cream/60 uppercase tracking-[0.3em] mb-6">
            Last 7 days
          </p>
          <div className="h-80">
            {loading ? (
              <Loading />
            ) : branchNames.length === 0 ? (
              <div className="h-full flex items-center justify-center text-cream/60 italic">
                No orders in this window yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <BarChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2520" />
                  <XAxis dataKey="date" stroke="#8b7b69" fontSize={11} />
                  <YAxis stroke="#8b7b69" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: '#0a0908',
                      border: '1px solid rgba(193,120,32,0.3)',
                      borderRadius: 8,
                      color: '#f5ede0',
                    }}
                    cursor={{ fill: 'rgba(193,120,32,0.05)' }}
                  />
                  <Legend wrapperStyle={{ color: '#f5ede0', fontSize: 12 }} />
                  {branchNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="a"
                      fill={GOLD_SHADES[i % GOLD_SHADES.length]}
                      radius={i === branchNames.length - 1 ? [6, 6, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6">
          <h2 className="font-display text-2xl text-cream mb-1">
            Order Status
          </h2>
          <p className="font-mono text-xs text-cream/60 uppercase tracking-[0.3em] mb-6">
            Last 7 days
          </p>
          <div className="h-80">
            {loading ? (
              <Loading />
            ) : statusPie.length === 0 ? (
              <p className="text-cream/60 italic">No orders yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <PieChart>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    stroke="#0a0908"
                  >
                    {statusPie.map((_, i) => (
                      <Cell
                        key={i}
                        fill={GOLD_SHADES[i % GOLD_SHADES.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#0a0908',
                      border: '1px solid rgba(193,120,32,0.3)',
                      borderRadius: 8,
                      color: '#f5ede0',
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#f5ede0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  live,
}: {
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="bg-obsidian-100 rounded-2xl p-6 border-t-2 border-brand-500 relative">
      {live && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
      <p className="font-mono text-[11px] text-brand-500 tracking-[0.3em] uppercase mb-2">
        {label}
      </p>
      <p className="font-display text-4xl text-cream">{value}</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase animate-pulse">
        Loading…
      </span>
    </div>
  );
}

// ============================================================
// Branches
// ============================================================

function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [todayByBranch, setTodayByBranch] = useState<
    Record<string, { count: number; revenue: number }>
  >({});
  const [form, setForm] = useState<{
    name: string;
    address: string;
    city: string;
    pin: { lat: number; lng: number } | null;
  }>({ name: '', address: '', city: '', pin: null });
  const [saving, setSaving] = useState(false);
  const [editingPinFor, setEditingPinFor] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    const { data: bs } = await supabase.from('branches').select('*');
    setBranches((bs ?? []) as Branch[]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: os } = await supabase
      .from('orders')
      .select('branch_id,total,status')
      .gte('created_at', todayStart.toISOString());
    const agg: Record<string, { count: number; revenue: number }> = {};
    for (const o of (os ?? []) as OrderRow[]) {
      const k = o.branch_id ?? '';
      if (!agg[k]) agg[k] = { count: 0, revenue: 0 };
      agg[k].count += 1;
      if (o.status !== 'cancelled')
        agg[k].revenue += Number(o.total ?? 0);
    }
    setTodayByBranch(agg);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    const { error } = await supabase.from('branches').insert({
      name: form.name,
      address: form.address || null,
      city: form.city || null,
      lat: form.pin?.lat ?? null,
      lng: form.pin?.lng ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Branch added');
    setForm({ name: '', address: '', city: '', pin: null });
    load();
  };

  const toggleActive = async (b: Branch) => {
    const { error } = await supabase
      .from('branches')
      .update({ is_active: !b.is_active })
      .eq('id', b.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Branches
        </h1>
        <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
          {branches.length} total
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {branches.map((b) => {
          const today = todayByBranch[b.id] ?? { count: 0, revenue: 0 };
          const hasPin = b.lat != null && b.lng != null;
          return (
            <div
              key={b.id}
              className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6"
            >
              <header className="flex items-start justify-between mb-4 gap-4">
                <div className="min-w-0">
                  <h3 className="font-display italic text-2xl text-cream truncate">
                    {b.name}
                  </h3>
                  <p className="text-sm text-cream/70 truncate">
                    {b.city || '—'}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(b)}
                  className={`text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1 rounded-full border transition-all ${
                    b.is_active
                      ? 'bg-green-500/15 border-green-500/30 text-green-400'
                      : 'bg-red-500/15 border-red-500/30 text-red-400'
                  }`}
                >
                  {b.is_active ? 'Active' : 'Inactive'}
                </button>
              </header>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="font-mono text-[10px] text-cream/60 uppercase tracking-wider mb-1">
                    Orders today
                  </p>
                  <p className="font-display text-2xl text-cream">
                    {today.count}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-cream/60 uppercase tracking-wider mb-1">
                    Revenue
                  </p>
                  <p className="font-display text-2xl text-brand-500">
                    ₹{today.revenue.toFixed(0)}
                  </p>
                </div>
              </div>
              {/* Pin status row — admin can tell at a glance which
                  branches have working coords for the customer map. */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-brand-500/10">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-cream/60 uppercase tracking-wider mb-0.5">
                    Map pin
                  </p>
                  {hasPin ? (
                    <p className="font-mono text-xs text-cream/70 tabular-nums truncate">
                      {b.lat?.toFixed(5)}, {b.lng?.toFixed(5)}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-400 italic">
                      Not set — customer map won&apos;t show this branch
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setEditingPinFor(b)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.25em] font-mono border border-brand-500/40 text-brand-500 hover:bg-brand-500 hover:text-ink transition"
                >
                  {hasPin ? 'Edit pin' : 'Add pin'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6 max-w-xl">
        <h2 className="font-display text-2xl text-cream mb-4">Add Branch</h2>
        <form onSubmit={addBranch} className="space-y-4">
          <FormField
            label="Name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
          />
          <FormField
            label="Address"
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })}
          />
          <FormField
            label="City"
            value={form.city}
            onChange={(v) => setForm({ ...form, city: v })}
          />
          <div>
            <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
              Map pin <span className="text-cream/60">· optional, recommended</span>
            </label>
            <DeliveryPinPicker
              value={form.pin}
              onChange={(pin) => setForm({ ...form, pin })}
              className="w-full h-[220px]"
            />
          </div>
          <button
            disabled={saving}
            className="bg-brand-500 text-ink px-6 py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add branch'}
          </button>
        </form>
      </section>

      {editingPinFor && (
        <BranchPinEditor
          branch={editingPinFor}
          onClose={() => setEditingPinFor(null)}
          onSaved={() => {
            setEditingPinFor(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// Modal for editing an existing branch's lat/lng. Reuses the same
// DeliveryPinPicker the customer uses at checkout for visual consistency.
function BranchPinEditor({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    branch.lat != null && branch.lng != null
      ? { lat: branch.lat, lng: branch.lng }
      : null
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('branches')
      .update({
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
      })
      .eq('id', branch.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${branch.name} pin updated`);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-obsidian-100 border border-brand-500/25 rounded-2xl shadow-luxury overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-brand-500/10 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
              Map pin
            </p>
            <p className="font-display italic text-xl text-cream leading-tight">
              {branch.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-cream/20 text-cream/65 hover:border-red-500/40 hover:text-red-400 flex items-center justify-center"
          >
            ×
          </button>
        </header>
        <div className="p-6 space-y-4">
          <p className="text-cream/65 text-sm">
            Drop the pin on the storefront. The customer&apos;s tracking map
            uses this point as the bakery origin, and the rider&apos;s
            console centres here when they open the trip.
          </p>
          <DeliveryPinPicker
            value={pin}
            onChange={setPin}
            initialCenter={pin}
            className="w-full h-[340px]"
          />
        </div>
        <footer className="px-6 py-4 border-t border-brand-500/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPin(null)}
            disabled={saving || !pin}
            className="font-mono text-[11px] tracking-[0.25em] uppercase text-cream/75 hover:text-red-400 transition disabled:opacity-50"
          >
            Clear pin
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-full text-[11px] uppercase tracking-[0.25em] font-mono border border-cream/20 text-cream/70 hover:text-brand-500 hover:border-brand-500/40 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-brand-500 text-ink px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.25em] font-mono hover:bg-brand-400 hover:shadow-glow transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save pin'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Menu Management
// ============================================================

function MenuManagement() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('branches')
      .select('*')
      .then(({ data }) => setBranches((data ?? []) as Branch[]));
  }, []);

  const load = useCallback(async () => {
    if (!branchId) {
      setCategories([]);
      setItems([]);
      return;
    }
    const [catsRes, itemsRes] = await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('branch_id', branchId)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select('*, categories(name, display_order)')
        .eq('branch_id', branchId)
        .order('created_at'),
    ]);
    setCategories((catsRes.data ?? []) as Category[]);
    setItems((itemsRes.data ?? []) as MenuItem[]);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<string, MenuItem[]>();
    for (const it of items) {
      const k = it.categories?.name ?? 'Uncategorised';
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [items]);

  const addCategory = async () => {
    const name = window.prompt('Category name?');
    if (!name || !branchId) return;
    const { error } = await supabase
      .from('categories')
      .insert({ branch_id: branchId, name, display_order: categories.length });
    if (error) return toast.error(error.message);
    toast.success('Category added');
    load();
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
            Menu Management
          </h1>
          <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
            Items · Categories · Availability
          </p>
        </div>
        {branchId && (
          <div className="flex gap-2">
            <button
              onClick={addCategory}
              className="border border-brand-500/30 text-brand-500 px-5 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
            >
              + Category
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="bg-brand-500 text-ink px-5 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition-all"
            >
              + Add Item
            </button>
          </div>
        )}
      </header>

      <div className="mb-8">
        <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
          Branch
        </label>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="w-full md:w-80 bg-obsidian-100 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
        >
          <option value="">Select branch…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {branchId && grouped.length === 0 && (
        <p className="text-cream/60 italic">No items yet. Click “+ Add Item”.</p>
      )}

      {grouped.map(([catName, its]) => (
        <section key={catName} className="mb-10">
          <h2 className="font-display text-2xl text-brand-500 mb-4">
            {catName}
          </h2>
          <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-3 border-b border-brand-500/10 font-mono text-[10px] tracking-[0.2em] uppercase text-brand-500">
              <span>Name</span>
              <span>Description</span>
              <span>Price</span>
              <span>Veg</span>
              <span>Available</span>
              <span>Deliverable</span>
            </div>
            {its.map((it) => (
              <InlineItemRow key={it.id} item={it} onChanged={load} />
            ))}
          </div>
        </section>
      ))}

      {modalOpen && (
        <AddItemModal
          branchId={branchId}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function InlineItemRow({
  item,
  onChanged,
}: {
  item: MenuItem;
  onChanged: () => void;
}) {
  const save = async (patch: Partial<MenuItem>) => {
    const { error } = await supabase
      .from('menu_items')
      .update(patch)
      .eq('id', item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted');
    onChanged();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-3 border-b border-brand-500/5 items-center">
      <EditableInput
        value={item.name}
        onBlurSave={(v) => v !== item.name && save({ name: v })}
      />
      <EditableInput
        value={item.description ?? ''}
        onBlurSave={(v) => save({ description: v || null })}
      />
      <EditableInput
        value={String(item.price)}
        onBlurSave={(v) => {
          const n = parseFloat(v);
          if (!isNaN(n) && n !== Number(item.price)) save({ price: n });
        }}
      />
      <Toggle
        checked={item.is_veg}
        onChange={(v) => save({ is_veg: v })}
      />
      <Toggle
        checked={item.is_available}
        onChange={(v) => save({ is_available: v })}
      />
      <div className="flex items-center justify-between gap-2">
        <Toggle
          checked={item.is_deliverable}
          onChange={(v) => save({ is_deliverable: v })}
        />
        <button
          onClick={remove}
          className="text-cream/60 hover:text-red-400 text-xs font-mono uppercase tracking-wider"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EditableInput({
  value,
  onBlurSave,
}: {
  value: string;
  onBlurSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onBlurSave(v)}
      className="bg-obsidian border border-brand-500/10 rounded-lg px-3 py-2 text-cream text-sm focus:border-brand-500/40 focus:outline-none"
    />
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-all ${
        checked ? 'bg-brand-500' : 'bg-obsidian-50 border border-brand-500/20'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-cream transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function AddItemModal({
  branchId,
  categories,
  onClose,
  onSaved,
}: {
  branchId: string;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [isVeg, setIsVeg] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isDeliverable, setIsDeliverable] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(price);
    if (!name || isNaN(n)) {
      toast.error('Name and numeric price required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('menu_items').insert({
      branch_id: branchId,
      category_id: categoryId || null,
      name,
      description: description || null,
      price: n,
      is_veg: isVeg,
      is_available: isAvailable,
      is_deliverable: isDeliverable,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Item added');
    onSaved();
  };

  return (
    <Modal onClose={onClose} title="Add Menu Item">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Name" value={name} onChange={setName} required />
        <FormField
          label="Description"
          value={description}
          onChange={setDescription}
        />
        <FormField
          label="Price (₹)"
          value={price}
          onChange={setPrice}
          type="number"
          required
        />
        <div>
          <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
            Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-obsidian border border-brand-500/15 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          >
            <option value="">— Uncategorised —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 text-sm text-cream/80">
            <Toggle checked={isVeg} onChange={setIsVeg} />
            <span>Vegetarian</span>
          </label>
          <label className="flex items-center gap-3 text-sm text-cream/80">
            <Toggle checked={isAvailable} onChange={setIsAvailable} />
            <span>Available</span>
          </label>
          <label className="flex items-center gap-3 text-sm text-cream/80">
            <Toggle checked={isDeliverable} onChange={setIsDeliverable} />
            <span>Deliverable (online order)</span>
          </label>
        </div>
        <button
          disabled={saving}
          className="w-full bg-brand-500 text-ink py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save item'}
        </button>
      </form>
    </Modal>
  );
}

// ============================================================
// QR Generator
// ============================================================

function QRGenerator() {
  const staffRecord = useAuth((s) => s.staffRecord);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [newTableNumber, setNewTableNumber] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: true });

      if (!active) return;

      if (error) {
        toast.error(`Could not load branches: ${error.message}`);
        return;
      }

      const list = (data ?? []) as Branch[];

      if (list.length > 0) {
        setBranches(list);
        setBranchId((prev) => prev || list[0].id);
        return;
      }

      // Fallback for misconfigured environments: if global branch read is
      // blocked, still try the signed-in staff branch so QR generation works.
      if (staffRecord?.branch_id) {
        const { data: oneBranch, error: oneError } = await supabase
          .from('branches')
          .select('*')
          .eq('id', staffRecord.branch_id)
          .maybeSingle();

        if (!active) return;

        if (oneError) {
          toast.error(`Could not load your branch: ${oneError.message}`);
          return;
        }

        if (oneBranch) {
          setBranches([oneBranch as Branch]);
          setBranchId(staffRecord.branch_id);
          return;
        }
      }

      toast.error('No branches found. Add a branch first in Branches tab.');
    })();

    return () => {
      active = false;
    };
  }, [staffRecord?.branch_id]);

  const load = useCallback(async () => {
    if (!branchId) {
      setTables([]);
      return;
    }
    const { data } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('branch_id', branchId)
      .order('table_number');
    setTables((data ?? []) as RestaurantTable[]);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const addTable = async () => {
    if (!newTableNumber || !branchId) return;
    const { error } = await supabase.from('restaurant_tables').insert({
      branch_id: branchId,
      table_number: newTableNumber,
    });
    if (error) return toast.error(error.message);
    toast.success(`Table ${newTableNumber} added`);
    setNewTableNumber('');
    load();
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          QR Generator
        </h1>
        <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
          One QR per table · Customers scan to order
        </p>
      </header>

      <div className="mb-8 flex flex-col md:flex-row gap-4 md:items-end">
        <div className="flex-1">
          <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
            Branch
          </label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full bg-obsidian-100 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          >
            <option value="">Select branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {branchId && (
          <div className="flex gap-2">
            <input
              placeholder="Table number"
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              className="bg-obsidian-100 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none w-40"
            />
            <button
              onClick={addTable}
              className="bg-brand-500 text-ink px-5 py-3 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition-all whitespace-nowrap"
            >
              + Add Table
            </button>
          </div>
        )}
      </div>

      {branchId && tables.length === 0 && (
        <p className="text-cream/60 italic">No tables yet for this branch.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tables.map((t) => (
          <TableQrCard key={t.id} table={t} branchId={branchId} />
        ))}
      </div>
    </div>
  );
}

function TableQrCard({
  table,
  branchId,
}: {
  table: RestaurantTable;
  branchId: string;
}) {
  // Use the current deployment's origin so the QR points at whichever
  // host the admin printed it from — production, preview, or local.
  // Falls back to the Vercel canonical URL for SSR/build time.
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://van-lavino.vercel.app';
  const url = `${origin}/scan?branch=${branchId}&table=${encodeURIComponent(
    table.table_number
  )}&token=${encodeURIComponent(table.qr_token)}`;
  const svgRef = useRef<HTMLDivElement | null>(null);

  const download = () => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 4;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `van-lavino-table-${table.table_number}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      });
    };
    img.src = blobUrl;
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success('URL copied');
  };

  return (
    <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6 flex flex-col items-center">
      <p className="font-display italic text-2xl text-cream mb-4">
        Table {table.table_number}
      </p>
      <div
        ref={svgRef}
        className="bg-white p-4 rounded-xl mb-4"
      >
        <QRCodeSVG value={url} size={180} level="M" />
      </div>
      <div className="flex gap-2 w-full">
        <button
          onClick={download}
          className="flex-1 bg-brand-500 text-ink py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition-all"
        >
          Download PNG
        </button>
        <button
          onClick={copy}
          className="flex-1 border border-brand-500/30 text-brand-500 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
        >
          Copy URL
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Sales Reports
// ============================================================

function SalesReports() {
  // Drive from the global branch filter so reports follow the sidebar
  // selection. Reports can still narrow by date.
  const { branchId, branchName } = useBranchFilter();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const fromIso = new Date(from + 'T00:00:00').toISOString();
    const toIso = new Date(to + 'T23:59:59').toISOString();
    let q = supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setOrders((data ?? []) as OrderWithItems[]);
    setLoading(false);
  }, [from, to, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const nonCancelled = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = nonCancelled.reduce(
    (s, o) => s + Number(o.total ?? 0),
    0
  );
  const totalOrders = orders.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of nonCancelled) {
      for (const it of o.order_items) {
        map.set(it.item_name, (map.get(it.item_name) ?? 0) + it.quantity);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));
  }, [nonCancelled]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of nonCancelled) {
      const d = new Date(o.created_at).toISOString().slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + Number(o.total ?? 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, revenue]) => ({ date: date.slice(5), revenue }));
  }, [nonCancelled]);

  const byPayment = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of nonCancelled) {
      const method = (o.payment_method ?? 'unknown').toLowerCase();
      const bucket =
        method.includes('upi') || method === 'razorpay' // razorpay rides UPI/card — treat as razorpay bucket
          ? 'Razorpay'
          : method === 'cash'
            ? 'Cash'
            : method === 'card'
              ? 'Card'
              : method.charAt(0).toUpperCase() + method.slice(1);
      map.set(bucket, (map.get(bucket) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [nonCancelled]);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Sales Reports
        </h1>
        <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
          Revenue · Top sellers · Payment mix · {branchName ?? 'All branches'}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 items-end max-w-xl">
        <div>
          <label className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase block mb-2">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full bg-obsidian-100 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-brand-500 tracking-[0.3em] uppercase block mb-2">
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full bg-obsidian-100 border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Orders" value={totalOrders.toString()} />
        <KpiCard label="Revenue" value={`₹${totalRevenue.toFixed(2)}`} />
        <KpiCard label="Avg Order" value={`₹${avgOrder.toFixed(2)}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <section className="xl:col-span-2 bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6">
          <h2 className="font-display text-2xl text-cream mb-6">
            Revenue by Day
          </h2>
          <div className="h-72">
            {loading ? (
              <Loading />
            ) : byDay.length === 0 ? (
              <p className="text-cream/60 italic">No orders in range.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <LineChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2520" />
                  <XAxis dataKey="date" stroke="#8b7b69" fontSize={11} />
                  <YAxis stroke="#8b7b69" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: '#0a0908',
                      border: '1px solid rgba(193,120,32,0.3)',
                      borderRadius: 8,
                      color: '#f5ede0',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#c17820"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#e2b066' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6">
          <h2 className="font-display text-2xl text-cream mb-6">
            Payment Mix
          </h2>
          <div className="h-72">
            {byPayment.length === 0 ? (
              <p className="text-cream/60 italic">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <PieChart>
                  <Pie
                    data={byPayment}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    paddingAngle={3}
                    stroke="#0a0908"
                  >
                    {byPayment.map((_, i) => (
                      <Cell
                        key={i}
                        fill={GOLD_SHADES[i % GOLD_SHADES.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#0a0908',
                      border: '1px solid rgba(193,120,32,0.3)',
                      borderRadius: 8,
                      color: '#f5ede0',
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#f5ede0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <section className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-6">
        <h2 className="font-display text-2xl text-cream mb-6">
          Top 5 Selling Items
        </h2>
        {topItems.length === 0 ? (
          <p className="text-cream/60 italic">No data.</p>
        ) : (
          <ul className="space-y-3">
            {topItems.map((it, i) => (
              <li
                key={it.name}
                className="flex items-center gap-4 p-3 bg-obsidian-50 rounded-xl"
              >
                <span className="font-display italic text-3xl text-brand-500 w-8 text-center">
                  {i + 1}
                </span>
                <span className="flex-1 text-cream">{it.name}</span>
                <span className="font-mono text-sm text-brand-600">
                  {it.qty} sold
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Staff Management
// ============================================================

interface StaffRow extends Staff {
  branches?: { name: string } | null;
  email?: string;
}

function StaffManagement() {
  const { branchId: filterBranchId, branchName } = useBranchFilter();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    let staffQ = supabase.from('staff').select('*, branches(name)');
    if (filterBranchId) staffQ = staffQ.eq('branch_id', filterBranchId);
    const [stRes, brRes] = await Promise.all([
      staffQ,
      supabase.from('branches').select('*'),
    ]);
    setStaff((stRes.data ?? []) as StaffRow[]);
    setBranches((brRes.data ?? []) as Branch[]);
  }, [filterBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRole = async (id: string, role: StaffRole) => {
    const { error } = await supabase.from('staff').update({ role }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Role updated');
    load();
  };

  const reassignBranch = async (id: string, newBranchId: string) => {
    const { error } = await supabase
      .from('staff')
      .update({ branch_id: newBranchId || null })
      .eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Branch updated');
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this staff member?')) return;
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Removed');
    load();
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
            Staff Management
          </h1>
          <p className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase">
            {staff.length} members · {branchName ?? 'All branches'}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-brand-500 text-ink px-5 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition-all"
        >
          + Invite Staff
        </button>
      </header>

      <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-500/10 text-left font-mono text-[11px] tracking-[0.2em] uppercase text-brand-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-cream/60 italic"
                >
                  No staff yet. Click “+ Invite Staff”.
                </td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-brand-500/5 hover:bg-obsidian-50/50"
                >
                  <td className="px-4 py-3 text-cream">
                    {s.name || <span className="italic text-cream/60">—</span>}
                  </td>
                  <td className="px-4 py-3 text-cream/70">
                    <select
                      value={s.branch_id ?? ''}
                      onChange={(e) => reassignBranch(s.id, e.target.value)}
                      className="bg-obsidian border border-brand-500/20 rounded-lg px-3 py-1.5 text-cream text-xs focus:border-brand-500/50 focus:outline-none"
                    >
                      <option value="">— no branch —</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.role}
                      onChange={(e) =>
                        updateRole(s.id, e.target.value as StaffRole)
                      }
                      className="bg-obsidian border border-brand-500/20 rounded-lg px-3 py-1.5 text-cream text-xs focus:border-brand-500/50 focus:outline-none"
                    >
                      <option value="staff">staff</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(s.id)}
                      className="text-cream/60 hover:text-red-400 text-xs font-mono uppercase tracking-wider"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <InviteStaffModal
          branches={branches}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function InviteStaffModal({
  branches,
  onClose,
  onSaved,
}: {
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Pre-seed with the currently-filtered branch so if the admin is
  // viewing "Jubilee Hills" and clicks Invite, the modal defaults there.
  const { branchId: filterBranchId } = useBranchFilter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(
    filterBranchId ?? branches[0]?.id ?? ''
  );
  const [role, setRole] = useState<StaffRole>('staff');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !branchId) {
      toast.error('Email and branch required');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      error?: string;
    }>('invite-staff', {
      body: { email, branch_id: branchId, role, name },
    });
    setSaving(false);
    if (error) {
      const msg = await readFunctionError(error);
      return toast.error(msg, { duration: 6000 });
    }
    if (data && !data.ok)
      return toast.error(data.error ?? 'Invite failed');
    toast.success('Invite sent');
    onSaved();
  };

  return (
    <Modal onClose={onClose} title="Invite Staff">
      <form onSubmit={submit} className="space-y-4">
        <FormField
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          required
        />
        <FormField label="Name" value={name} onChange={setName} />
        <div>
          <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
            Branch
          </label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full bg-obsidian border border-brand-500/15 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          >
            <option value="">Select branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="w-full bg-obsidian border border-brand-500/15 rounded-xl px-4 py-3 text-cream focus:border-brand-500/50 focus:outline-none"
          >
            <option value="staff">staff</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button
          disabled={saving}
          className="w-full bg-brand-500 text-ink py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 transition-all disabled:opacity-50"
        >
          {saving ? 'Sending invite…' : 'Send invite'}
        </button>
      </form>
    </Modal>
  );
}

// ============================================================
// Shared bits
// ============================================================

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative bg-obsidian-100 border border-brand-500/20 rounded-2xl w-full max-w-md p-6">
        <header className="flex items-center justify-between mb-6">
          <h2 className="font-display italic text-2xl text-cream">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full border border-brand-500/30 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-ink transition-all"
          >
            <X size={14} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase block mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-obsidian border border-brand-500/15 rounded-xl px-4 py-3 text-cream placeholder:text-cream/45 focus:border-brand-500/50 focus:outline-none"
      />
    </div>
  );
}

// ============================================================
// Reviews Management
// ============================================================

type ReviewFilter = 'all' | 'featured' | 'hidden' | 'low';

function ReviewsManagement() {
  const { branchId: filterBranchId, branchName } = useBranchFilter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>('all');

  const load = useCallback(async () => {
    let q = supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filterBranchId) q = q.eq('branch_id', filterBranchId);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    setReviews((data ?? []) as Review[]);
    setLoading(false);
  }, [filterBranchId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin-reviews')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reviews' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'featured':
        return reviews.filter((r) => r.is_featured);
      case 'hidden':
        return reviews.filter((r) => !r.is_published);
      case 'low':
        return reviews.filter((r) => r.rating <= 2);
      default:
        return reviews;
    }
  }, [reviews, filter]);

  const stats = useMemo(() => {
    const n = reviews.length;
    if (n === 0) return { avg: 0, n: 0, dist: [0, 0, 0, 0, 0] };
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const dist = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1] += 1;
    });
    return { avg: sum / n, n, dist };
  }, [reviews]);

  const toggleField = async (
    id: string,
    field: 'is_featured' | 'is_published',
    value: boolean
  ) => {
    const { error } = await supabase
      .from('reviews')
      .update({ [field]: value })
      .eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
    toast.success(
      field === 'is_featured'
        ? value
          ? 'Featured on landing'
          : 'Un-featured'
        : value
        ? 'Published'
        : 'Hidden from landing'
    );
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Reviews
        </h1>
        <p className="text-cream/60">
          Customer feedback, live.{' '}
          <span className="text-brand-600">
            {branchName ? `Showing ${branchName} only.` : 'All branches.'}
          </span>
        </p>
      </header>

      <AiInsightsPanel branchId={filterBranchId} />

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Average"
          value={stats.n ? stats.avg.toFixed(1) : '—'}
          icon={<Star size={16} className="text-brand-500 fill-brand-500" />}
        />
        <StatCard label="Total reviews" value={String(stats.n)} />
        <StatCard
          label="Featured"
          value={String(reviews.filter((r) => r.is_featured).length)}
          icon={<Sparkles size={16} className="text-brand-500" />}
        />
        <StatCard
          label="Low-rated (≤2)"
          value={String(reviews.filter((r) => r.rating <= 2).length)}
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide">
        {([
          ['all', `All (${reviews.length})`],
          ['featured', 'Featured'],
          ['hidden', 'Hidden'],
          ['low', 'Low-rated'],
        ] as Array<[ReviewFilter, string]>).map(([key, label]) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono transition-all whitespace-nowrap ${
                active
                  ? 'bg-brand-500 text-ink'
                  : 'bg-obsidian-100 text-cream/70 border border-brand-500/10 hover:text-brand-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-cream/70">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-10 text-center">
          <MessageSquareQuote
            size={40}
            className="text-brand-500/40 mx-auto mb-3"
          />
          <p className="font-display italic text-2xl text-cream mb-2">
            No reviews here yet
          </p>
          <p className="text-cream/60 text-sm">
            Once customers finish a meal, they'll see a prompt to review.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((r) => (
            <AdminReviewCard
              key={r.id}
              review={r}
              onFeature={(v) => toggleField(r.id, 'is_featured', v)}
              onPublish={(v) => toggleField(r.id, 'is_published', v)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-5">
      <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70 mb-2 flex items-center gap-2">
        {icon}
        {label}
      </p>
      <p className="font-display text-3xl text-brand-500">{value}</p>
    </div>
  );
}

function AdminReviewCard({
  review,
  onFeature,
  onPublish,
}: {
  review: Review;
  onFeature: (v: boolean) => void;
  onPublish: (v: boolean) => void;
}) {
  return (
    <li
      className={`bg-obsidian-100 border rounded-2xl p-5 transition-colors ${
        review.is_published
          ? 'border-brand-500/10 hover:border-brand-500/30'
          : 'border-red-500/20 opacity-80'
      }`}
    >
      <header className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-1 mb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={14}
                className={
                  i < review.rating
                    ? 'text-brand-500 fill-brand-500'
                    : 'text-cream/20'
                }
              />
            ))}
          </div>
          <p className="font-display italic text-lg text-cream">
            {review.customer_name || 'Anonymous guest'}
          </p>
          <p className="font-mono text-[10px] tracking-wider text-cream/60 mt-1">
            {new Date(review.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onFeature(!review.is_featured)}
            title={review.is_featured ? 'Un-feature' : 'Feature on landing'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono transition ${
              review.is_featured
                ? 'bg-brand-500 text-ink'
                : 'border border-brand-500/30 text-brand-500 hover:bg-brand-500/10'
            }`}
          >
            <Sparkles size={12} />
            {review.is_featured ? 'Featured' : 'Feature'}
          </button>
          <button
            onClick={() => onPublish(!review.is_published)}
            title={review.is_published ? 'Hide' : 'Publish'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono transition ${
              review.is_published
                ? 'border border-cream/20 text-cream/70 hover:text-red-400 hover:border-red-400/50'
                : 'border border-red-500/40 text-red-400 hover:bg-red-500/10'
            }`}
          >
            {review.is_published ? (
              <>
                <EyeOff size={12} /> Hide
              </>
            ) : (
              <>
                <Eye size={12} /> Show
              </>
            )}
          </button>
        </div>
      </header>
      {review.body && (
        <p className="text-cream/80 italic leading-relaxed">"{review.body}"</p>
      )}
    </li>
  );
}

// ============================================================
// AI Insights panel — talks to the `ai-insights` Gemini edge function
// ============================================================

// `supabase.functions.invoke` swallows non-2xx bodies behind a generic
// "Edge Function returned a non-2xx status code". We reach into the
// attached Response (on FunctionsHttpError.context) and extract the
// actual server message so the admin sees "GEMINI_API_KEY is not
// configured" instead of a useless stack.
async function readFunctionError(err: unknown): Promise<string> {
  const e = err as { context?: Response; message?: string } | null;
  const res = e?.context;
  if (res && typeof res.text === 'function') {
    try {
      const body = await res.clone().text();
      if (body) {
        try {
          const parsed = JSON.parse(body) as { error?: string };
          if (parsed?.error) return parsed.error;
        } catch {
          // Non-JSON body, fall through and return raw text.
        }
        return body.slice(0, 400);
      }
    } catch {
      /* ignore */
    }
  }
  return e?.message ?? 'Request failed';
}

function AiInsightsPanel({ branchId }: { branchId: string | null }) {
  type Result = { text: string; at: Date } | null;
  const [insights, setInsights] = useState<Result>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);

  // Chat
  type ChatMsg = { role: 'user' | 'ai'; text: string };
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const runInsights = async () => {
    setLoadingInsights(true);
    setPanelError(null);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        text?: string;
        error?: string;
      }>('ai-insights', {
        body: { kind: 'review_insights', days, branch_id: branchId },
      });
      if (error) {
        const msg = await readFunctionError(error);
        throw new Error(msg);
      }
      if (!data?.ok || !data.text) {
        throw new Error(data?.error ?? 'No response from Gemini');
      }
      setInsights({ text: data.text, at: new Date() });
    } catch (err) {
      console.error('[ai-insights]', err);
      const raw = err instanceof Error ? err.message : 'Unknown error';
      setPanelError(raw);
      toast.error(raw, { duration: 6000 });
    } finally {
      setLoadingInsights(false);
    }
  };

  const sendChat = async () => {
    const q = draft.trim();
    if (!q || chatBusy) return;
    setChat((prev) => [...prev, { role: 'user', text: q }]);
    setDraft('');
    setChatBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        text?: string;
        error?: string;
      }>('ai-insights', {
        body: { kind: 'chat', prompt: q, branch_id: branchId },
      });
      if (error) {
        const msg = await readFunctionError(error);
        throw new Error(msg);
      }
      if (!data?.ok || !data.text) {
        throw new Error(data?.error ?? 'No response');
      }
      setChat((prev) => [...prev, { role: 'ai', text: data.text! }]);
    } catch (err) {
      console.error('[ai-insights chat]', err);
      setChat((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `⚠️ ${
            err instanceof Error ? err.message : 'Request failed.'
          }`,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <section className="mb-10 relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-obsidian-100 via-obsidian-100 to-obsidian-50 p-6 md:p-8">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-[radial-gradient(circle,rgba(193,120,32,0.18),transparent_70%)] pointer-events-none" />

      <div className="relative flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <Wand2 size={18} className="text-brand-500" />
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
              Gemini 2.0 Flash · AI Assistant
            </span>
          </div>
          <h2 className="font-display italic text-3xl md:text-4xl text-cream">
            Insights &amp; Advice
          </h2>
          <p className="text-cream/60 text-sm max-w-xl mt-1">
            Pull a sentiment read of recent reviews, spot urgent flags,
            and get three concrete actions for the week ahead.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-obsidian border border-brand-500/20 text-cream text-sm rounded-full px-4 py-2 font-mono"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
          </select>
          <button
            onClick={runInsights}
            disabled={loadingInsights}
            className="inline-flex items-center gap-2 bg-brand-500 text-ink px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 hover:shadow-glow transition disabled:opacity-50"
          >
            <Sparkles size={14} />
            {loadingInsights ? 'Thinking…' : 'Generate insights'}
          </button>
        </div>
      </div>

      {/* Insights output */}
      <div className="relative">
        {panelError && (
          <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-300 p-4 text-sm leading-relaxed">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-red-400 mb-1">
              AI Insights Error
            </p>
            <p>{panelError}</p>
            {panelError.toLowerCase().includes('gemini_api_key') && (
              <p className="mt-2 text-xs text-red-200/80">
                Set it once from your terminal:{' '}
                <code className="bg-red-500/20 px-1.5 py-0.5 rounded">
                  supabase secrets set GEMINI_API_KEY=YOUR_KEY
                </code>
                , then{' '}
                <code className="bg-red-500/20 px-1.5 py-0.5 rounded">
                  supabase functions deploy ai-insights --no-verify-jwt
                </code>
                .
              </p>
            )}
          </div>
        )}
        {loadingInsights ? (
          <div className="bg-obsidian border border-brand-500/10 rounded-2xl p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-3 rounded skeleton-sweep"
                style={{ width: `${70 + Math.random() * 25}%` }}
              />
            ))}
          </div>
        ) : insights ? (
          <div className="bg-obsidian border border-brand-500/10 rounded-2xl p-6">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/60 mb-3">
              Generated {insights.at.toLocaleString()}
            </p>
            <MarkdownLite text={insights.text} />
          </div>
        ) : (
          <p className="text-cream/70 text-sm italic">
            No insights yet — pick a window and press “Generate insights”.
          </p>
        )}
      </div>

      {/* Chat */}
      <div className="relative mt-8 pt-6 border-t border-brand-500/10">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/70 mb-3">
          Ask Gemini anything about your restaurant
        </p>
        {chat.length > 0 && (
          <ul className="space-y-3 mb-4 max-h-[320px] overflow-y-auto pr-2">
            {chat.map((m, i) => (
              <li
                key={i}
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-brand-500/10 border border-brand-500/20 text-cream'
                    : 'bg-obsidian border border-brand-500/10 text-cream/85'
                }`}
              >
                <span className="font-mono text-[9px] tracking-[0.3em] uppercase block mb-1 text-cream/60">
                  {m.role === 'user' ? 'You' : 'Gemini'}
                </span>
                {m.role === 'ai' ? <MarkdownLite text={m.text} /> : m.text}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
            placeholder="e.g. Which branch should I focus on this week?"
            className="flex-1 bg-obsidian border border-brand-500/20 rounded-full px-4 py-3 text-cream text-sm placeholder:text-cream/45 focus:border-brand-500/60 focus:outline-none"
          />
          <button
            onClick={sendChat}
            disabled={chatBusy || draft.trim().length === 0}
            className="inline-flex items-center gap-2 bg-brand-500 text-ink px-4 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition disabled:opacity-50"
            aria-label="Send"
          >
            <Send size={14} />
            {chatBusy ? '…' : 'Ask'}
          </button>
        </div>
      </div>
    </section>
  );
}

// Tiny markdown-ish renderer: handles ## headings, - bullets, **bold**, blank lines.
// Enough for Gemini's structured output without pulling in a parser.
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul
        key={`ul-${key}`}
        className="list-disc list-outside pl-5 text-cream/85 text-sm space-y-1.5 my-2"
      >
        {listBuffer.map((li, i) => (
          <li key={i}>{renderInline(li)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const renderInline = (s: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    // split on **bold**
    const regex = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = regex.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      parts.push(
        <strong key={`b-${k++}`} className="text-brand-600 font-semibold">
          {m[1]}
        </strong>
      );
      last = regex.lastIndex;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      flushList(String(i));
      elements.push(
        <h3
          key={`h-${i}`}
          className="font-display italic text-xl text-brand-500 mt-5 mb-2 first:mt-0"
        >
          {line.replace(/^##\s+/, '')}
        </h3>
      );
    } else if (/^\s*-\s+/.test(line)) {
      listBuffer.push(line.replace(/^\s*-\s+/, ''));
    } else if (line === '') {
      flushList(String(i));
    } else {
      flushList(String(i));
      elements.push(
        <p key={`p-${i}`} className="text-cream/85 text-sm leading-relaxed my-1.5">
          {renderInline(line)}
        </p>
      );
    }
  });
  flushList('end');

  return <div>{elements}</div>;
}

// ============================================================
// Reservations Admin panel (branch-filtered, full history + stats)
// ============================================================

type ResAdminFilter = 'today' | 'week' | 'all' | 'pending';

const RES_STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
];

function ReservationsAdmin() {
  const { branchId, branchName } = useBranchFilter();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResAdminFilter>('today');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('reservations')
      .select('*, branches(name, city)')
      .order('reserved_at', { ascending: false })
      .limit(500);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as Reservation[]);
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin-reservations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const stats = useMemo(() => {
    const now = Date.now();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startTomorrow = new Date(startToday);
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startNextWeek = new Date(startToday);
    startNextWeek.setDate(startNextWeek.getDate() + 7);

    const future = rows.filter(
      (r) =>
        new Date(r.reserved_at).getTime() > now &&
        r.status !== 'cancelled' &&
        r.status !== 'no_show'
    );
    const todayCount = rows.filter((r) => {
      const t = new Date(r.reserved_at).getTime();
      return (
        t >= startToday.getTime() &&
        t < startTomorrow.getTime() &&
        r.status !== 'cancelled'
      );
    }).length;
    const weekCount = rows.filter((r) => {
      const t = new Date(r.reserved_at).getTime();
      return (
        t >= startToday.getTime() &&
        t < startNextWeek.getTime() &&
        r.status !== 'cancelled'
      );
    }).length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const noShow30 = rows.filter((r) => {
      if (r.status !== 'no_show') return false;
      const t = new Date(r.reserved_at).getTime();
      return t > now - 30 * 86_400_000;
    }).length;
    const avgParty =
      future.length === 0
        ? 0
        : future.reduce((s, r) => s + r.party_size, 0) / future.length;
    return { todayCount, weekCount, pending, noShow30, avgParty };
  }, [rows]);

  const visible = useMemo(() => {
    const now = Date.now();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startTomorrow = new Date(startToday);
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startNextWeek = new Date(startToday);
    startNextWeek.setDate(startNextWeek.getDate() + 7);
    switch (filter) {
      case 'today':
        return rows.filter((r) => {
          const t = new Date(r.reserved_at).getTime();
          return t >= startToday.getTime() && t < startTomorrow.getTime();
        });
      case 'week':
        return rows.filter((r) => {
          const t = new Date(r.reserved_at).getTime();
          return t >= startToday.getTime() && t < startNextWeek.getTime();
        });
      case 'pending':
        return rows.filter(
          (r) =>
            r.status === 'pending' && new Date(r.reserved_at).getTime() > now
        );
      default:
        return rows;
    }
  }, [rows, filter]);

  const updateStatus = async (id: string, status: ReservationStatus) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', id);
    if (error) toast.error(error.message);
    else toast.success(`Updated to ${status}`);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <header className="mb-8">
        <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
          Reservations
        </h1>
        <p className="text-cream/60">
          <span className="text-brand-600">
            {branchName ?? 'All branches'}
          </span>{' '}
          · Customer bookings from /reserve appear here in real time.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Today" value={String(stats.todayCount)} />
        <StatCard label="Next 7 days" value={String(stats.weekCount)} />
        <StatCard label="Pending" value={String(stats.pending)} />
        <StatCard
          label="No-shows (30d)"
          value={String(stats.noShow30)}
        />
        <StatCard
          label="Avg party"
          value={stats.avgParty ? stats.avgParty.toFixed(1) : '—'}
        />
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide">
        {([
          ['today', `Today (${stats.todayCount})`],
          ['week', `Next 7 days (${stats.weekCount})`],
          ['pending', `Pending (${stats.pending})`],
          ['all', 'All'],
        ] as Array<[ResAdminFilter, string]>).map(([k, label]) => {
          const active = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] font-mono whitespace-nowrap transition ${
                active
                  ? 'bg-brand-500 text-ink'
                  : 'bg-obsidian-100 border border-brand-500/10 text-cream/70 hover:text-brand-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-cream/70 italic">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-10 text-center">
          <BookOpenCheck
            size={40}
            className="text-brand-500/40 mx-auto mb-3"
          />
          <p className="font-display italic text-2xl text-cream">
            Nothing in this view
          </p>
        </div>
      ) : (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-obsidian-50">
              <tr className="text-left font-mono text-[10px] tracking-[0.25em] uppercase text-brand-500 border-b border-brand-500/10">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Guest</th>
                {!branchId && <th className="px-4 py-3">Branch</th>}
                <th className="px-4 py-3 text-center">Party</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <AdminResRow
                  key={r.id}
                  reservation={r}
                  showBranch={!branchId}
                  onStatus={(s) => updateStatus(r.id, s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminResRow({
  reservation,
  showBranch,
  onStatus,
}: {
  reservation: Reservation;
  showBranch: boolean;
  onStatus: (s: ReservationStatus) => void;
}) {
  const when = new Date(reservation.reserved_at);
  const dateLabel = when.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = when.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return (
    <tr className="border-b border-brand-500/5 hover:bg-obsidian-50/50">
      <td className="px-4 py-3 text-cream">
        <span className="block">{dateLabel}</span>
        <span className="font-mono text-[11px] text-brand-600">
          {timeLabel}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="block text-cream">{reservation.customer_name}</span>
        <a
          href={`tel:+91${reservation.customer_phone}`}
          className="font-mono text-[11px] text-cream/70 hover:text-brand-500"
        >
          +91 {reservation.customer_phone}
        </a>
      </td>
      {showBranch && (
        <td className="px-4 py-3 text-cream/70">
          {reservation.branches?.name ?? '—'}
        </td>
      )}
      <td className="px-4 py-3 text-center text-cream font-mono">
        {reservation.party_size}
      </td>
      <td className="px-4 py-3">
        <select
          value={reservation.status}
          onChange={(e) => onStatus(e.target.value as ReservationStatus)}
          className="bg-obsidian border border-brand-500/20 rounded-lg px-3 py-1.5 text-cream text-xs focus:border-brand-500/50 focus:outline-none"
        >
          {RES_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-[10px] tracking-wider text-cream/60 uppercase">
          {reservation.confirmation_code ?? '—'}
        </span>
      </td>
    </tr>
  );
}

// ============================================================
// Blog admin — resync from vanlavino.com + publish/feature toggles
// ============================================================

interface SyncReport {
  ok: boolean;
  pagesScanned: number;
  postsSeen: number;
  postsInserted: number;
  postsUpdated: number;
  postsSkipped: number;
  imagesMirrored: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

// List view doesn't need body_html / body_md (can be 20-50 KB per row).
// Fetching them for 70+ posts was what made the admin appear stuck after a
// sync. The composer fetches body_md separately on edit.
type BlogListRow = Omit<BlogPost, 'body_html' | 'body_md'>;

const BLOG_LIST_COLS =
  'id, slug, title, excerpt, hero_image_url, hero_image_external_url, published_at, source, source_url, source_checksum, is_published, is_featured, created_at, updated_at';

function BlogAdmin() {
  const [posts, setPosts] = useState<BlogListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  // null    → composer closed
  // 'new'   → blank composer for new post
  // BlogListRow → editing existing native post
  const [composerOpen, setComposerOpen] = useState<'new' | BlogListRow | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select(BLOG_LIST_COLS)
      .order('is_featured', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setPosts((data ?? []) as BlogListRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runSync = async (force = false) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke<SyncReport>(
        'blog-sync',
        { body: { force } }
      );
      if (error) {
        const msg = await readFunctionError(error);
        toast.error(msg, { duration: 6000 });
        return;
      }
      if (data) {
        setLastReport(data);
        toast.success(
          `Done — ${data.postsInserted} new, ${data.postsUpdated} updated`
        );
      }
    } finally {
      // Release the "Syncing…" button as soon as the function returns so
      // the admin sees progress immediately. The list refresh below runs
      // in the background behind the skeleton/Loading state.
      setSyncing(false);
    }
    load();
  };

  const toggle = async (
    id: string,
    field: 'is_featured' | 'is_published',
    value: boolean
  ) => {
    const { error } = await supabase
      .from('blog_posts')
      .update({ [field]: value })
      .eq('id', id);
    if (error) return toast.error(error.message);
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const removePost = async (id: string, title: string) => {
    if (
      !window.confirm(
        `Delete "${title}"? This is permanent. Synced posts will reappear on the next resync.`
      )
    ) {
      return;
    }
    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Post deleted');
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <header className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display italic text-4xl md:text-5xl text-cream mb-2">
            Blog
          </h1>
          <p className="text-cream/60">
            Write a post directly, or resync the mirror from{' '}
            <a
              href="https://vanlavino.com/blogs/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline decoration-brand-500/40 hover:decoration-brand-500"
            >
              vanlavino.com/blogs
            </a>
            . Native posts you write here are never overwritten by sync.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposerOpen('new')}
            className="inline-flex items-center gap-2 bg-brand-500 text-ink px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.2em] font-mono hover:bg-brand-400 transition"
          >
            <Plus size={14} />
            Write a post
          </button>
          <button
            onClick={() => runSync(false)}
            disabled={syncing}
            className="inline-flex items-center gap-2 border border-brand-500/30 text-brand-500 px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono hover:bg-brand-500/10 transition disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={syncing ? 'animate-spin' : ''}
            />
            {syncing ? 'Syncing…' : 'Resync'}
          </button>
          <button
            onClick={() => runSync(true)}
            disabled={syncing}
            title="Re-download every post + image, ignoring cache"
            className="inline-flex items-center gap-2 border border-brand-500/15 text-cream/75 px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono hover:text-brand-500 hover:border-brand-500/30 transition disabled:opacity-60"
          >
            Force rebuild
          </button>
        </div>
      </header>

      {lastReport && (
        <div className="mb-8 bg-obsidian-100 border border-brand-500/15 rounded-2xl p-5">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/65 mb-3">
            Last sync · {new Date(lastReport.finishedAt).toLocaleString()}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <ReportStat label="Pages" value={lastReport.pagesScanned} />
            <ReportStat label="Seen" value={lastReport.postsSeen} />
            <ReportStat label="New" value={lastReport.postsInserted} highlight />
            <ReportStat label="Updated" value={lastReport.postsUpdated} />
            <ReportStat label="Images" value={lastReport.imagesMirrored} />
          </div>
          {lastReport.errors.length > 0 && (
            <details className="mt-4">
              <summary className="font-mono text-[10px] tracking-wider uppercase text-amber-400 cursor-pointer">
                {lastReport.errors.length} warning
                {lastReport.errors.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-3 space-y-1 text-[11px] text-cream/60 font-mono">
                {lastReport.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="break-all">
                    • {e}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-cream/70 italic">Loading…</p>
      ) : posts.length === 0 ? (
        <div className="bg-obsidian-100 border border-brand-500/10 rounded-2xl p-10 text-center">
          <BookOpen size={40} className="text-brand-500/40 mx-auto mb-3" />
          <p className="font-display italic text-2xl text-cream mb-1">
            No posts yet
          </p>
          <p className="text-cream/60 text-sm">
            Hit "Resync now" to pull the first batch from vanlavino.com.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <BlogAdminRow
              key={p.id}
              post={p}
              onFeature={(v) => toggle(p.id, 'is_featured', v)}
              onPublish={(v) => toggle(p.id, 'is_published', v)}
              onEdit={
                p.source === 'native' ? () => setComposerOpen(p) : undefined
              }
              onDelete={
                p.source === 'native'
                  ? () => removePost(p.id, p.title)
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {composerOpen && (
        <BlogComposer
          initialPost={composerOpen === 'new' ? null : composerOpen}
          onClose={() => setComposerOpen(null)}
          onSaved={() => {
            setComposerOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ReportStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-cream/65 mb-1">
        {label}
      </p>
      <p
        className={`font-display text-2xl tabular-nums ${
          highlight ? 'text-brand-500' : 'text-cream'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BlogAdminRow({
  post,
  onFeature,
  onPublish,
  onEdit,
  onDelete,
}: {
  post: BlogListRow;
  onFeature: (v: boolean) => void;
  onPublish: (v: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const dateLabel = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  return (
    <li
      className={`flex items-center gap-4 bg-obsidian-100 border rounded-2xl p-4 transition-colors ${
        post.is_published
          ? 'border-brand-500/10 hover:border-brand-500/30'
          : 'border-red-500/25 opacity-80'
      }`}
    >
      <div className="w-20 h-14 md:w-28 md:h-20 flex-shrink-0 rounded-xl overflow-hidden bg-obsidian-50 border border-brand-500/10">
        {post.hero_image_url && (
          <img
            src={post.hero_image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65">
            {dateLabel}
          </span>
          <span
            className={`font-mono text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 rounded-full border ${
              post.source === 'vanlavino_wp'
                ? 'text-cream/70 border-cream/15'
                : 'text-brand-500 border-brand-500/30'
            }`}
          >
            {post.source === 'vanlavino_wp' ? 'Synced' : 'Native'}
          </span>
          {post.is_featured && (
            <span className="font-mono text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 rounded-full bg-brand-500 text-ink">
              Featured
            </span>
          )}
        </div>
        <p className="font-display italic text-lg text-cream leading-tight truncate">
          {post.title}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <Link
            to={`/blog/${post.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-cream/70 hover:text-brand-500 transition"
          >
            /blog/{post.slug}
            <ExternalLink size={10} />
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        {onEdit && (
          <button
            onClick={onEdit}
            title="Edit post"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono border border-cream/20 text-cream/75 hover:text-brand-500 hover:border-brand-500/40 transition"
          >
            Edit
          </button>
        )}
        <button
          onClick={() => onFeature(!post.is_featured)}
          title={post.is_featured ? 'Un-feature' : 'Feature on homepage'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono transition ${
            post.is_featured
              ? 'bg-brand-500 text-ink'
              : 'border border-brand-500/30 text-brand-500 hover:bg-brand-500/10'
          }`}
        >
          <Sparkles size={12} />
          {post.is_featured ? 'Featured' : 'Feature'}
        </button>
        <button
          onClick={() => onPublish(!post.is_published)}
          title={post.is_published ? 'Hide' : 'Publish'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono transition ${
            post.is_published
              ? 'border border-cream/20 text-cream/70 hover:text-red-400 hover:border-red-400/50'
              : 'border border-red-500/40 text-red-400 hover:bg-red-500/10'
          }`}
        >
          {post.is_published ? (
            <>
              <EyeOff size={12} /> Hide
            </>
          ) : (
            <>
              <Eye size={12} /> Show
            </>
          )}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete post permanently"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 size={12} />
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

// ============================================================
// BlogComposer — full-screen modal for writing or editing a
// native blog post (source = 'native'). Markdown body, hero
// image upload to the blog-images bucket, publish + featured
// toggles. On save, derives body_html from body_md so the
// public BlogPostPage keeps rendering body_html through
// DOMPurify exactly like sync'd posts.
// ============================================================

function BlogComposer({
  initialPost,
  onClose,
  onSaved,
}: {
  initialPost: BlogListRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initialPost;

  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [slug, setSlug] = useState(initialPost?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt ?? '');
  const [bodyMd, setBodyMd] = useState('');
  const [bodyLoading, setBodyLoading] = useState(isEdit);
  const [heroUrl, setHeroUrl] = useState<string | null>(
    initialPost?.hero_image_url ?? null
  );
  const [isPublished, setIsPublished] = useState(
    initialPost?.is_published ?? true
  );
  const [isFeatured, setIsFeatured] = useState(
    initialPost?.is_featured ?? false
  );
  const [showPreview, setShowPreview] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-derive slug from title until the user edits the slug field.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(title));
  }, [title, slugTouched]);

  // Edit mode: fetch body_md (and fall back to body_html if a pre-013 row).
  useEffect(() => {
    if (!isEdit || !initialPost) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('blog_posts')
        .select('body_md, body_html')
        .eq('id', initialPost.id)
        .maybeSingle();
      if (cancelled) return;
      const fetched = (data as { body_md?: string | null; body_html?: string | null } | null) ?? null;
      // Prefer markdown source; fall back to HTML for posts written before
      // body_md existed (admin can re-write in markdown to get clean output).
      setBodyMd(fetched?.body_md ?? fetched?.body_html ?? '');
      setBodyLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, initialPost]);

  const previewHtml = useMemo(
    () => DOMPurify.sanitize(markdownToHtml(bodyMd)),
    [bodyMd]
  );

  async function handleHeroUpload(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const stem = (slug || slugify(title) || 'post').slice(0, 60);
      const path = `${stem}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('blog-images')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage
        .from('blog-images')
        .getPublicUrl(path);
      setHeroUrl(pub.publicUrl);
      toast.success('Hero image uploaded');
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error('Title is required');
    if (!slug.trim()) return toast.error('Slug is required');
    if (!bodyMd.trim()) return toast.error('Body is empty');

    setSaving(true);

    const html = DOMPurify.sanitize(markdownToHtml(bodyMd));
    const now = new Date().toISOString();

    const payload = {
      slug: slug.trim(),
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      body_md: bodyMd,
      body_html: html,
      hero_image_url: heroUrl,
      is_published: isPublished,
      is_featured: isFeatured,
      source: 'native' as const,
      // Stamp published_at the first time we publish; leave alone afterwards.
      ...(isEdit
        ? {}
        : { published_at: isPublished ? now : null }),
    };

    const { error } = isEdit
      ? await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', initialPost!.id)
      : await supabase.from('blog_posts').insert(payload);

    setSaving(false);

    if (error) {
      // Most likely cause is a duplicate slug.
      if (error.message.includes('duplicate') || error.code === '23505') {
        toast.error('That slug already exists. Try a different one.');
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success(isEdit ? 'Post updated' : 'Post published');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <form
        onSubmit={save}
        className="min-h-screen flex items-start justify-center p-4 md:p-8"
      >
        <div className="w-full max-w-5xl bg-obsidian-100 border border-brand-500/20 rounded-3xl shadow-luxury">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-6 md:px-8 py-5 border-b border-brand-500/10">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
                {isEdit ? 'Edit post' : 'New post'}
              </p>
              <p className="font-display italic text-xl text-cream mt-0.5">
                Compose
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono transition ${
                  showPreview
                    ? 'bg-brand-500/15 text-brand-600 border border-brand-500/40'
                    : 'border border-cream/20 text-cream/70 hover:text-brand-500 hover:border-brand-500/40'
                }`}
              >
                {showPreview ? 'Hide preview' : 'Show preview'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full border border-cream/20 text-cream/70 hover:border-red-500/40 hover:text-red-400 flex items-center justify-center transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 md:px-8 py-6 md:py-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* Left column — fields */}
            <div className="space-y-5">
              <div>
                <label className="font-mono text-[11px] tracking-[0.3em] uppercase text-brand-500 block mb-2">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Sourdough, slowly"
                  className="w-full bg-obsidian border border-brand-500/15 rounded-xl px-4 py-3 text-cream text-lg placeholder:text-cream/45 focus:outline-none focus:border-brand-500/50"
                />
              </div>

              <div>
                <label className="font-mono text-[11px] tracking-[0.3em] uppercase text-brand-500 block mb-2">
                  Slug
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-cream/65 select-none">
                    /blog/
                  </span>
                  <input
                    value={slug}
                    onChange={(e) => {
                      setSlug(slugify(e.target.value));
                      setSlugTouched(true);
                    }}
                    placeholder="sourdough-slowly"
                    className="flex-1 bg-obsidian border border-brand-500/15 rounded-xl px-4 py-2.5 text-cream font-mono text-sm placeholder:text-cream/45 focus:outline-none focus:border-brand-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] tracking-[0.3em] uppercase text-brand-500 block mb-2">
                  Excerpt
                </label>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={2}
                  placeholder="One-line teaser shown on the index and journal strip"
                  className="w-full bg-obsidian border border-brand-500/15 rounded-xl px-4 py-3 text-cream text-sm placeholder:text-cream/45 focus:outline-none focus:border-brand-500/50 resize-none"
                />
              </div>

              <div>
                <label className="font-mono text-[11px] tracking-[0.3em] uppercase text-brand-500 block mb-2">
                  Hero image
                </label>
                {heroUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-brand-500/20 aspect-[16/9]">
                    <img
                      src={heroUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setHeroUrl(null)}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 backdrop-blur text-white hover:bg-red-500/80 flex items-center justify-center transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full aspect-[16/9] rounded-xl border-2 border-dashed border-brand-500/25 hover:border-brand-500/50 text-cream/75 hover:text-brand-500 flex flex-col items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <Plus size={24} />
                    <span className="font-mono text-[10px] tracking-[0.25em] uppercase">
                      {uploading ? 'Uploading…' : 'Upload hero image'}
                    </span>
                    <span className="text-[10px] text-cream/60">
                      JPG / PNG · under 5 MB
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleHeroUpload(f);
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-3 text-sm text-cream/85 cursor-pointer">
                  <Toggle checked={isPublished} onChange={setIsPublished} />
                  <span>Published</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-cream/85 cursor-pointer">
                  <Toggle checked={isFeatured} onChange={setIsFeatured} />
                  <span>Featured on landing</span>
                </label>
              </div>
            </div>

            {/* Right column — body markdown + optional preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[11px] tracking-[0.3em] uppercase text-brand-500">
                  Body — markdown
                </label>
                <span className="font-mono text-[10px] text-cream/60">
                  # heading · **bold** · *italic* · [link](url) · - list
                </span>
              </div>
              {bodyLoading ? (
                <div className="h-[460px] rounded-xl border border-brand-500/15 bg-obsidian flex items-center justify-center text-cream/65 font-mono text-xs tracking-[0.25em] uppercase">
                  Loading body…
                </div>
              ) : showPreview ? (
                <article
                  className="prose-bakery h-[460px] overflow-y-auto rounded-xl border border-brand-500/15 bg-obsidian px-5 py-4 text-cream/85"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <textarea
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  rows={20}
                  spellCheck
                  placeholder={`# A morning at the bake house\n\nSome paragraphs of warmth.\n\n- A loaf\n- A bagel\n\n> Made with love.`}
                  className="w-full h-[460px] bg-obsidian border border-brand-500/15 rounded-xl px-5 py-4 text-cream font-mono text-sm leading-relaxed placeholder:text-cream/25 focus:outline-none focus:border-brand-500/50 resize-none"
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 md:px-8 py-5 border-t border-brand-500/10 flex-wrap">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/60">
              {isEdit
                ? 'Saved changes appear instantly on the journal strip.'
                : 'New posts appear on the landing strip in real time once published.'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-5 py-2.5 rounded-full text-[11px] uppercase tracking-[0.25em] font-mono border border-cream/20 text-cream/70 hover:text-brand-500 hover:border-brand-500/40 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="inline-flex items-center gap-2 bg-brand-500 text-ink px-6 py-2.5 rounded-full text-xs uppercase tracking-[0.25em] font-mono hover:bg-brand-400 hover:shadow-glow transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Publish post'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// Security tab is now a thin wrapper around the shared MfaPanel
// component (also used by /setup-mfa). All TOTP enrollment / verify /
// disable logic lives in components/MfaPanel.tsx — keeping it in one
// place means /setup-mfa and /admin → Security stay in lockstep.
function SecurityAdmin() {
  return <MfaPanel />;
}
