-- Branch coordinates for the live delivery map. Without these the
-- /track page has nothing to anchor the map on before the rider
-- starts sharing GPS — we want the customer to see a meaningful map
-- the moment status flips to out_for_delivery (origin pin = bakery,
-- rider pin shows up when they grant location).
--
-- Coordinates are approximate, taken from public listings — refine
-- in /admin → Branches once we surface those fields. (Schema already
-- present; this migration just adds the columns + seeds known rows.)

alter table branches
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);

-- Backfill the 3 stable branch UUIDs from scripts/seed_branches_breads.sql.
-- Each WHERE is keyed by id so renaming branches in admin doesn't break
-- this; the lat/lng survives the rename.

update branches
set lat = 17.4239, lng = 78.4099
where id = 'a1b2c3d4-0000-0000-0000-000000000001'
  and lat is null;

update branches
set lat = 17.4172, lng = 78.3470
where id = 'a1b2c3d4-0000-0000-0000-000000000002'
  and lat is null;

update branches
set lat = 17.4774, lng = 78.3210
where id = 'a1b2c3d4-0000-0000-0000-000000000003'
  and lat is null;
