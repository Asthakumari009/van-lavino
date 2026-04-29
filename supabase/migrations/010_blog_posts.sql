-- Blog posts — mirrored from vanlavino.com/blogs and authored natively here.
--
-- Content strategy:
--   - `source = 'vanlavino_wp'`  → originally scraped from vanlavino.com;
--     the `blog-sync` edge function upserts by slug on every run.
--   - `source = 'native'`         → written directly in our admin; the sync
--     leaves these alone.
-- The `source_url` and `source_checksum` let the sync decide whether to
-- re-import a post (content changed on the upstream side).

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body_html text,                          -- sanitized on render (DOMPurify)
  hero_image_url text,                     -- Supabase Storage URL after mirror
  hero_image_external_url text,            -- original URL, kept for debugging
  published_at timestamptz,
  source text not null default 'native'
    check (source in ('native', 'vanlavino_wp')),
  source_url text,
  source_checksum text,
  is_published boolean default true,
  is_featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists blog_posts_published_idx
  on blog_posts (is_published, published_at desc)
  where is_published;

create index if not exists blog_posts_featured_idx
  on blog_posts (is_featured, published_at desc)
  where is_published and is_featured;

-- keep updated_at fresh
create or replace function public.blog_posts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_touch on blog_posts;
create trigger blog_posts_touch
  before update on blog_posts
  for each row
  execute function public.blog_posts_touch_updated_at();

alter table blog_posts enable row level security;

-- Public read of published posts.
create policy "blog_posts_select_public"
  on blog_posts for select
  to anon, authenticated
  using (is_published = true);

-- Admins see everything.
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

-- ================================================================
-- Storage bucket for blog images.
-- The bucket itself is public (so our customer <img> tags can render
-- without signed URLs); RLS on storage.objects restricts WRITES to
-- service_role only — the edge function uses service-role when
-- mirroring upstream images.
-- ================================================================

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do update set public = excluded.public;

-- Allow anyone to read (public images). Supabase's default policies for
-- public buckets usually handle this, but we'll be explicit.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'blog_images_public_read'
  ) then
    create policy "blog_images_public_read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'blog-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'blog_images_admin_write'
  ) then
    create policy "blog_images_admin_write"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'blog-images' and public.is_admin());
  end if;
end $$;
