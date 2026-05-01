// Vercel serverless function — Node runtime.
//
// Polled by the frontend after the Razorpay modal opens, with the
// Razorpay order id we got back from create-razorpay-order. Returns
// `verified: true` once the matching internal order in Supabase has
// payment_status = 'paid'.
//
// Two paths to verified:
//   1. Razorpay's webhook fired (the authoritative path) → orders row
//      already shows payment_status='paid'. We just read it.
//   2. Webhook is delayed or never fired (rare). We ask Razorpay's API
//      directly for captured payments on this razorpay_order_id; if any
//      exists, finalize the order ourselves and report verified.

import {
  applyCors,
  getOrderByRazorpayOrderId,
  readJsonBody,
  recoverVerifiedPaymentFromGateway,
  sendJson,
} from './_razorpay-lib.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res);
    res.statusCode = 200;
    res.end('ok');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    let razorpayOrderId = String(req.query?.razorpay_order_id || '').trim();
    if (!razorpayOrderId && req.method === 'POST') {
      const body = await readJsonBody(req);
      razorpayOrderId = String(body?.razorpay_order_id || '').trim();
    }

    if (!razorpayOrderId) {
      sendJson(res, 400, {
        ok: false,
        error: 'razorpay_order_id is required',
      });
      return;
    }

    const order = await getOrderByRazorpayOrderId(razorpayOrderId);

    // Webhook already fired — orders row is paid. Done.
    if (order?.payment_status === 'paid' && order?.id) {
      sendJson(res, 200, {
        ok: true,
        verified: true,
        orderId: order.id,
      });
      return;
    }

    // Webhook hasn't fired yet — check Razorpay directly. This is the
    // safety net for late or missing webhooks; usually returns null and
    // the frontend keeps polling.
    let verifiedFromGateway = null;
    try {
      verifiedFromGateway = await recoverVerifiedPaymentFromGateway(
        razorpayOrderId
      );
    } catch (err) {
      // Don't fail the poll — just report unverified.
      console.warn('[razorpay-status] gateway recovery failed', err);
    }

    if (verifiedFromGateway?.orderId) {
      sendJson(res, 200, {
        ok: true,
        verified: true,
        orderId: verifiedFromGateway.orderId,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      verified: false,
      orderId: order?.id ?? null,
    });
  } catch (err) {
    console.error('[razorpay-status] handler failed', err);
    sendJson(res, 500, {
      ok: false,
      error: err?.message || 'Unable to fetch payment status',
    });
  }
}
