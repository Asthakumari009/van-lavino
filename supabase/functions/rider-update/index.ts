// Rider-side endpoint for live delivery tracking — multi-order aware.
//
// A "trip" is just a `rider_token` shared by one or more orders. The
// rider opens /rider/<token> on their phone, grants geolocation, and
// the page streams `action: 'location'` updates here every ~10 s
// which fan out to ALL orders carrying that token. "Mark delivered"
// (`action: 'delivered'`) takes the specific order_id and finishes
// just that stop.
//
// Deploy: supabase functions deploy rider-update --no-verify-jwt
// (no-verify-jwt because riders are anonymous.)

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

interface RiderUpdateBody {
  token: string;
  action: 'location' | 'delivered' | 'whoami';
  /** Required for `delivered` — identifies which stop in the trip. */
  order_id?: string;
  lat?: number;
  lng?: number;
}

function isValidLat(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLng(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS')
      return new Response('ok', { headers: CORS });
    if (req.method !== 'POST')
      return json({ error: 'Method not allowed' }, 405);

    let body: RiderUpdateBody;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    if (!body.token || typeof body.token !== 'string') {
      return json({ ok: false, error: 'Missing rider token' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Server misconfigured' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve every order on this trip. Returning an array means a
    // rider can carry multiple deliveries with one shared link.
    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select(
        'id, status, fulfillment_type, customer_name, customer_phone, delivery_address, delivery_landmark, delivery_pincode, delivery_lat, delivery_lng, branch_id, total, rider_token, created_at'
      )
      .eq('rider_token', body.token)
      .order('created_at', { ascending: true });

    if (ordersErr) return json({ ok: false, error: ordersErr.message }, 500);
    if (!orders || orders.length === 0) {
      return json({ ok: false, error: 'Unknown rider token' }, 404);
    }
    if (orders.some((o) => o.fulfillment_type !== 'delivery')) {
      return json({ ok: false, error: 'Trip contains a non-delivery order' }, 400);
    }

    // whoami: rider page hydrates with ALL stops on the trip.
    if (body.action === 'whoami') {
      // Branches are presumed identical across a trip (same kitchen).
      // Look up the first one's branch info for the page header.
      const branchId = orders[0]?.branch_id;
      const { data: branch } = await admin
        .from('branches')
        .select('name, city, address, lat, lng')
        .eq('id', branchId)
        .maybeSingle();
      return json({
        ok: true,
        orders: orders.map((o) => ({
          id: o.id,
          status: o.status,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          delivery_address: o.delivery_address,
          delivery_landmark: o.delivery_landmark,
          delivery_pincode: o.delivery_pincode,
          delivery_lat: o.delivery_lat,
          delivery_lng: o.delivery_lng,
          total: o.total,
        })),
        branch: branch ?? null,
      });
    }

    if (body.action === 'location') {
      if (!isValidLat(body.lat) || !isValidLng(body.lng)) {
        return json({ ok: false, error: 'Invalid coordinates' }, 400);
      }
      // Only update the still-active stops. A stop already marked
      // `served` or `cancelled` shouldn't have its rider position
      // ticking forward.
      const liveIds = orders
        .filter((o) => o.status !== 'served' && o.status !== 'cancelled')
        .map((o) => o.id);
      if (liveIds.length === 0) {
        return json({ ok: false, error: 'All stops on this trip are closed' }, 410);
      }

      // First location update auto-promotes any stop still at
      // ready/preparing into out_for_delivery so the customer's
      // /track flips to the live map even if staff dispatched but
      // forgot to advance status.
      const promoteIds = orders
        .filter(
          (o) =>
            (o.status === 'ready' || o.status === 'preparing') &&
            liveIds.includes(o.id)
        )
        .map((o) => o.id);

      const { error: updErr } = await admin
        .from('orders')
        .update({
          rider_lat: body.lat,
          rider_lng: body.lng,
          rider_updated_at: new Date().toISOString(),
        })
        .in('id', liveIds);
      if (updErr) return json({ ok: false, error: updErr.message }, 500);

      if (promoteIds.length > 0) {
        await admin
          .from('orders')
          .update({ status: 'out_for_delivery' })
          .in('id', promoteIds);
      }

      return json({ ok: true, updated: liveIds.length, promoted: promoteIds.length });
    }

    if (body.action === 'delivered') {
      if (!body.order_id || typeof body.order_id !== 'string') {
        return json({ ok: false, error: 'Missing order_id' }, 400);
      }
      const target = orders.find((o) => o.id === body.order_id);
      if (!target) {
        return json(
          { ok: false, error: 'order_id is not on this trip' },
          403
        );
      }
      if (target.status !== 'out_for_delivery' && target.status !== 'ready') {
        return json(
          { ok: false, error: 'Stop is not in a deliverable state' },
          409
        );
      }
      const { error: updErr } = await admin
        .from('orders')
        .update({
          status: 'served',
          rider_updated_at: new Date().toISOString(),
        })
        .eq('id', target.id);
      if (updErr) return json({ ok: false, error: updErr.message }, 500);
      return json({ ok: true, status: 'served', order_id: target.id });
    }

    return json({ ok: false, error: 'Unknown action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ ok: false, error: message }, 500);
  }
});
