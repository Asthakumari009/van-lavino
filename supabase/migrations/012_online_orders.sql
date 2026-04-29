-- Online ordering / delivery channel for the bakery (breads + pastries).
-- Adds:
--   1. customer_sessions.kind — distinguishes dine-in (QR-bound) sessions from
--      online sessions that have no table/qr_token. table_number/qr_token are
--      relaxed to nullable so an online session can exist without them.
--   2. menu_items.is_deliverable — admin-controlled flag for which items can be
--      ordered through the online/delivery channel. Backfilled true for the
--      bread/pastry SKUs that were already in the landing Showcase token list.
--   3. orders.fulfillment_type + delivery address fields — every existing
--      order is dine-in, so we backfill that and then make it NOT NULL.

-- 1. customer_sessions: support both dine-in (QR) and online (no QR) sessions.
alter table customer_sessions
  alter column table_number drop not null,
  alter column qr_token drop not null,
  add column if not exists kind text not null default 'dine_in'
    check (kind in ('dine_in', 'online'));

-- 2. menu_items: deliverable flag, backfilled by name token match.
alter table menu_items
  add column if not exists is_deliverable boolean not null default false;

update menu_items
set is_deliverable = true
where is_deliverable = false
  and (
       name ilike '%bread%'
    or name ilike '%bagel%'
    or name ilike '%focaccia%'
    or name ilike '%bun%'
    or name ilike '%multigrain%'
    or name ilike '%pav%'
    or name ilike '%loaf%'
    or name ilike '%baguette%'
    or name ilike '%sourdough%'
  );

-- 3. orders: fulfillment type + delivery address fields.
alter table orders
  add column if not exists fulfillment_type text
    check (fulfillment_type in ('dine_in', 'pickup', 'delivery')),
  add column if not exists delivery_address text,
  add column if not exists delivery_landmark text,
  add column if not exists delivery_pincode text;

-- Backfill existing rows (all historical orders are dine-in).
update orders set fulfillment_type = 'dine_in' where fulfillment_type is null;

-- Lock it down now that no rows are null.
alter table orders alter column fulfillment_type set not null;
alter table orders alter column fulfillment_type set default 'dine_in';

-- Sanity invariant: a delivery order MUST have an address. Pickup/dine-in must
-- not. Enforced at DB level so a buggy client can't create address-less
-- delivery orders that staff can't fulfill.
alter table orders
  add constraint orders_delivery_requires_address check (
    (fulfillment_type = 'delivery' and delivery_address is not null and length(trim(delivery_address)) > 0)
    or (fulfillment_type <> 'delivery' and delivery_address is null)
  );
