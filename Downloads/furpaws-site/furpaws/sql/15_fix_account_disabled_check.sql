-- BUG FIX: the pre-login "is this account disabled" check in
-- staff-login.js queries the staff table directly, but the only
-- SELECT policy on staff requires auth.role() = 'authenticated' —
-- and at that point in the flow, the visitor hasn't signed in yet,
-- so they're 'anon', not 'authenticated'. RLS silently returns zero
-- rows, the check always passes (finds nothing to block), and a
-- disabled account can proceed all the way through password auth —
-- and even a full 2FA challenge — before finally being caught by the
-- dashboard's own post-login check. This RPC gives anonymous
-- visitors a narrow, safe way to check ONLY the disabled flag for
-- ONE username, without granting any broader read access to the
-- staff table (no role, no internal address, nothing else exposed).

create or replace function check_account_disabled(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_disabled boolean;
begin
  select account_disabled into is_disabled
  from staff
  where username = p_username;

  return coalesce(is_disabled, false);
end;
$$;

grant execute on function check_account_disabled(text) to anon, authenticated;
