-- Van Lavino — full menu seed.
-- One-shot: run once against a fresh DB. Re-running will duplicate rows for
-- categories / menu_items / restaurant_tables (no unique constraints on
-- (branch_id, name) or (branch_id, table_number)). TRUNCATE first if you
-- need to reseed.

BEGIN;

-- ============================================================
-- 1. Branch
-- ============================================================

INSERT INTO branches (id, name, address, city) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Van Lavino', 'Hyderabad', 'Hyderabad')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Categories (display_order drives the Menu page ordering)
-- ============================================================

INSERT INTO categories (branch_id, name, display_order) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Start Up – Appetizers',     1),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Club Sandwiches',           2),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Hot n Grilled Sandwiches',  3),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Big Bang Burgers',          4),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Fresh Dough Pizza',         5),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Pasta',                     6),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Rice Bowls',                7),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Smart Food',                8),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Love for Salmon',           9),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'French Toast',             10),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Sweet Crepes',             11),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Signature Hot Coffees',    12),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Classic Iced Coffees',     13),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Manual Brew',              14),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Fresh Juices & Shakes',    15),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Hot Beverages',            16);

-- ============================================================
-- 3. Menu items (category resolved by name + branch_id)
-- ============================================================

WITH items (name, description, price, is_veg, category_name) AS (VALUES

  -- Start Up – Appetizers
  ('Crispy Tex-Mex Paneer Tacos',      'Baked taco shells filled with guac, sour cream, spiced paneer and fresh veggies',                     420, true,  'Start Up – Appetizers'),
  ('Crispy Tex-Mex Chicken Tacos',     'Baked taco shells filled with fresh cilantro, chicken and veggies',                                   500, false, 'Start Up – Appetizers'),
  ('Grilled Pita Tacos',               'Crispy pita taco shells rubbed with creamy chicken',                                                  440, false, 'Start Up – Appetizers'),
  ('Hummus & Pita with Falafel',       'Classic Middle Eastern dip served with warm pita triangles and falafel',                              350, true,  'Start Up – Appetizers'),
  ('Lebanese Chicken on Pita',         'Middle Eastern dish of juicy garlic chicken served with hummus and served with pita triangles',       430, false, 'Start Up – Appetizers'),
  ('Buttermilk Fried Chicken Tenders', 'Crumb-fried chicken tenders clubbed with spices',                                                     490, false, 'Start Up – Appetizers'),
  ('Mexican Chicken Chipotle Tenders', 'Chicken marinated in chipotle sauce and crumb fried',                                                 400, false, 'Start Up – Appetizers'),
  ('Fish & Chips',                     'Classic British battered fried fish with potato fries and tartar dip',                                400, false, 'Start Up – Appetizers'),
  ('Fish Bâtonnet',                    'Indian Salmon marinated with Thai spices, crumb fried, served with 4 mayo dip with coleslaw salad',   420, false, 'Start Up – Appetizers'),

  -- Club Sandwiches
  ('Paneer Club Sandwich',             'Toasted bread slice, chipotle paneer marinated, coleslaw, lettuce, cheese slice served with masala fries',                                              390, true,  'Club Sandwiches'),
  ('Chicken Club Sandwich',            'Toasted bread slice, fried egg layered, fresh coleslaw, lettuce, mustard mayo, chicken, cheese slice served with masala fries',                         390, false, 'Club Sandwiches'),
  ('Creamy Chicken Club Sandwich',     'Toasted bread slice, creamy chicken marinated, fried egg layered, coleslaw, lettuce, cheese slice served with masala fries',                            390, false, 'Club Sandwiches'),
  ('Avocado Veg Club Sandwich',        'Toasted bread slice, lettuce, coleslaw, garlic mayo, cheese slice, avocado mayo served with masala fries',                                              440, true,  'Club Sandwiches'),
  ('Avocado Chicken Club Sandwich',    'Toasted bread slice, fried eggs, lettuce, avocado mayo, fresh coleslaw, creamy chicken served with masala fries',                                       550, false, 'Club Sandwiches'),
  ('Jerk Veg Club',                    'Chipotle marinate, spice vegetable, cheese slices, coleslaw, lettuce serve with masala fries',                                                          400, true,  'Club Sandwiches'),
  ('Veg Ultimate Club Sandwich',       'Mini mushrooms, ketchup, onion, pepper, potato toppings, coleslaw, lettuce, cheese slice and jalapeño, served with masala fries',                      400, true,  'Club Sandwiches'),

  -- Hot n Grilled Sandwiches
  ('Bombay Masala Sandwich',                   'Bombay style potato, cucumber, beetroot, tomato, dill grilled sandwich',                 320, true,  'Hot n Grilled Sandwiches'),
  ('Mexican Chipotle Paneer Grilled Sandwich', 'Paneer, capsicum, cheese and chipotle mayo and grilled',                                 350, true,  'Hot n Grilled Sandwiches'),
  ('Creamy Pesto Chicken Sandwich',            'Chicken strips, pesto mayo, seasoning salad leaves',                                     350, false, 'Hot n Grilled Sandwiches'),
  ('Mexican Chipotle Chicken Grilled Sandwich','Grilled chicken, capsicum, cheese, chipotle mayo and grilled',                           350, false, 'Hot n Grilled Sandwiches'),

  -- Big Bang Burgers
  ('Indian Masala Burger',          'Indian spiced mushroom patty, cheese, tomatoes, lettuce, onion, garlic mayo served with masala fries',            400, true,  'Big Bang Burgers'),
  ('Peri Peri Mixed Veg Burger',    'Fresh mixed patty burger with Indian herbs topped with chipotle mayo',                                            480, true,  'Big Bang Burgers'),
  ('Paneer Burji Burger',           'Delicious grilled paneer, cheese slice, roasted potato served with masala fries',                                 430, true,  'Big Bang Burgers'),
  ('Peri Peri Grilled Chicken Burger', 'Chicken marinated in peri peri sauce served with cheese, lettuce and tomato',                                  450, false, 'Big Bang Burgers'),
  ('Arabian Chicken Burger',        'Grilled chicken patty, lettuce, cheese slice, tomato fries, chipotle mayo served with masala fries',              450, false, 'Big Bang Burgers'),
  ('Old Fashioned Chicken Burger',  'Crumble-fried chicken, pickled vegetables, lettuce, garlic mayo, cheese slice served with masala fries',          450, false, 'Big Bang Burgers'),
  ('Butter Lamb Burger',            'Grilled soft juicy lamb patty, jalapeños, tomato slices, cheese slice, mayo and masala fries',                   600, false, 'Big Bang Burgers'),

  -- Fresh Dough Pizza
  ('Classic Margherita',                     'San Marzano style homemade tomato sauce, mozzarella, organic oregano',                                                      540, true,  'Fresh Dough Pizza'),
  ('Avocado Pesto Pizza',                    'Avocados, wild fresh pesto sauce, mozzarella cheese and broccoli, served with sun-dried tomatoes',                          700, true,  'Fresh Dough Pizza'),
  ('All Mushrooms Truffle Oil Pizza',        'Fresh mushrooms sauce, confident black mushrooms and mozzarella cheese',                                                    580, true,  'Fresh Dough Pizza'),
  ('Garden Veg Peri Pizza',                  'Mozzarella, tomatoes, pepper, olives, peri peri sauce, Italian herbs',                                                      540, true,  'Fresh Dough Pizza'),
  ('Pickled Pineapple Paneer Indiana Pizza', 'Pineapple, paneer, jalapeños, habanero sauce and vanilla pesto flavoured, served with mozzarella cheese',                  560, true,  'Fresh Dough Pizza'),
  ('Mexican Red Beans Pizza',                'Mozzarella, chilli sauce, Mexican chilli beans and Italian herbs',                                                          500, true,  'Fresh Dough Pizza'),
  ('Pollo Mexicano Pizza',                   'San Marzano style pizza, homemade tomato sauce, chicken, organic oregano',                                                  540, false, 'Fresh Dough Pizza'),
  ('Chicken Tikka Pizza',                    'Inci classics, chicken tikka, onion, capsicum and mozzarella cheese',                                                       600, false, 'Fresh Dough Pizza'),
  ('Lebanese Chicken Pizza',                 'Mozzarella, Lebanese spiced chicken, onions, mozzarella',                                                                   600, false, 'Fresh Dough Pizza'),
  ('Grilled Chicken Pizza',                  'Rustic garlic sauce, mozzarella cheese button, onion, olive and a grilled chicken strips',                                  520, false, 'Fresh Dough Pizza'),
  ('Chicken Pepperoni Pizza',                'Chicken pepperoni slice, home made tomato sauce and mozzarella cheese',                                                     600, false, 'Fresh Dough Pizza'),

  -- Pasta
  ('Classic Alfredo',                   'Reduced cream & cheese sauce with a choice of garlic and leek and celery flavoured with a choice of pasta',        470, true,  'Pasta'),
  ('Classic Alfredo (Chicken)',         'Reduced cream & cheese sauce with a choice of garlic and leek and celery flavoured with pasta and chicken',       520, false, 'Pasta'),
  ('Pesto Pasta',                       'A speciality of the house, walnut pesto and pasta cooked to perfection',                                          470, true,  'Pasta'),
  ('Pesto Pasta (Chicken)',             'A speciality of the house, walnut pesto and pasta cooked to perfection with chicken',                             520, false, 'Pasta'),
  ('All Arrabbiata Pasta',              'Pasta cooked in arrabbiata style, a spicy Italian tomato sauce flavoured with garlic & dried red chilli and basil',470, true,  'Pasta'),
  ('Bechamel Mushroom & Cheese Pasta',  'Sauté mushrooms simmered in white sauce, cooked with pasta',                                                      470, true,  'Pasta'),
  ('Primavera Pasta',                   'A blend of white and arrabbiata sauce cooked to perfection',                                                      470, true,  'Pasta'),
  ('Aglio Olio',                        'Olive oil & garlic flavouring, delectable Italian pasta from Naples',                                             470, true,  'Pasta'),
  ('Prawns Spaghetti',                  'Pan tossed prawns served with spicy spaghetti pasta',                                                             530, false, 'Pasta'),

  -- Rice Bowls
  ('Veg Mexican Rice Bowl',             'Grilled paneer, spiced rice corns, black beans, sour cream drizzle with spice sauce',                    530, true,  'Rice Bowls'),
  ('Grilled Chicken Herb Rice Bowl',    'Grilled chicken, herb rice, mix vegetables, grilled jalapeño served with lemon butter',                  530, false, 'Rice Bowls'),
  ('Paneer Steak Herb Rice Bowl',       'Herb rice, roasted veggies, grilled paneer with creamy sauce',                                           530, true,  'Rice Bowls'),
  ('Grilled Fish Herb Rice Bowl',       'Grilled fish, herb rice, mix vegetables, caramelised onion served with lemon butter',                    500, false, 'Rice Bowls'),
  ('Millet Fried Rice with Pesto Sauce','Baked millets tossed in veggies with flavourful pesto sauce by the side',                                430, true,  'Rice Bowls'),
  ('Salted Chicken Rice Bowl',          'Salted butter rice, chicken cooked in brown sauce and bell pepper served with sunny side up',            530, false, 'Rice Bowls'),
  ('Spicy Fish Rice Bowl',              'Grilled butter rice, fish cooked in spice sauce & peppers served with sunny side up',                    530, false, 'Rice Bowls'),
  ('Malaysian Fish Curry with Steam Rice','Fish cooked in Malaysia curry served with steam rice',                                                 500, false, 'Rice Bowls'),

  -- Smart Food
  ('Arabic Bowls',          'Grilled chicken/paneer/fish/Protein Tofu, pickled veggies, salad, red bell peppers, hummus, veggie salad, sour cream served with guacamole & onion', 450, true,  'Smart Food'),
  ('Avocado Filo',          'Filo pastry, cream cheese, browned almond, vegetable and sour cream',                                                                                400, true,  'Smart Food'),
  ('Millet Kedgeree',       'Fish, rice, cucumber, summer paneer tofu',                                                                                                          400, false, 'Smart Food'),
  ('Broccoli Quinoa Bowls', 'Butter ghee, quinoa, sautéed green veggies, spinach served with cheese sauce and drizzled with Ghee',                                               400, true,  'Smart Food'),
  ('Fajita Pepper Bowls',   'Filo chicken/paneer, Mexican style bell peppers, guacamole, sour cream and jalapeño',                                                               400, false, 'Smart Food'),
  ('Mexican Salsa Bowls',   'Corn chicken/paneer Summer tofu, salad, avocado, paneer, onion chaat vinegar',                                                                      400, true,  'Smart Food'),
  ('Grilled Butter Lamb',   'Red beans, lettuce, fresh ruby salad, avocado, paneer, onion chaat vinegar',                                                                        450, false, 'Smart Food'),

  -- Love for Salmon
  ('Norwegian Salmon',         'Served with rice noodles & Hollandaise sauce',                                                                                                 990, false, 'Love for Salmon'),
  ('Grilled Atlantic Salmon',  'Grilled quinoa, butter garlic, green beans, grilled jalapeño, sautéed vegetable salmon, sautéed vegetable served with chilli basil garlic veloute sauce', 990, false, 'Love for Salmon'),

  -- French Toast
  ('Classic French Toast',       'Brioche served with caramel sauce, chantilly cream & seasonal fruits',   390, false, 'French Toast'),
  ('Lotus Biscoff French Toast', 'Brioche served with Lotus Biscoff, chantilly cream & seasonal fruits',   465, false, 'French Toast'),
  ('Blueberry French Toast',     'Brioche served with fresh blueberry, chantilly cream & seasonal fruits', 420, false, 'French Toast'),
  ('Nutella French Toast',       'Brioche served with Nutella, chantilly cream & seasonal fruits',         430, false, 'French Toast'),

  -- Sweet Crepes
  ('The Sweet Spot – Nutella Crepe',            'Crepe with Nutella drizzle, whipped cream and pomegranate',          400, true, 'Sweet Crepes'),
  ('You, Me and Blueberry Crepe',               'Crepe with fresh blueberries and whipped cream',                     350, true, 'Sweet Crepes'),
  ('Jingle Bells – Banana and Caramel Crepe',   'Crepe with banana slices, caramel drizzle and whipped cream',        350, true, 'Sweet Crepes'),
  ('Biscoff Crepe',                             'Crepe with Lotus Biscoff, strawberries and whipped cream',           400, true, 'Sweet Crepes'),

  -- Signature Hot Coffees
  ('Cappuccino',             'Classic espresso with frothy milk and creamy foam',                    200, false, 'Signature Hot Coffees'),
  ('Flat White',             'Strong espresso mellowed with steamed milk',                           230, false, 'Signature Hot Coffees'),
  ('Americano',              'Espresso with hot water',                                              200, false, 'Signature Hot Coffees'),
  ('Mocha Melt',             'Espresso meets rich chocolate and milk for a velvety mocha',           250, false, 'Signature Hot Coffees'),
  ('Balance Brew (Cortado)', 'Equal espresso and milk for bold simplicity',                          300, false, 'Signature Hot Coffees'),
  ('Espresso',               'Pure espresso shot',                                                   110, false, 'Signature Hot Coffees'),

  -- Classic Iced Coffees
  ('Iced Americano',               'Espresso over chilled water for a clean, iced finish', 260, false, 'Classic Iced Coffees'),
  ('Vanilla Bean Cream Espresso',  'Pulled espresso topped with whipped cream',            350, false, 'Classic Iced Coffees'),
  ('Velvet Biscoff Brew',          'Chilled iced coffee with Biscoff and whipped topping', 350, false, 'Classic Iced Coffees'),
  ('Vietnamese Iced Latte',        'Condensed milk espresso topped with milk',             300, false, 'Classic Iced Coffees'),

  -- Manual Brew
  ('Pour Over',    'Clean and delicate, slow drip method reveals the true character of the bean', 300, false, 'Manual Brew'),
  ('AeroPress',    'Smooth, intense and balanced, pressure-brewed for a modern twist',            300, false, 'Manual Brew'),
  ('French Press', 'Full-bodied and bold, steeped to extract deep richness and oil',              700, false, 'Manual Brew'),

  -- Fresh Juices & Shakes
  ('Apple Beetroot Juice',    'Fresh cold pressed apple and beetroot', 175, true, 'Fresh Juices & Shakes'),
  ('Carrot Orange Juice',     'Fresh cold pressed carrot and orange',  175, true, 'Fresh Juices & Shakes'),
  ('Watermelon Juice',        'Fresh cold pressed watermelon',         175, true, 'Fresh Juices & Shakes'),
  ('Pomegranate Juice',       'Fresh cold pressed pomegranate',        175, true, 'Fresh Juices & Shakes'),
  ('Vanilla Shake',           'Classic vanilla milkshake',             180, true, 'Fresh Juices & Shakes'),
  ('Chocolate Shake',         'Rich chocolate milkshake',              180, true, 'Fresh Juices & Shakes'),
  ('Banana Shake',            'Fresh banana milkshake',                180, true, 'Fresh Juices & Shakes'),
  ('Strawberry Shake',        'Fresh strawberry milkshake',            180, true, 'Fresh Juices & Shakes'),
  ('Classic Oreo Shake',      'Oreo cookie blended shake',             180, true, 'Fresh Juices & Shakes'),
  ('Cookie Bits Shake',       'Cookie crumble milkshake',              180, true, 'Fresh Juices & Shakes'),
  ('Kit Kat Shake',           'Kit Kat blended shake',                 180, true, 'Fresh Juices & Shakes'),
  ('Snicker Bar Shake',       'Snickers blended shake',                210, true, 'Fresh Juices & Shakes'),
  ('Ferrero Rocher Shake',    'Ferrero Rocher blended shake',          210, true, 'Fresh Juices & Shakes'),

  -- Hot Beverages
  ('Ghar ki Chai',   'Classic Indian spiced tea',                                 120, true, 'Hot Beverages'),
  ('Desi-Tea',       'Darjeeling Divine / Assam Tea',                             125, true, 'Hot Beverages'),
  ('Green Tea',      'Plain, Ginger Honey, Lemon, Jasmine or Moroccan Mint',      125, true, 'Hot Beverages'),
  ('Tranquil Teas',  'Herbal and wellness tea blends',                            120, true, 'Hot Beverages')
)
INSERT INTO menu_items (branch_id, category_id, name, description, price, is_veg)
SELECT
  'a1b2c3d4-0000-0000-0000-000000000001',
  c.id,
  i.name,
  i.description,
  i.price::numeric,
  i.is_veg
FROM items i
JOIN categories c
  ON c.branch_id = 'a1b2c3d4-0000-0000-0000-000000000001'
 AND c.name = i.category_name;

-- ============================================================
-- 4. Tables T1–T10 (qr_token auto-generated via column default)
-- ============================================================

INSERT INTO restaurant_tables (branch_id, table_number)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'T' || i::text
FROM generate_series(1, 10) AS t(i);

COMMIT;

-- Sanity checks (uncomment to verify):
-- SELECT count(*) FROM categories  WHERE branch_id = 'a1b2c3d4-0000-0000-0000-000000000001'; -- expect 16
-- SELECT count(*) FROM menu_items  WHERE branch_id = 'a1b2c3d4-0000-0000-0000-000000000001'; -- expect 102
-- SELECT count(*) FROM restaurant_tables WHERE branch_id = 'a1b2c3d4-0000-0000-0000-000000000001'; -- expect 10
