// Shared helpers for the Razorpay-related Vercel serverless functions.
// Underscore prefix tells Vercel "this is not itself a route" — it's
// only imported by sibling /api/*.js files.

import crypto from 'node:crypto';

// ---------------------------------------------------------------
// Env
// ---------------------------------------------------------------

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// ---------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
}

export function sendJson(res, status, body) {
  applyCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === 'string') return resolve(req.body);
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------
// Razorpay signature verification
// ---------------------------------------------------------------

export function verifyRazorpayWebhookSignature({ rawBody, receivedSignature }) {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('Missing RAZORPAY_WEBHOOK_SECRET in server environment.');
  }
  const digest = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(String(rawBody || ''))
    .digest('hex');
  // Constant-time compare to avoid HMAC timing attacks.
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(String(receivedSignature || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyRazorpayCheckoutSignature({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  if (!RAZORPAY_KEY_SECRET) {
    throw new Error('Missing RAZORPAY_KEY_SECRET in server environment.');
  }
  const digest = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(String(razorpay_signature || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------
// Supabase REST helpers (using service role to bypass RLS)
// ---------------------------------------------------------------

function assertSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase URL or service role key not configured.');
  }
}

export async function getOrderByRazorpayOrderId(razorpayOrderId) {
  assertSupabase();
  const url = `${SUPABASE_URL}/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(
    razorpayOrderId
  )}&select=id,payment_status,razorpay_payment_id&limit=1`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Supabase select failed: ${resp.status} ${await resp.text()}`);
  }
  const rows = await resp.json();
  return rows?.[0] ?? null;
}

export async function markOrderPaid({ orderId, razorpayOrderId, razorpayPaymentId }) {
  assertSupabase();
  // We patch by id when we have it; otherwise by razorpay_order_id.
  const filter = orderId
    ? `id=eq.${encodeURIComponent(orderId)}`
    : `razorpay_order_id=eq.${encodeURIComponent(razorpayOrderId)}`;
  const url = `${SUPABASE_URL}/rest/v1/orders?${filter}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      payment_status: 'paid',
      payment_method: 'razorpay',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Supabase patch failed: ${resp.status} ${await resp.text()}`);
  }
  const rows = await resp.json();
  return rows?.[0] ?? null;
}

// ---------------------------------------------------------------
// Razorpay gateway recovery
// ---------------------------------------------------------------
// If the webhook is delayed or hasn't arrived yet, we can ask Razorpay
// directly: "are there any captured payments for this order?". If yes,
// finalize the order ourselves. This is what the cafey integration calls
// `recoverVerifiedPaymentFromGateway`.

export async function recoverVerifiedPaymentFromGateway(razorpayOrderId) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString(
    'base64'
  );
  const resp = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  const payments = Array.isArray(data?.items) ? data.items : [];
  const captured = payments.find(
    (p) => p?.status === 'captured' || p?.status === 'authorized'
  );
  if (!captured) return null;

  const updated = await markOrderPaid({
    orderId: null,
    razorpayOrderId,
    razorpayPaymentId: String(captured.id),
  });
  return { orderId: updated?.id ?? null, razorpayPaymentId: String(captured.id) };
}
