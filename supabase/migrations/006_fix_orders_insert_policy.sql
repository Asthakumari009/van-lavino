-- Bug fix for 005.
-- The previous orders_insert_customer_session policy embedded an
-- EXISTS (select ... from customer_sessions) clause. That subquery is itself
-- subject to RLS, and migration 004 only allows staff to SELECT from
-- customer_sessions — so the subquery always returns empty for customers
-- and the INSERT is rejected with 403 ("new row violates row-level security").
--
-- Fix: move the session validity check into a SECURITY DEFINER function so
-- it runs as the function owner (postgres) and bypasses RLS on the lookup,
-- then call it from the policy. Same trick used by is_admin() in 003.

create or replace function public.customer_session_valid(
  sess_id uuid,
  branch uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from customer_sessions s
    where s.id = sess_id
      and s.branch_id = branch
      and s.expires_at > now()
  );
$$;

-- Replace the old policy that had the inline EXISTS.
drop policy if exists "orders_insert_customer_session" on orders;

create policy "orders_insert_customer_session"
  on orders for insert
  to anon, authenticated
  with check (
    -- Customer path: session validated server-side, bypassing RLS on the
    -- customer_sessions lookup.
    customer_session_valid(orders.customer_session_id, orders.branch_id)
    or
    -- Staff path: authenticated staff in that branch, or an admin.
    exists (
      select 1 from staff st
      where st.user_id = auth.uid()
        and (st.branch_id = orders.branch_id or st.role = 'admin')
    )
  );
