-- Native blog posts authored from /admin write their body as markdown.
-- We store the markdown source in `body_md` and the rendered HTML in
-- `body_html` (existing column). Round-trip editing reads body_md back
-- into the composer; the public site keeps rendering body_html through
-- DOMPurify as before.
--
-- Synced posts (`source = 'vanlavino_wp'`) leave body_md null; the sync
-- function only writes body_html, and the admin composer doesn't expose
-- those for edit (sync would overwrite anyway).

alter table blog_posts add column if not exists body_md text;

-- Realtime publication so the landing page's JournalStrip can subscribe to
-- INSERTs/UPDATEs and refresh the "Fresh from the Pass" cards the moment
-- an admin publishes a new post. Mirror of the pattern used in 002 for
-- orders/order_items/restaurant_tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'blog_posts'
  ) then
    alter publication supabase_realtime add table blog_posts;
  end if;
end $$;
