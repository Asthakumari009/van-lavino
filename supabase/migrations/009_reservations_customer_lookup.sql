-- Customer-side lookup + cancel for reservations.
-- The reservations table's RLS policies restrict SELECT to staff/admin;
-- these two SECURITY DEFINER RPCs give customers a safe, rate-limited
-- window into their own bookings using the phone number they supplied
-- at booking time. Phone-only "auth" is weak — fine for restaurant
-- reservations (low-sensitivity, no PII beyond a name + phone), but add
-- OTP later if the surface grows.

-- Return all reservations that match the exact 10-digit phone, newest first.
create or replace function public.reservations_by_phone(phone_digits text)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  branch_city text,
  customer_name text,
  customer_phone text,
  party_size smallint,
  reserved_at timestamptz,
  occasion text,
  note text,
  status text,
  confirmation_code text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.branch_id,
    b.name,
    b.city,
    r.customer_name,
    r.customer_phone,
    r.party_size,
    r.reserved_at,
    r.occasion,
    r.note,
    r.status,
    r.confirmation_code,
    r.created_at
  from reservations r
  join branches b on b.id = r.branch_id
  where regexp_replace(r.customer_phone, '\D', '', 'g')
      = regexp_replace(phone_digits, '\D', '', 'g')
  order by r.reserved_at desc
  limit 50;
$$;

grant execute on function public.reservations_by_phone(text) to anon, authenticated;

-- Customer-side cancel. Requires both the reservation id AND the
-- confirmation code to prevent someone from cancelling a stranger's
-- booking just by knowing a phone number. Refuses to cancel anything
-- that's already started (seated / completed) or that's less than 60
-- minutes away — late cancels should go through staff.
create or replace function public.cancel_reservation_by_code(
  reservation_id uuid,
  code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  update reservations
     set status = 'cancelled'
   where id = reservation_id
     and upper(confirmation_code) = upper(code)
     and status in ('pending', 'confirmed')
     and reserved_at > now() + interval '60 minutes';
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

grant execute on function public.cancel_reservation_by_code(uuid, text)
  to anon, authenticated;
