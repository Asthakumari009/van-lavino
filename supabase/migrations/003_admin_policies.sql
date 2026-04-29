-- Admin access for the admin dashboard.
-- is_admin() is SECURITY DEFINER so the staff lookup inside it bypasses the
-- staff_select_self policy — otherwise the function would return false for
-- admins reading other staff rows.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from staff s
    where s.user_id = auth.uid() and s.role = 'admin'
  );
$$;

-- Branches: admins also get DELETE (INSERT/UPDATE already in 001_init.sql).
create policy "branches_delete_admin"
  on branches for delete
  to authenticated
  using (is_admin());

-- Categories: public SELECT already exists; give admins full write.
create policy "categories_admin_all"
  on categories for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- Menu items: staff policies are branch-scoped. Admins get branch-agnostic
-- write access.
create policy "menu_items_admin_all"
  on menu_items for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- Restaurant tables: admins can create/delete as well as update anywhere.
create policy "restaurant_tables_admin_all"
  on restaurant_tables for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- Staff: admins can read the whole roster and manage it.
create policy "staff_admin_all"
  on staff for all
  to authenticated
  using (is_admin())
  with check (is_admin());
