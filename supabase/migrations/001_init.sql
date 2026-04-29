-- Van Lavino — initial schema
-- pgcrypto provides gen_random_uuid() (enabled by default on Supabase, added here for portability)
create extension if not exists pgcrypto;

-- =============================================================
-- TABLES
-- =============================================================

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  name text not null,
  display_order int default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  category_id uuid references categories(id),
  name text not null,
  description text,
  price numeric(10,2) not null,
  image_url text,
  is_available boolean default true,
  is_veg boolean default true,
  created_at timestamptz default now()
);

create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  table_number text not null,
  qr_token text unique not null default gen_random_uuid()::text,
  is_occupied boolean default false
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  table_id uuid references restaurant_tables(id),
  table_number text,
  status text default 'pending' check (status in ('pending','confirmed','preparing','ready','served','cancelled')),
  payment_status text default 'unpaid' check (payment_status in ('unpaid','paid','cash')),
  payment_method text,
  razorpay_order_id text,
  razorpay_payment_id text,
  subtotal numeric(10,2),
  total numeric(10,2),
  customer_note text,
  is_manual boolean default false,
  created_at timestamptz default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  item_name text not null,
  quantity int not null,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  branch_id uuid references branches(id),
  name text,
  role text default 'staff' check (role in ('staff','manager','admin'))
);

-- =============================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================

alter table branches          enable row level security;
alter table categories        enable row level security;
alter table menu_items        enable row level security;
alter table restaurant_tables enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;
alter table staff             enable row level security;

-- =============================================================
-- POLICIES
-- =============================================================

-- -------- branches --------
-- Public read
create policy "branches_select_public"
  on branches for select
  to anon, authenticated
  using (true);

-- Admin-only write
create policy "branches_insert_admin"
  on branches for insert
  to authenticated
  with check (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid() and s.role = 'admin'
    )
  );

create policy "branches_update_admin"
  on branches for update
  to authenticated
  using (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid() and s.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid() and s.role = 'admin'
    )
  );

-- -------- categories --------
-- Public read so customers can browse the menu structure
create policy "categories_select_public"
  on categories for select
  to anon, authenticated
  using (true);

-- -------- menu_items --------
create policy "menu_items_select_public"
  on menu_items for select
  to anon, authenticated
  using (true);

create policy "menu_items_insert_staff"
  on menu_items for insert
  to authenticated
  with check (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = menu_items.branch_id
    )
  );

create policy "menu_items_update_staff"
  on menu_items for update
  to authenticated
  using (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = menu_items.branch_id
    )
  )
  with check (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = menu_items.branch_id
    )
  );

create policy "menu_items_delete_staff"
  on menu_items for delete
  to authenticated
  using (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = menu_items.branch_id
    )
  );

-- -------- restaurant_tables --------
-- Public read so a QR scan can resolve a table without auth
create policy "restaurant_tables_select_public"
  on restaurant_tables for select
  to anon, authenticated
  using (true);

-- -------- orders --------
create policy "orders_select_public"
  on orders for select
  to anon, authenticated
  using (true);

create policy "orders_insert_public"
  on orders for insert
  to anon, authenticated
  with check (true);

create policy "orders_update_staff"
  on orders for update
  to authenticated
  using (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
    )
  );

-- -------- order_items --------
create policy "order_items_select_public"
  on order_items for select
  to anon, authenticated
  using (true);

create policy "order_items_insert_public"
  on order_items for insert
  to anon, authenticated
  with check (true);

-- -------- staff --------
-- A user can only see their own staff row
create policy "staff_select_self"
  on staff for select
  to authenticated
  using (user_id = auth.uid());
