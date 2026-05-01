// Vercel serverless function — Node runtime.
// Razorpay → POST → here.
// Configure in Razorpay dashboard:
//   Settings → Webhooks → Add Webhook
//   URL:  https://<your-vercel-domain>/api/razorpay-webhook
//   Active events: payment.captured (and optionally order.paid)
//   Secret: matches RAZORPAY_WEBHOOK_SECRET in Vercel env
//
// This is the authoritative path that marks an order paid. It runs on
// Razorpay's schedule, not the customer's browser, so it works even when
// the user's mobile page got killed mid-UPI.
//
// IMPORTANT: this route must NOT have body parsing applied because we
// need the exact raw bytes for HMAC. Vercel's default does parse, so we
// disable bodyParser via the export below.

import {
  applyCors,
  markOrderPaid,
  readRawBody,
  sendJson,
  verifyRazorpayWebhookSignature,
} from './_razorpay-lib.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res);
    res.statusCode = 200;
    res.end('ok');
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-razorpay-signature'];

    let valid = false;
    try {
      valid = verifyRazorpayWebhookSignature({
        rawBody,
        receivedSignature: signature,
      });
    } catch (err) {
      // Missing secret or other config error.
      console.error('[razorpay-webhook] signature verify error', err);
      sendJson(res, 500, { ok: false, error: 'Webhook misconfigured' });
      return;
    }
    if (!valid) {
      sendJson(res, 400, { ok: false, error: 'Invalid webhook signature' });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON payload' });
      return;
    }

    const event = String(payload?.event || '');
    if (event !== 'payment.captured' && event !== 'order.paid') {
      // Razorpay sends many event types — quietly acknowledge and move on.
      sendJson(res, 200, { ok: true, ignored: true, event });
      return;
    }

    const payment = payload?.payload?.payment?.entity || {};
    const razorpayOrderId = String(payment?.order_id || '').trim();
    const razorpayPaymentId = String(payment?.id || '').trim();

    if (!razorpayOrderId || !razorpayPaymentId) {
      sendJson(res, 200, { ok: true, ignored: true, reason: 'missing ids' });
      return;
    }

    const updated = await markOrderPaid({
      orderId: null,
      razorpayOrderId,
      razorpayPaymentId,
    });

    sendJson(res, 200, {
      ok: true,
      orderId: updated?.id ?? null,
    });
  } catch (err) {
    console.error('[razorpay-webhook] handler failed', err);
    sendJson(res, 500, {
      ok: false,
      error: err?.message || 'Webhook handling failed',
    });
  }
}
