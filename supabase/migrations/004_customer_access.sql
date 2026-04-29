-- Customer access flow: customer identity + table-scoped sessions.

create table if not exists customer_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  table_number text not null,
  qr_token text not null,
  customer_name text not null,
  customer_phone text not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '3 hours')
);

alter table customer_sessions enable row level security;

create policy "customer_sessions_insert_public"
  on customer_sessions for insert
  to anon, authenticated
  with check (true);

create policy "customer_sessions_select_staff"
  on customer_sessions for select
  to authenticated
  using (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = customer_sessions.branch_id
    )
  );

alter table orders
  add column if not exists table_token text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_session_id uuid references customer_sessions(id);
