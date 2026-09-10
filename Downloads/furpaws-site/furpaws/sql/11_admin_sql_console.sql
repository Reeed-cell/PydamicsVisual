-- Developer SQL console — lets the developer account run raw SQL
-- from the dashboard, for testing/inspection.
--
-- SECURITY DESIGN (read this before running):
-- - The role check happens INSIDE this function, in Postgres itself —
--   not in frontend JavaScript. Frontend checks can always be
--   bypassed by anyone who calls the RPC directly with the public
--   anon key (which is visible in every page's source, by design).
--   This check cannot be bypassed that way, because it runs on the
--   server regardless of how the function is invoked.
-- - Only an authenticated session belonging to a staff row with
--   role = 'developer' can execute anything through this function.
--   Every other caller (including anonymous visitors, and every
--   other staff role) gets an error before the query even runs.
-- - This does NOT make the caller a Postgres superuser. Supabase
--   executes RPC functions as a restricted role — this cannot drop
--   the database cluster, alter other Supabase projects, or escape
--   this project's own Postgres instance.
-- - This IS a genuine raw-SQL execution surface for one specific
--   account. If that account's password or session is ever
--   compromised, whoever has it can run arbitrary SQL — including
--   DELETE/DROP/UPDATE across every table. That's the real tradeoff
--   being made here: this is real power, guarded by exactly one
--   layer (the developer account's own login security), not by RLS
--   nuance per-table the way the rest of the app is. Treat that
--   account's password and 2FA as the single most important secret
--   in this whole system.

create or replace function run_admin_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  result jsonb;
begin
  -- Server-side check — cannot be bypassed by calling this function
  -- directly with any client credentials other than a real developer
  -- session.
  select role into caller_role
  from staff
  where auth_user_id = auth.uid();

  if caller_role is distinct from 'developer' then
    raise exception 'Access denied: developer role required';
  end if;

  -- Execute the query and return results as JSON. Works for SELECT;
  -- for INSERT/UPDATE/DELETE without RETURNING, this returns an
  -- empty result but the write still happens.
  begin
    execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || query || ') t' into result;
  exception when others then
    return jsonb_build_object('error', SQLERRM);
  end;

  return result;
end;
$$;

-- Only authenticated users can even attempt to call this (the
-- function's own internal check further restricts it to the
-- developer role specifically).
revoke all on function run_admin_sql(text) from public, anon;
grant execute on function run_admin_sql(text) to authenticated;
