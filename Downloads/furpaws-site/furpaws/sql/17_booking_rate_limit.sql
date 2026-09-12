-- Rate limit on booking submissions.
--
-- Implemented as a BEFORE INSERT trigger directly on the bookings
-- table, rather than a check inside the frontend or a separate RPC.
-- This matters: a client-side cooldown (e.g. localStorage) can be
-- cleared or bypassed trivially, and only checking in JavaScript
-- before calling .insert() can be skipped entirely by anyone calling
-- the Supabase REST API directly with the public anon key. A
-- database trigger fires no matter how the insert is attempted —
-- it's the one place this can't be routed around.
--
-- Threshold: no more than 3 booking submissions from the same
-- contact info (owner_contact) within a 10-minute window. This
-- allows a genuine visitor to submit a couple of legitimate requests
-- (e.g. two different pets) in quick succession, while still
-- blocking rapid repeated/automated submissions.

create or replace function check_booking_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from bookings
  where owner_contact = new.owner_contact
    and created_at > now() - interval '10 minutes';

  if recent_count >= 3 then
    raise exception 'Too many booking requests submitted recently. Please wait a few minutes and try again.';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_rate_limit_trigger on bookings;
create trigger booking_rate_limit_trigger
  before insert on bookings
  for each row
  execute function check_booking_rate_limit();
