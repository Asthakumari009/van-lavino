// Vercel serverless function — Node runtime.
//
// Razorpay's redirect-mode (`callback_url` + `redirect: true`) POSTs the
// payment response to the URL we give it. A static SPA route on Vercel
// only serves GET, so the browser sees HTTP 405 and the customer is
// stranded on a "page not working" screen even though the payment went
// through.
//
// This endpoint accepts the POST, reads the form body + the `orderId` we
// stashed in the query string, and 303-redirects the browser to the
// in-app /order-success page with everything as GET query params. The
// SPA picks it up from there and runs the verify-razorpay-payment edge
// function to flip the order to paid.
//
// We deliberately do NOT verify the signature here — that's done
// server-side on the Supabase edge function with the shared secret.
// This handler is just a transport adapter (POST→GET 303).

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      // Vercel auto-parsed JSON or url-encoded body.
      resolve(req.body);
      return;
    }
    if (typeof req.body === 'string') {
      // Sometimes Vercel hands us the raw string. Parse as URL-encoded.
      try {
        resolve(Object.fromEntries(new URLSearchParams(req.body)));
      } catch (e) {
        reject(e);
      }
      return;
    }
    // Fallback — read the stream manually.
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(Object.fromEntries(new URLSearchParams(data)));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

export default async function handler(req, res) {
  try {
    // GET: nothing to do — punt the user back to the bakery. Happens if
    // someone hits the URL directly.
    if (req.method === 'GET') {
      res.statusCode = 302;
      res.setHeader('Location', '/order');
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, POST');
      res.end('Method Not Allowed');
      return;
    }

    const body = await readBody(req);

    // Razorpay sends these in the POST body. The orderId we stashed in
    // the query string when constructing the callback URL.
    const razorpay_payment_id = safeStr(body.razorpay_payment_id);
    const razorpay_order_id = safeStr(body.razorpay_order_id);
    const razorpay_signature = safeStr(body.razorpay_signature);
    const orderId = safeStr(req.query?.orderId);

    const params = new URLSearchParams();
    if (orderId) params.set('orderId', orderId);
    if (razorpay_payment_id) params.set('razorpay_payment_id', razorpay_payment_id);
    if (razorpay_order_id) params.set('razorpay_order_id', razorpay_order_id);
    if (razorpay_signature) params.set('razorpay_signature', razorpay_signature);

    // 303 See Other forces the browser to do a GET on the next request,
    // even though it's coming from a POST. That's exactly what we need
    // to land the customer on the SPA's /order-success page.
    res.statusCode = 303;
    res.setHeader('Location', `/order-success?${params.toString()}`);
    res.end();
  } catch (err) {
    console.error('[razorpay-callback] handler failed', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Callback handler error');
  }
}
