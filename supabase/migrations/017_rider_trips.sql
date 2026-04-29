-- Multi-order rider trips. Lets a single rider carry several orders
-- at once (common when 2-3 deliveries are clustered in the same area).
-- All orders that share a `rider_token` form a "trip"; the rider opens
-- one /rider/<token> link, shares location once, and sees a per-stop
-- list with individual "Mark delivered" actions.
--
-- Migration 014 made `rider_token` unique. We drop the unique
-- constraint so multiple orders can share a token, and replace it with
-- a non-unique index for the same hot-path lookup.

drop index if exists orders_rider_token_idx;

create index if not exists orders_rider_token_idx
  on orders (rider_token)
  where rider_token is not null;
