-- Customer reviews on served orders.
-- One review per order (enforced by unique index on order_id). Reviews are
-- publicly readable for the landing-page carousel as long as
-- `is_published = true`, so no PII should be stored beyond customer_name.

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references orders(id) on delete cascade,
  branch_id uuid references branches(id),
  customer_session_id uuid references customer_sessions(id),
  customer_name text,
  rating smallint not null check (rating between 1 and 5),
  body text,
  is_published boolean default true,
  is_featured boolean default false,
  created_at timestamptz default now()
);

create index if not exists reviews_branch_published_idx
  on reviews (branch_id, is_published, created_at desc);

create index if not exists reviews_featured_idx
  on reviews (is_featured, created_at desc)
  where is_published;

alter table reviews enable row level security;

-- Public landing page needs to read published reviews without auth.
create policy "reviews_select_public"
  on reviews for select
  to anon, authenticated
  using (is_published = true);

-- Staff can see everything (including unpublished / flagged).
create policy "reviews_select_staff"
  on reviews for select
  to authenticated
  using (
    exists (
      select 1 from staff st
      where st.user_id = auth.uid()
        and (st.role = 'admin' or st.branch_id = reviews.branch_id)
    )
  );

-- Customer can insert a review tied to their valid session. We reuse the
-- same SECURITY DEFINER helper that gates order inserts, so the policy
-- doesn't get tripped up by nested RLS on customer_sessions.
create policy "reviews_insert_customer_session"
  on reviews for insert
  to anon, authenticated
  with check (
    customer_session_valid(reviews.customer_session_id, reviews.branch_id)
  );

-- Admin-only management (feature / unpublish / edit).
create policy "reviews_update_admin"
  on reviews for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "reviews_delete_admin"
  on reviews for delete
  to authenticated
  using (is_admin());
