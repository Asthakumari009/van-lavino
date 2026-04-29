// Server-side QR validation.
// Takes a QR-decoded payload + customer profile, validates the (branch, table,
// token) triple against restaurant_tables using the service role (bypasses
// RLS), and on success creates a customer_sessions row. Returns the session id
// and branch name so the client can open the menu.
//
// Deploy:  supabase functions deploy validate-qr --no-verify-jwt
// (no-verify-jwt because customers are anonymous — they don't have a
// Supabase Auth session yet.)

// @ts-expect-error — Deno-only remote import, resolved at function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface ValidateBody {
  branch: string;
  table: string;
  token: string;
  customer_name: string;
  customer_phone: string;
}

const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS')
      return new Response('ok', { headers: CORS });
    if (req.method !== 'POST')
      return json({ error: 'Method not allowed' }, 405);

    let body: ValidateBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { branch, table, token, customer_name, customer_phone } = body;
    if (!branch || !table || !token) {
      return json({ ok: false, error: 'Missing branch, table, or token' }, 400);
    }
    if (!customer_name || !customer_phone) {
      return json({ ok: false, error: 'Customer identity required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Server missing Supabase env vars' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up the table with all three fields matching — exact triple match
    // means the token is valid for this branch+table.
    const { data: tableRow, error: tableErr } = await admin
      .from('restaurant_tables')
      .select('id, branch_id, table_number, qr_token, branches(name, is_active)')
      .eq('branch_id', branch)
      .eq('table_number', table)
      .eq('qr_token', token)
      .maybeSingle();

    if (tableErr) return json({ ok: false, error: tableErr.message }, 500);
    if (!tableRow) {
      return json({ ok: false, error: 'Invalid or expired table QR' }, 404);
    }

    const branchRow = (tableRow.branches as { name?: string; is_active?: boolean } | null) ?? null;
    if (branchRow?.is_active === false) {
      return json({ ok: false, error: 'This branch is currently closed' }, 403);
    }

    // Create a 3-hour customer session tied to this table.
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { data: session, error: sessErr } = await admin
      .from('customer_sessions')
      .insert({
        branch_id: branch,
        table_number: table,
        qr_token: token,
        customer_name,
        customer_phone,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (sessErr || !session) {
      return json(
        { ok: false, error: sessErr?.message ?? 'Could not create session' },
        500
      );
    }

    return json({
      ok: true,
      sessionId: session.id,
      branchId: branch,
      tableNumber: table,
      token,
      branchName: branchRow?.name ?? 'Van Lavino',
      expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ ok: false, error: message }, 500);
  }
});
