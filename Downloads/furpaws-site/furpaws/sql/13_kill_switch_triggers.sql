-- Auto-trigger functions for the kill switch.
--
-- SECURITY NOTE: these run as SECURITY DEFINER, meaning they execute
-- with elevated privilege regardless of who calls them — necessary
-- because a failed login attempt happens before anyone is
-- authenticated, so normal RLS (which requires a developer session)
-- can't apply here. This is safe specifically because each function
-- does exactly ONE narrow thing with hardcoded logic — none of them
-- accept a caller-supplied query or arbitrary target. A caller can
-- trigger "shut down if the real threshold is met" and nothing else.

-- Called after logging a failed login attempt. Checks if 10+ failed
-- password attempts (across all accounts) happened in the last 5
-- minutes, and shuts down staff login if so.
create or replace function check_login_flood()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_failures int;
begin
  select count(*) into recent_failures
  from failed_login_attempts
  where attempt_type = 'password'
    and created_at > now() - interval '5 minutes';

  if recent_failures >= 10 then
    update site_status
    set staff_shutdown = true,
        reason = 'Auto-triggered: ' || recent_failures || ' failed logins in 5 minutes',
        updated_at = now()
    where id = 1 and staff_shutdown = false;
  end if;
end;
$$;

-- Called after logging a failed 2FA attempt. If the SAME account has
-- failed 2FA 5+ times in the last 10 minutes, disables that specific
-- account (not the whole site) — this pattern means someone has the
-- password but not the authenticator device.
--
-- EXCEPTION: never auto-disables a developer-role account. Every
-- entry point into the system (normal login, 2FA, and even the
-- hidden emergency access page) correctly respects account_disabled
-- — so if this trigger ever fired on the one account with no
-- recovery path (there's no "restore my own account" option once
-- locked out, and the emergency page explicitly still checks this
-- flag by design), the system would have no way back in short of
-- editing the database directly. The suspicious activity is still
-- logged either way, so a real attack attempt remains visible —
-- this only skips the automatic lockout for that one account.
create or replace function check_mfa_flood(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_mfa_failures int;
  target_role text;
begin
  select count(*) into recent_mfa_failures
  from failed_login_attempts
  where attempt_type = 'mfa'
    and username_attempted = p_username
    and created_at > now() - interval '10 minutes';

  if recent_mfa_failures >= 5 then
    select role into target_role from staff where username = p_username;

    insert into suspicious_activity (activity_type, detail)
    values ('mfa_flood', 'Repeated 2FA failures for: ' || p_username ||
      case when target_role = 'developer' then ' (developer account — NOT auto-disabled, see notes)' else ' (account auto-disabled)' end);

    if target_role is distinct from 'developer' then
      update staff
      set account_disabled = true
      where username = p_username and account_disabled = false;
    end if;
  end if;
end;
$$;

-- Called when a form submission contains a pattern that looks like
-- an injection/script attempt. Logs it, and if 5+ such attempts
-- happen within 10 minutes, shuts down the whole public site
-- (maintenance mode) — this pattern suggests active probing, not a
-- one-off mistake.
create or replace function log_suspicious_input(p_type text, p_detail text, p_page text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  insert into suspicious_activity (activity_type, detail, page_url)
  values (p_type, p_detail, p_page);

  select count(*) into recent_count
  from suspicious_activity
  where created_at > now() - interval '10 minutes';

  if recent_count >= 5 then
    update site_status
    set site_shutdown = true,
        reason = 'Auto-triggered: ' || recent_count || ' suspicious input patterns in 10 minutes',
        updated_at = now()
    where id = 1 and site_shutdown = false;
  end if;
end;
$$;

grant execute on function check_login_flood() to anon, authenticated;
grant execute on function check_mfa_flood(text) to anon, authenticated;
grant execute on function log_suspicious_input(text, text, text) to anon, authenticated;
