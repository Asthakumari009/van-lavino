-- Hard MFA enforcement for admin operations.
--
-- Previously `is_admin()` only checked the staff role. A stolen aal1
-- session token would still pass it, so MFA on the frontend was just an
-- obstacle, not a real security boundary. This migration adds a parallel
-- helper `is_admin_with_mfa()` that also requires `auth.jwt()->>'aal' =
-- 'aal2'`, and rebinds every admin-only write policy to use it.
--
-- Effect: an admin who hasn't completed the TOTP challenge for the
-- current session can still READ everything they could before, but
-- INSERTs/UPDATEs/DELETEs against branches, categories, menu_items,
-- restaurant_tables, staff, and blog_posts will be refused at the
-- database. The frontend redirects them through the challenge.
--
-- Staff-level writes (e.g. staff updating orders for their own branch)
-- are deliberately NOT locked behind aal2 so day-to-day cashier work
-- still flows for staff who haven't enrolled.

create or replace function public.is_admin_with_mfa()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select
    exists (
      select 1 from staff s
      where s.user_id = auth.uid() and s.role = 'admin'
    )
    -- aal claim sits at the top level of the JWT. Defaults to aal1 if
    -- somehow missing so we fail closed.
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- ============================================================
-- Rebind admin-only write policies. We keep the public/staff SELECT
-- policies intact and only tighten the writes.
-- ============================================================

-- Branches
drop policy if exists "branches_insert_admin" on branches;
drop policy if exists "branches_update_admin" on branches;
drop policy if exists "branches_delete_admin" on branches;

create policy "branches_insert_admin"
  on branches for insert
  to authenticated
  with check (is_admin_with_mfa());

create policy "branches_update_admin"
  on branches for update
  to authenticated
  using (is_admin_with_mfa())
  with check (is_admin_with_mfa());

create policy "branches_delete_admin"
  on branches for delete
  to authenticated
  using (is_admin_with_mfa());

-- Categories — admin-write only.
drop policy if exists "categories_admin_all" on categories;

create policy "categories_admin_all"
  on categories for all
  to authenticated
  using (is_admin_with_mfa())
  with check (is_admin_with_mfa());

-- Menu items — admin branch-agnostic write. Branch staff retain their
-- own policies (defined in 001_init) which are NOT locked behind aal2.
drop policy if exists "menu_items_admin_all" on menu_items;

create policy "menu_items_admin_all"
  on menu_items for all
  to authenticated
  using (is_admin_with_mfa())
  with check (is_admin_with_mfa());

-- Restaurant tables — admin can manage everything, staff retain their
-- own select policy.
drop policy if exists "restaurant_tables_admin_all" on restaurant_tables;

create policy "restaurant_tables_admin_all"
  on restaurant_tables for all
  to authenticated
  using (is_admin_with_mfa())
  with check (is_admin_with_mfa());

-- Staff roster — admins manage everyone (staff_select_self stays open).
drop policy if exists "staff_admin_all" on staff;

create policy "staff_admin_all"
  on staff for all
  to authenticated
  using (is_admin_with_mfa())
  with check (is_admin_with_mfa());

-- Blog posts — admin writes only (public read at is_published=true is
-- separate, untouched).
drop policy if exists "blog_posts_select_admin" on blog_posts;
drop policy if exists "blog_posts_insert_admin" on blog_posts;
drop policy if exists "blog_posts_update_admin" on blog_posts;
drop policy if exists "blog_posts_delete_admin" on blog_posts;

-- Reading drafts is not destructive but it does leak unpublished
-- content — we lock it behind aal2 too.
create policy "blog_posts_select_admin"
  on blog_posts for select
  to authenticated
  using (is_admin_with_mfa());

create policy "blog_posts_insert_admin"
  on blog_posts for insert
  to authenticated
  with check (is_admin_with_mfa());

create policy "blog_posts_update_admin"
  on blog_posts for update
  to authenticated
  using (is_admin_with_mfa())
  with check (is_admin_with_mfa());

-- DELETE policies take USING only — Postgres refuses WITH CHECK here.
create policy "blog_posts_delete_admin"
  on blog_posts for delete
  to authenticated
  using (is_admin_with_mfa());

-- Storage: blog-images and menu-images admin write policies.
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
    with check (bucket_id = 'blog-images' and public.is_admin_with_mfa());

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
    with check (bucket_id = 'menu-images' and public.is_admin_with_mfa());

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
    using (bucket_id = 'menu-images' and public.is_admin_with_mfa())
    with check (bucket_id = 'menu-images' and public.is_admin_with_mfa());
end $$;
