import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QrScanner from 'qr-scanner';
import { ScanLine, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { supabase } from '../lib/supabase';
import { useCart } from '../lib/useCart';
import { useCustomerAccess } from '../lib/useCustomerAccess';
import type { Branch, RestaurantTable } from '../types';

type ValidationResult = {
  branchId: string;
  tableNumber: string;
  token: string;
  branchName: string;
  customerSessionId: string;
};

export default function ScanQR() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setTableInfo = useCart((s) => s.setTableInfo);
  const isCustomerActive = useCustomerAccess((s) => s.isCustomerActive);
  const customer = useCustomerAccess((s) => s.getCustomer());
  const setTableSession = useCustomerAccess((s) => s.setTableSession);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Manual branch + table picker — fallback for damaged / missing QR
  // codes. Populated from public reads of `branches` and
  // `restaurant_tables`. We resolve qr_token from the chosen table
  // before calling verifyAndContinue.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  useEffect(() => {
    if (!isCustomerActive()) {
      navigate('/customer-auth', { replace: true });
    }
  }, [isCustomerActive, navigate]);

  // Load branches once for the manual fallback dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (!cancelled && data) setBranches(data as Branch[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load tables for the chosen branch.
  useEffect(() => {
    if (!selectedBranchId) {
      setTables([]);
      setSelectedTableId('');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .order('table_number', { ascending: true });
      if (!cancelled && data) {
        setTables(data as RestaurantTable[]);
        setSelectedTableId('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBranchId]);

  useEffect(() => {
    const branch = searchParams.get('branch') ?? '';
    const table = searchParams.get('table') ?? '';
    const token = searchParams.get('token') ?? '';
    if (branch && table && token) {
      void verifyAndContinue({ branch, table, token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        void handleScannedText(result.data);
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
      }
    );

    scannerRef.current = scanner;
    setPermissionDenied(false);

    scanner
      .start()
      .catch(() => {
        setPermissionDenied(true);
      });

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [cameraOpen]);

  async function handleScannedText(text: string) {
    const parsed = parseQr(text);
    if (!parsed) {
      toast.error('Invalid QR format');
      return;
    }
    await verifyAndContinue(parsed);
  }

  async function verifyAndContinue(input: {
    branch: string;
    table: string;
    token: string;
  }) {
    if (!customer) {
      navigate('/customer-auth', { replace: true });
      return;
    }

    setVerifying(true);
    try {
      const validated = await validateQr(input.branch, input.table, input.token, customer.name, customer.phone);
      if (!validated) {
        toast.error('Invalid or expired table QR');
        return;
      }

      setTableSession({
        branchId: validated.branchId,
        branchName: validated.branchName,
        tableNumber: validated.tableNumber,
        token: validated.token,
        customerSessionId: validated.customerSessionId,
      });
      setTableInfo(validated.tableNumber, validated.branchId);

      toast.success(`Table ${validated.tableNumber} detected`);
      navigate(
        `/menu?branch=${encodeURIComponent(validated.branchId)}&table=${encodeURIComponent(validated.tableNumber)}&token=${encodeURIComponent(validated.token)}`,
        { replace: true }
      );
    } finally {
      setVerifying(false);
    }
  }

  const onManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const table = tables.find((t) => t.id === selectedTableId);
    if (!selectedBranchId || !table) {
      toast.error('Pick a branch and table first');
      return;
    }
    if (!table.qr_token) {
      toast.error('This table has no QR token configured. Ask staff for help.');
      return;
    }
    setManualSubmitting(true);
    try {
      await verifyAndContinue({
        branch: selectedBranchId,
        table: table.table_number,
        token: table.qr_token,
      });
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-cream relative overflow-hidden px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(193,120,32,0.25),transparent_30%),radial-gradient(circle_at_95%_75%,rgba(193,120,32,0.2),transparent_35%)] pointer-events-none" />
      <div className="relative max-w-3xl mx-auto">
        <header className="text-center mb-10">
          <p className="font-mono text-xs text-brand-500 tracking-[0.35em] uppercase mb-4">
            Table Access
          </p>
          <h1 className="font-display italic text-5xl md:text-7xl leading-[0.9] text-cream">
            Scan Table QR
          </h1>
          <p className="text-cream/70 mt-5 max-w-xl mx-auto">
            Premium table ordering starts here. Scan your QR to retrieve branch and table details.
          </p>
        </header>

        <div className="bg-obsidian-100/90 border border-brand-500/25 rounded-3xl p-6 md:p-8 shadow-luxury card-shimmer">
          <button
            onClick={() => setCameraOpen((s) => !s)}
            className="w-full rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-brand-400 text-ink px-6 py-4 text-base md:text-lg font-semibold tracking-wide hover:shadow-glow transition-all flex items-center justify-center gap-3"
          >
            <ScanLine size={20} />
            {cameraOpen ? 'Close Camera Scanner' : 'Scan Table QR'}
          </button>

          {cameraOpen && (
            <div className="mt-5 rounded-2xl border border-brand-500/35 p-3 bg-black/60 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-6 border border-brand-500/40 rounded-xl" />
                <div className="scanline" />
              </div>
              <video ref={videoRef} className="w-full h-[320px] object-cover rounded-xl" muted playsInline />
              {permissionDenied && (
                <p className="text-amber-300 text-sm mt-3">
                  Camera access denied. Use the manual picker below.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <span className="flex-1 h-px bg-brand-500/15" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-cream/60">
              Or pick manually
            </span>
            <span className="flex-1 h-px bg-brand-500/15" />
          </div>

          <form onSubmit={onManualSubmit} className="mt-4 space-y-4">
            <p className="text-cream/65 text-sm leading-relaxed">
              QR torn or hard to read? Pick your branch and table from the
              list — staff will see your order on the same kanban as a
              scanned one.
            </p>

            <div>
              <label className="block font-mono text-[11px] uppercase tracking-[0.3em] text-brand-500 mb-2">
                Branch
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full bg-obsidian border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:outline-none focus:border-brand-500"
              >
                <option value="">Select a branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.city ? ` · ${b.city}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[11px] uppercase tracking-[0.3em] text-brand-500 mb-2">
                Table
              </label>
              <select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                disabled={!selectedBranchId || tables.length === 0}
                className="w-full bg-obsidian border border-brand-500/20 rounded-xl px-4 py-3 text-cream focus:outline-none focus:border-brand-500 disabled:opacity-50"
              >
                <option value="">
                  {selectedBranchId
                    ? tables.length === 0
                      ? 'No tables configured…'
                      : 'Select your table…'
                    : 'Pick a branch first'}
                </option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.table_number}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={
                manualSubmitting ||
                verifying ||
                !selectedBranchId ||
                !selectedTableId
              }
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-500/40 text-brand-500 px-5 py-3 hover:bg-brand-500 hover:text-ink transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {manualSubmitting || verifying ? <Spinner /> : null}
              {manualSubmitting || verifying
                ? 'Connecting to your table…'
                : 'Continue to menu →'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-cream/60 text-sm">
            <Sparkles size={16} className="text-brand-500" />
            Powered for seamless table ordering
          </div>
        </div>
      </div>
    </div>
  );
}

function parseQr(raw: string): { branch: string; table: string; token: string } | null {
  try {
    const parsed = new URL(raw);
    const branch = parsed.searchParams.get('branch') ?? '';
    const table = parsed.searchParams.get('table') ?? '';
    const token = parsed.searchParams.get('token') ?? '';
    if (!branch || !table || !token) return null;
    return { branch, table, token };
  } catch {
    return null;
  }
}

async function clientSideValidate(
  branchId: string,
  tableNumber: string,
  token: string,
  customerName: string,
  customerPhone: string
): Promise<ValidationResult | null> {
  const { data: tableRow, error: tableErr } = await supabase
    .from('restaurant_tables')
    .select('branch_id, table_number, qr_token, branches(name)')
    .eq('branch_id', branchId)
    .eq('table_number', tableNumber)
    .eq('qr_token', token)
    .maybeSingle();

  if (tableErr || !tableRow) return null;

  const { data: session, error: sessionErr } = await supabase
    .from('customer_sessions')
    .insert({
      branch_id: branchId,
      table_number: tableNumber,
      qr_token: token,
      customer_name: customerName,
      customer_phone: customerPhone,
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (sessionErr || !session) return null;

  return {
    branchId,
    tableNumber,
    token,
    branchName:
      (tableRow.branches as { name?: string } | null)?.name ?? 'Van Lavino',
    customerSessionId: session.id,
  };
}

async function validateQr(
  branchId: string,
  tableNumber: string,
  token: string,
  customerName: string,
  customerPhone: string
): Promise<ValidationResult | null> {
  // Server-side validation via edge function (bypasses RLS, closes the
  // client-can-forge-sessions hole).
  try {
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      error?: string;
      sessionId?: string;
      branchId?: string;
      tableNumber?: string;
      token?: string;
      branchName?: string;
    }>('validate-qr', {
      body: {
        branch: branchId,
        table: tableNumber,
        token,
        customer_name: customerName,
        customer_phone: customerPhone,
      },
    });

    if (error) {
      // supabase-js returns {error} for network/CORS/404 (function not
      // deployed) — it does NOT throw. Fall back to the direct client-side
      // lookup so the scan still works in dev / pre-deploy.
      console.warn('[validate-qr] edge function unreachable, falling back', error);
      return clientSideValidate(
        branchId,
        tableNumber,
        token,
        customerName,
        customerPhone
      );
    }

    if (!data?.ok || !data.sessionId) {
      // Function ran and deliberately rejected the QR. Respect the decision.
      console.info('[validate-qr] rejected:', data?.error);
      return null;
    }

    return {
      branchId: data.branchId ?? branchId,
      tableNumber: data.tableNumber ?? tableNumber,
      token: data.token ?? token,
      branchName: data.branchName ?? 'Van Lavino',
      customerSessionId: data.sessionId,
    };
  } catch (err) {
    // Absolute fallback for cases where supabase-js did throw (older versions,
    // preflight hard-blocked, etc).
    console.warn('[validate-qr] edge function threw, falling back', err);
    return clientSideValidate(
      branchId,
      tableNumber,
      token,
      customerName,
      customerPhone
    );
  }
}
