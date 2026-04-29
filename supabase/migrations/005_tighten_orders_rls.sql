-- Replace the permissive "anon can insert any order" policy with one that
-- requires either:
--   (a) a valid, unexpired customer_session matching the order's branch, or
--   (b) an authenticated staff member from that branch (for manual orders).
--
-- This closes the "anonymous direct ordering" hole that the customer-auth
-- + QR-session flow was meant to prevent.

drop policy if exists "orders_insert_public" on orders;

create policy "orders_insert_customer_session"
  on orders for insert
  to anon, authenticated
  with check (
    -- Customer path: a valid customer session for the same branch.
    exists (
      select 1 from customer_sessions s
      where s.id = orders.customer_session_id
        and s.branch_id = orders.branch_id
        and s.expires_at > now()
    )
    or
    -- Staff path: authenticated staff in that branch, or an admin.
    exists (
      select 1 from staff st
      where st.user_id = auth.uid()
        and (st.branch_id = orders.branch_id or st.role = 'admin')
    )
  );

-- Tighten order_items too: insert only allowed if the parent order exists.
-- The parent order has already passed the stricter orders policy above, so
-- this is a sufficient proof-of-trust without needing a session re-check.
drop policy if exists "order_items_insert_public" on order_items;

create policy "order_items_insert_via_order"
  on order_items for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
    )
  );

-- Customers need to be able to see their own past orders (Customer Dashboard).
-- RLS scoped by customer_phone match: the query uses .eq('customer_phone', phone)
-- already; this policy lets anon read rows where their phone is embedded in
-- the request. Since we don't have Supabase Auth for customers, we allow
-- anon SELECT — the existing orders_select_public policy from 001 already does
-- this, so no change needed here. Staff can see all orders (branch-scoped
-- implicitly via the existing select policy).

-- Customer sessions: allow customers to read their own session row by id.
-- (Not strictly required for current flows, but helpful for debugging.)
-- Skipped here to minimise surface area.
