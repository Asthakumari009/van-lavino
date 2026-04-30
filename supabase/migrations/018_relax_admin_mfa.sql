-- Relax MFA enforcement: admins can write with just a password session.
--
-- Migration 016 bound every admin-only write policy to is_admin_with_mfa(),
-- which required `auth.jwt()->>'aal' = 'aal2'`. The frontend MFA flow has
-- since been removed (the challenge step kept hanging in production), so
-- admins were locked out of writes — they could read, but every INSERT/
-- UPDATE/DELETE returned an RLS denial.
--
-- This migration rebinds those policies to is_admin() (no MFA check), which
-- matches the original 003_admin_policies behaviour. MFA can be re-introduced
-- later: re-enable it in Supabase Auth → MFA, re-add the frontend challenge,
-- and ship a follow-up migration that flips these back to is_admin_with_mfa().
--
-- The is_admin() helper still exists from 003 — we don't drop the
-- is_admin_with_mfa() helper either, so a future migration can flip back
-- without recreating it.

-- ============================================================
-- Branches
-- ============================================================

drop policy if exists "branches_insert_admin" on branches;
drop policy if exists "branches_update_admin" on branches;
drop policy if exists "branches_delete_admin" on branches;

create policy "branches_insert_admin"
  on branches for insert
  to authenticated
  with check (is_admin());

create policy "branches_update_admin"
  on branches for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "branches_delete_admin"
  on branches for delete
  to authenticated
  using (is_admin());

-- ============================================================
-- Categories
-- ============================================================

drop policy if exists "categories_admin_all" on categories;

create policy "categories_admin_all"
  on categories for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Menu items
-- ============================================================

drop policy if exists "menu_items_admin_all" on menu_items;

create policy "menu_items_admin_all"
  on menu_items for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Restaurant tables
-- ============================================================

drop policy if exists "restaurant_tables_admin_all" on restaurant_tables;

create policy "restaurant_tables_admin_all"
  on restaurant_tables for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Staff
-- ============================================================

drop policy if exists "staff_admin_all" on staff;

create policy "staff_admin_all"
  on staff for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Blog posts
-- ============================================================

drop policy if exists "blog_posts_select_admin" on blog_posts;
drop policy if exists "blog_posts_insert_admin" on blog_posts;
drop policy if exists "blog_posts_update_admin" on blog_posts;
drop policy if exists "blog_posts_delete_admin" on blog_posts;

create policy "blog_posts_select_admin"
  on blog_posts for select
  to authenticated
  using (is_admin());

create policy "blog_posts_insert_admin"
  on blog_posts for insert
  to authenticated
  with check (is_admin());

create policy "blog_posts_update_admin"
  on blog_posts for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "blog_posts_delete_admin"
  on blog_posts for delete
  to authenticated
  using (is_admin());

-- ============================================================
-- Storage: blog-images and menu-images admin write policies
-- ============================================================

do $$
begin
  -- blog-images
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'blog_images_admin_write'
  ) then
    drop policy "blog_images_admin_write" on storage.objects;
  end if;
  create policy "blog_images_admin_write"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'blog-images' and public.is_admin());

  -- menu-images
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'menu_images_admin_write'
  ) then
    drop policy "menu_images_admin_write" on storage.objects;
  end if;
  create policy "menu_images_admin_write"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'menu-images' and public.is_admin());

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'menu_images_admin_update'
  ) then
    drop policy "menu_images_admin_update" on storage.objects;
  end if;
  create policy "menu_images_admin_update"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'menu-images' and public.is_admin())
    with check (bucket_id = 'menu-images' and public.is_admin());
end $$;
