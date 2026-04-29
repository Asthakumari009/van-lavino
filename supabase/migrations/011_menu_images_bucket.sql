-- Storage bucket for menu item photos.
-- Same pattern as blog-images: public read (so <img> tags work without
-- signed URLs), admin-only writes via RLS on storage.objects.

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'menu_images_public_read'
  ) then
    create policy "menu_images_public_read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'menu-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'menu_images_admin_write'
  ) then
    create policy "menu_images_admin_write"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'menu-images' and public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'menu_images_admin_update'
  ) then
    create policy "menu_images_admin_update"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'menu-images' and public.is_admin())
      with check (bucket_id = 'menu-images' and public.is_admin());
  end if;
end $$;

