-- One-shot seed: real branches + the bakery (deliverable) catalog.
--
-- Run after migrations/012_online_orders.sql is applied. Safe to re-run:
-- branches keyed by stable UUIDs with ON CONFLICT, categories de-duped by
-- (branch_id, name), items de-duped by (branch_id, name).
--
-- Effects:
--   * Renames the historical placeholder branch
--     a1b2c3d4-0000-0000-0000-000000000001 → "Jubilee Hills"
--     (preserves all existing orders / menu_items / reviews tied to it).
--   * Inserts two new branches: Financial District, Nalagandla.
--   * Inserts a "Breads & Pastries" category per branch.
--   * Inserts the bakery SKUs into each branch with is_deliverable = true so
--     /order has stock at every branch.

BEGIN;

-- ============================================================
-- 1. Branches
-- ============================================================

-- Rename the existing placeholder to Jubilee Hills (keeps its menu+order
-- history intact). If somebody already renamed it, this is a no-op since the
-- WHERE picks up the stable UUID.
UPDATE branches
SET name    = 'Jubilee Hills',
    address = 'Road No. 36 area, Jubilee Hills',
    city    = 'Hyderabad'
WHERE id = 'a1b2c3d4-0000-0000-0000-000000000001';

INSERT INTO branches (id, name, address, city, is_active) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000002', 'Financial District', 'Nanakramguda', 'Hyderabad', true),
  ('a1b2c3d4-0000-0000-0000-000000000003', 'Nalagandla',         'Lingampally area', 'Hyderabad', true)
ON CONFLICT (id) DO UPDATE
  SET name    = excluded.name,
      address = excluded.address,
      city    = excluded.city,
      is_active = true;

-- ============================================================
-- 2. "Breads & Pastries" category per branch (idempotent)
-- ============================================================

INSERT INTO categories (branch_id, name, display_order)
SELECT b.id, 'Breads & Pastries', 0
FROM branches b
WHERE b.id IN (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000003'
)
AND NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.branch_id = b.id AND c.name = 'Breads & Pastries'
);

-- ============================================================
-- 3. Bakery SKUs (deliverable) — same SKU+price across all 3 branches
-- ============================================================
-- Prices are placeholders — adjust in /admin → Menu Management once seeded.

WITH bread_skus (sku_name, sku_desc, sku_price, sku_veg) AS (VALUES
  ('Pav Bun',         'Soft fluffy Bombay-style bun, baked daily — pack of 6',                 40, true),
  ('Burger Bun',      'Brioche-style burger buns with a tender crumb — pack of 4',             50, true),
  ('Brown Bread',     'Whole-wheat sandwich loaf, lightly sweetened, no preservatives',        95, true),
  ('Dark Multigrain', 'Five-grain loaf with flax, oats and sunflower seeds',                  120, true),
  ('Bagels',          'Hand-shaped, kettle-boiled bagels — pack of 4 (plain)',                120, true),
  ('Baguette',        'Crisp-crust French baguette, baked twice daily',                       150, true),
  ('Focaccia Bread',  'Olive-oil focaccia with sea salt and rosemary',                        180, true),
  ('Sourdough Loaf',  '36-hour fermented country sourdough, stone-baked',                     220, true)
)
INSERT INTO menu_items (
  branch_id, category_id, name, description, price, is_veg, is_available, is_deliverable
)
SELECT
  b.id,
  c.id,
  s.sku_name,
  s.sku_desc,
  s.sku_price,
  s.sku_veg,
  true,             -- is_available
  true              -- is_deliverable
FROM branches b
JOIN categories c
  ON c.branch_id = b.id
 AND c.name = 'Breads & Pastries'
CROSS JOIN bread_skus s
WHERE b.id IN (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000003'
)
AND NOT EXISTS (
  SELECT 1 FROM menu_items mi
  WHERE mi.branch_id = b.id AND mi.name = s.sku_name
);

-- If the existing Jubilee Hills branch happens to already have an item that
-- matches a bread SKU but isn't flagged deliverable (e.g. an admin added
-- "Focaccia Bread" manually pre-migration), promote it now:
UPDATE menu_items
SET is_deliverable = true
WHERE is_deliverable = false
  AND name IN (
    'Pav Bun','Burger Bun','Brown Bread','Dark Multigrain',
    'Bagels','Baguette','Focaccia Bread','Sourdough Loaf'
  );

COMMIT;
