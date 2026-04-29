-- Live delivery rider tracking — Blinkit/Zomato-style "rider on the way"
-- map for delivery orders. Adds:
--
--   1. orders.fulfillment_type — already there from 012, now we extend the
--      status enum with `out_for_delivery` (between ready and served).
--   2. orders.rider_token — random per-order token. The rider opens
--      /rider/<token> on their phone; the token gates the edge function
--      that updates the rider's location. No rider login required.
--   3. orders.rider_lat / rider_lng / rider_updated_at — last known
--      position. Customer's /track page subscribes via realtime so the
--      pin moves live.
--   4. orders.delivery_lat / delivery_lng — destination pin (set during
--      checkout in a follow-up; nullable for now).
--
-- The orders table is already on the supabase_realtime publication
-- (migration 002), so location updates stream automatically.

-- 1. Status enum: add 'out_for_delivery' between 'ready' and 'served'.
--    Existing 'served' rows are unaffected. Going status='ready' →
--    'out_for_delivery' → 'served' is the new path for delivery orders.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in (
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery',
    'served',
    'cancelled'
  ));

-- 2-4. Rider columns + destination pin.
alter table orders
  add column if not exists rider_token text,
  add column if not exists rider_lat numeric(9,6),
  add column if not exists rider_lng numeric(9,6),
  add column if not exists rider_updated_at timestamptz,
  add column if not exists delivery_lat numeric(9,6),
  add column if not exists delivery_lng numeric(9,6);

-- Tokens are unique. Lookup by token is the rider page's hot path.
create unique index if not exists orders_rider_token_idx
  on orders (rider_token)
  where rider_token is not null;

-- The rider page is anonymous — it has no Supabase Auth session and
-- can't pass RLS for direct UPDATEs. Location updates and "Mark
-- Delivered" both go through the `rider-update` edge function which
-- uses the service role and validates the token server-side.
-- We do NOT add an anon UPDATE policy for orders.

-- Safety net: prevent direct INSERT/UPDATE on rider columns from
-- non-admin / non-staff roles by relying on the existing orders RLS.
-- The edge function bypasses RLS via service role, which is intended.
