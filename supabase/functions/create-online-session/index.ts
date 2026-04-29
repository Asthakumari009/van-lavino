// Server-side issuer for online (non-QR) customer sessions.
// Used by the /order checkout flow: the customer has a name+phone and a
// chosen branch, but no QR token. We mint a customer_sessions row with
// kind='online' so the existing orders RLS (which requires a valid
// customer_session_id matching the order's branch) accepts the insert.
//
// Deploy:  supabase functions deploy create-online-session --no-verify-jwt
// (no-verify-jwt because customers are anonymous — they don't have a
// Supabase Auth session.)

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

interface CreateBody {
  branch_id: string;
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

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const { branch_id, customer_name, customer_phone } = body;
    if (!branch_id) return json({ ok: false, error: 'Missing branch_id' }, 400);
    if (!customer_name || !customer_phone) {
      return json({ ok: false, error: 'Customer identity required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Server missing Supabase env vars' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Confirm the branch exists and is active before issuing a session.
    const { data: branchRow, error: branchErr } = await admin
      .from('branches')
      .select('id, name, is_active')
      .eq('id', branch_id)
      .maybeSingle();

    if (branchErr) return json({ ok: false, error: branchErr.message }, 500);
    if (!branchRow) return json({ ok: false, error: 'Unknown branch' }, 404);
    if (branchRow.is_active === false) {
      return json({ ok: false, error: 'This branch is currently closed' }, 403);
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { data: session, error: sessErr } = await admin
      .from('customer_sessions')
      .insert({
        branch_id,
        kind: 'online',
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
      branchId: branch_id,
      branchName: branchRow.name ?? 'Van Lavino',
      expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ ok: false, error: message }, 500);
  }
});
