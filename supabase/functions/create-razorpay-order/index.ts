// Supabase Edge Function — runs on Deno.
// Deploy: supabase functions deploy create-razorpay-order
// Required secrets:
//   supabase secrets set RAZORPAY_KEY_ID=rzp_xxx
//   supabase secrets set RAZORPAY_KEY_SECRET=xxxx

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

interface CreateOrderBody {
  amount: number; // in paise
  currency?: string;
  receipt?: string;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { status: 200, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body: CreateOrderBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { amount, currency = 'INR', receipt } = body;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return json({ error: '`amount` must be a positive number in paise' }, 400);
    }

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      return json(
        { error: 'Razorpay credentials not configured on server' },
        500
      );
    }

    const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${keyId}:${keySecret}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount),
        currency,
        receipt: receipt ?? `rcpt_${Date.now()}`,
      }),
    });

    const data = await rzpResponse.json();

    if (!rzpResponse.ok) {
      return json(
        {
          error:
            data?.error?.description ?? 'Razorpay order creation failed',
          code: data?.error?.code,
        },
        rzpResponse.status
      );
    }

    return json({
      id: data.id,
      amount: data.amount,
      currency: data.currency,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return json({ error: message }, 500);
  }
});
