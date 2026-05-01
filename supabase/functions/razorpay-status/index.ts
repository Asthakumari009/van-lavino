// Supabase Edge Function — runs on Deno.
// Deploy: supabase functions deploy razorpay-status
//
// Polled by the checkout page after the Razorpay modal opens. Returns
// verified=true once Razorpay considers the payment captured. Two paths:
//
//   1. Read our orders table by razorpay_order_id. If payment_status
//      is already 'paid' (set by a webhook or earlier verify call), done.
//   2. Otherwise, ask Razorpay's /orders/:id/payments endpoint
//      directly. If a captured payment exists, mark our order paid
//      (service-role update) and return verified.
//
// All secrets required (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are already configured on
// the Supabase project — nothing new to set up. The frontend invokes
// this function via the standard supabase-js client, which adds auth
// headers automatically.

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface StatusBody {
  razorpay_order_id?: string;
}

interface OrderRow {
  id: string;
  payment_status: string | null;
  razorpay_payment_id: string | null;
}

async function getOrderByRazorpayOrderId(
  supabaseUrl: string,
  serviceKey: string,
  razorpayOrderId: string
): Promise<OrderRow | null> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(
      razorpayOrderId
    )}&select=id,payment_status,razorpay_payment_id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as OrderRow[];
  return rows?.[0] ?? null;
}

async function markOrderPaid(
  supabaseUrl: string,
  serviceKey: string,
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<OrderRow | null> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(
      razorpayOrderId
    )}`,
    {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        payment_status: 'paid',
        payment_method: 'razorpay',
        razorpay_payment_id: razorpayPaymentId,
        razorpay_order_id: razorpayOrderId,
      }),
    }
  );
  if (!resp.ok) {
    console.error(
      '[razorpay-status] mark-paid failed',
      resp.status,
      await resp.text()
    );
    return null;
  }
  const rows = (await resp.json()) as OrderRow[];
  return rows?.[0] ?? null;
}

interface RazorpayPayment {
  id: string;
  status: string;
}

async function recoverFromGateway(
  keyId: string,
  keySecret: string,
  razorpayOrderId: string
): Promise<{ paymentId: string } | null> {
  const auth = btoa(`${keyId}:${keySecret}`);
  const resp = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(
      razorpayOrderId
    )}/payments`,
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );
  if (!resp.ok) return null;
  const data = (await resp.json()) as { items?: RazorpayPayment[] };
  const items = Array.isArray(data?.items) ? data.items : [];
  const captured = items.find(
    (p) => p?.status === 'captured' || p?.status === 'authorized'
  );
  if (!captured) return null;
  return { paymentId: String(captured.id) };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { status: 200, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    let body: StatusBody;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const razorpayOrderId = String(body?.razorpay_order_id || '').trim();
    if (!razorpayOrderId) {
      return json(
        { ok: false, error: 'razorpay_order_id is required' },
        400
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(
        { ok: false, error: 'Server misconfigured (supabase)' },
        500
      );
    }

    // Path 1 — DB already shows paid (webhook or earlier verify call did it).
    const order = await getOrderByRazorpayOrderId(
      SUPABASE_URL,
      SERVICE_ROLE,
      razorpayOrderId
    );
    if (order?.payment_status === 'paid' && order?.id) {
      return json({ ok: true, verified: true, orderId: order.id });
    }

    // Path 2 — Razorpay API recovery. Skip if creds aren't configured;
    // the frontend will keep polling and a webhook may eventually arrive.
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      try {
        const recovered = await recoverFromGateway(
          RAZORPAY_KEY_ID,
          RAZORPAY_KEY_SECRET,
          razorpayOrderId
        );
        if (recovered?.paymentId) {
          const updated = await markOrderPaid(
            SUPABASE_URL,
            SERVICE_ROLE,
            razorpayOrderId,
            recovered.paymentId
          );
          if (updated?.id) {
            return json({ ok: true, verified: true, orderId: updated.id });
          }
        }
      } catch (err) {
        console.warn('[razorpay-status] gateway recovery threw', err);
      }
    }

    return json({
      ok: true,
      verified: false,
      orderId: order?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[razorpay-status]', err);
    return json({ ok: false, error: message }, 500);
  }
});
