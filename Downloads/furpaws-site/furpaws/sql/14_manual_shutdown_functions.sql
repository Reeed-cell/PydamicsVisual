-- Manual kill-switch functions — called by the three buttons on the
-- shutdown page. Each requires BOTH a valid developer session (RLS
-- enforced, same as run_admin_sql) AND its OWN dedicated password —
-- three genuinely separate passwords, one per action, so a single
-- compromised password only threatens the one action it guards, not
-- all three shutdown capabilities at once.
--
-- All three are intentionally separate from any staff login password.
-- Set their hashes AFTER running this file — see the instructions in
-- sql/14a_set_shutdown_passwords.sql.

create table if not exists shutdown_config (
  id int primary key default 1,
  site_password_hash text,
  staff_password_hash text,
  account_password_hash text,
  constraint single_row check (id = 1)
);
alter table shutdown_config enable row level security;
insert into shutdown_config (id) values (1) on conflict (id) do nothing;
-- No one can SELECT this table directly from the client — it's only
-- ever read from inside the security-definer functions below.

create or replace function verify_shutdown_password(p_which text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored_hash text;
begin
  select case p_which
    when 'site' then site_password_hash
    when 'staff' then staff_password_hash
    when 'account' then account_password_hash
  end into stored_hash
  from shutdown_config where id = 1;

  if stored_hash is null then
    return false;
  end if;
  return crypt(p_password, stored_hash) = stored_hash;
end;
$$;

-- Button 1: shut down the whole public site (maintenance page) —
-- this also blocks staff login, since "the whole site" should mean
-- the whole site, not just the public-facing half. (Previously this
-- only set site_shutdown, leaving staff login fully working despite
-- the button's own description claiming otherwise — fixed here.)
create or replace function shutdown_whole_site(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_role text;
begin
  select role into caller_role from staff where auth_user_id = auth.uid();
  if caller_role is distinct from 'developer' then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  if not verify_shutdown_password('site', p_password) then
    return jsonb_build_object('success', false, 'error', 'Incorrect password');
  end if;

  update site_status
  set site_shutdown = true,
      staff_shutdown = true,
      reason = 'Manually triggered',
      updated_by = (select id from staff where auth_user_id = auth.uid()),
      updated_at = now()
  where id = 1;

  return jsonb_build_object('success', true);
end;
$$;

-- Button 2: shut down staff login only (public site stays up)
create or replace function shutdown_staff_login(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_role text;
begin
  select role into caller_role from staff where auth_user_id = auth.uid();
  if caller_role is distinct from 'developer' then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  if not verify_shutdown_password('staff', p_password) then
    return jsonb_build_object('success', false, 'error', 'Incorrect password');
  end if;

  update site_status
  set staff_shutdown = true,
      reason = 'Manually triggered',
      updated_by = (select id from staff where auth_user_id = auth.uid()),
      updated_at = now()
  where id = 1;

  return jsonb_build_object('success', true);
end;
$$;

-- Button 3: disable one specific staff account by username
create or replace function shutdown_single_account(p_password text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_role text;
  caller_username text;
  target_exists boolean;
begin
  select role, username into caller_role, caller_username
  from staff where auth_user_id = auth.uid();

  if caller_role is distinct from 'developer' then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  if not verify_shutdown_password('account', p_password) then
    return jsonb_build_object('success', false, 'error', 'Incorrect password');
  end if;

  -- Refuse to let the developer disable their own account. Every
  -- other path into the system (normal login, 2FA, and the emergency
  -- access page) all correctly respect account_disabled — so
  -- self-targeting here, even by accident during a stressful real
  -- incident, would lock the one account capable of resolving
  -- anything or undoing the mistake. There is no recovery path from
  -- that state short of editing the database directly.
  if p_username = caller_username then
    return jsonb_build_object('success', false, 'error', 'Cannot disable your own account — this would lock you out with no way back in.');
  end if;

  select exists(select 1 from staff where username = p_username) into target_exists;
  if not target_exists then
    return jsonb_build_object('success', false, 'error', 'No account with that username');
  end if;

  update staff set account_disabled = true where username = p_username;

  return jsonb_build_object('success', true);
end;
$$;

-- Restore functions (also password + developer gated) — same
-- per-action password as the matching shutdown function.
create or replace function restore_whole_site(p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare caller_role text;
begin
  select role into caller_role from staff where auth_user_id = auth.uid();
  if caller_role is distinct from 'developer' then return jsonb_build_object('success', false, 'error', 'Access denied'); end if;
  if not verify_shutdown_password('site', p_password) then return jsonb_build_object('success', false, 'error', 'Incorrect password'); end if;
  update site_status set site_shutdown = false, staff_shutdown = false, reason = null, updated_by = (select id from staff where auth_user_id = auth.uid()), updated_at = now() where id = 1;
  return jsonb_build_object('success', true);
end; $$;

create or replace function restore_staff_login(p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare caller_role text;
begin
  select role into caller_role from staff where auth_user_id = auth.uid();
  if caller_role is distinct from 'developer' then return jsonb_build_object('success', false, 'error', 'Access denied'); end if;
  if not verify_shutdown_password('staff', p_password) then return jsonb_build_object('success', false, 'error', 'Incorrect password'); end if;
  update site_status set staff_shutdown = false, reason = null, updated_by = (select id from staff where auth_user_id = auth.uid()), updated_at = now() where id = 1;
  return jsonb_build_object('success', true);
end; $$;

create or replace function restore_single_account(p_password text, p_username text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare caller_role text;
begin
  select role into caller_role from staff where auth_user_id = auth.uid();
  if caller_role is distinct from 'developer' then return jsonb_build_object('success', false, 'error', 'Access denied'); end if;
  if not verify_shutdown_password('account', p_password) then return jsonb_build_object('success', false, 'error', 'Incorrect password'); end if;
  update staff set account_disabled = false where username = p_username;
  return jsonb_build_object('success', true);
end; $$;

grant execute on function shutdown_whole_site(text) to authenticated;
grant execute on function shutdown_staff_login(text) to authenticated;
grant execute on function shutdown_single_account(text, text) to authenticated;
grant execute on function restore_whole_site(text) to authenticated;
grant execute on function restore_staff_login(text) to authenticated;
grant execute on function restore_single_account(text, text) to authenticated;
