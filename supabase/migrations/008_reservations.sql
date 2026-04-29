-- Table reservations.
-- Customers book ahead via /reserve. Staff/managers of the branch confirm,
-- mark seated, no-show, or cancelled. Admins can edit anything.

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete restrict,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  party_size smallint not null check (party_size between 1 and 30),
  reserved_at timestamptz not null,
  duration_minutes smallint default 90,
  occasion text,            -- 'birthday' | 'anniversary' | 'business' | etc.
  note text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','seated','completed','cancelled','no_show')),
  handled_by uuid references staff(id),
  confirmation_code text unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists reservations_branch_time_idx
  on reservations (branch_id, reserved_at);

create index if not exists reservations_status_idx
  on reservations (status, reserved_at);

-- keep updated_at fresh on any change
create or replace function public.reservations_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservations_touch on reservations;
create trigger reservations_touch
  before update on reservations
  for each row
  execute function public.reservations_touch_updated_at();

-- =============================================================
-- RLS
-- =============================================================

alter table reservations enable row level security;

-- Public (anon) can INSERT a reservation. We do minimal checks at the DB
-- level; the customer page validates party size, time window etc. first.
create policy "reservations_insert_public"
  on reservations for insert
  to anon, authenticated
  with check (
    party_size between 1 and 30
    and reserved_at > now() - interval '1 hour'   -- allow small clock skew
  );

-- Customers can look up their own reservation by confirmation_code via a
-- SECURITY DEFINER RPC (see below). We intentionally do NOT expose a
-- general SELECT policy for anon, so scraping is not possible.

-- Staff/managers of the reservation's branch, and any admin, can SELECT.
create policy "reservations_select_staff"
  on reservations for select
  to authenticated
  using (
    exists (
      select 1 from staff st
      where st.user_id = auth.uid()
        and (st.role = 'admin' or st.branch_id = reservations.branch_id)
    )
  );

-- Staff of the branch and admins can UPDATE (to confirm / mark seated / etc).
create policy "reservations_update_staff"
  on reservations for update
  to authenticated
  using (
    exists (
      select 1 from staff st
      where st.user_id = auth.uid()
        and (st.role = 'admin' or st.branch_id = reservations.branch_id)
    )
  )
  with check (
    exists (
      select 1 from staff st
      where st.user_id = auth.uid()
        and (st.role = 'admin' or st.branch_id = reservations.branch_id)
    )
  );

create policy "reservations_delete_admin"
  on reservations for delete
  to authenticated
  using (is_admin());

-- =============================================================
-- Public lookup by confirmation code (for customer "check my booking")
-- =============================================================

create or replace function public.reservation_by_code(code text)
returns table (
  id uuid,
  branch_id uuid,
  customer_name text,
  party_size smallint,
  reserved_at timestamptz,
  status text,
  note text,
  confirmation_code text,
  branch_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.branch_id, r.customer_name, r.party_size,
         r.reserved_at, r.status, r.note, r.confirmation_code,
         b.name as branch_name
  from reservations r
  join branches b on b.id = r.branch_id
  where upper(r.confirmation_code) = upper(code)
  limit 1;
$$;

grant execute on function public.reservation_by_code(text) to anon, authenticated;

-- Enable realtime so staff dashboard gets live updates when customers book.
alter publication supabase_realtime add table reservations;
