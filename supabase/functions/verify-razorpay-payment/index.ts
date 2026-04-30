// Supabase Edge Function — runs on Deno.
// Deploy: supabase functions deploy verify-razorpay-payment
// Required secrets:
//   supabase secrets set RAZORPAY_KEY_SECRET=xxxx
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected.)
//
// Verifies a Razorpay payment response by HMAC-checking the signature with
// our server-side secret, then marks the matching internal order paid.
// Used by both the desktop modal handler and the mobile callback_url path —
// the latter is the only thing that works reliably when the user gets
// punted into a UPI app mid-checkout.

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

interface VerifyBody {
  orderId: string; // our internal orders.id
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { status: 200, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    let body: VerifyBody;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ ok: false, error: 'Missing required fields' }, 400);
    }

    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      return json({ ok: false, error: 'Server misconfigured (key secret)' }, 500);
    }

    const expected = await hmacSha256Hex(
      keySecret,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );

    if (!timingSafeEqualHex(expected, razorpay_signature.toLowerCase())) {
      return json({ ok: false, error: 'Invalid signature' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, error: 'Server misconfigured (supabase)' }, 500);
    }

    // Update the order: mark paid + record the payment id. Using service role
    // here because RLS doesn't allow customers to update payment_status.
    const updateResp = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'apikey': SERVICE_ROLE,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          payment_status: 'paid',
          payment_method: 'razorpay',
          razorpay_payment_id,
          razorpay_order_id,
        }),
      }
    );

    if (!updateResp.ok) {
      const errText = await updateResp.text();
      console.error('[verify] update failed', updateResp.status, errText);
      return json(
        { ok: false, error: 'Could not update order' },
        500
      );
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    console.error('[verify] error', err);
    return json({ ok: false, error: message }, 500);
  }
});
