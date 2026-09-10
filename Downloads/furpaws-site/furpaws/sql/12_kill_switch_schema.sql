-- Kill switch system: site status, failed-attempt tracking, and
-- suspicious activity detection.

-- SITE_STATUS: single-row table controlling shutdown state.
-- id is always 1 — this is a singleton control row, not a log.
create table if not exists site_status (
  id int primary key default 1,
  site_shutdown boolean not null default false,
  staff_shutdown boolean not null default false,
  updated_at timestamptz default now(),
  updated_by uuid references staff(id),
  reason text,
  constraint single_row check (id = 1)
);
insert into site_status (id) values (1) on conflict (id) do nothing;

alter table site_status enable row level security;

-- Anyone (including logged-out visitors) needs to READ this, so the
-- public site and login page know whether to show the maintenance
-- page / block logins.
create policy "anyone can view site status"
  on site_status for select
  using (true);

-- Only the developer role can change it (both manual buttons and the
-- auto-trigger function run as the developer's own authenticated
-- session, or via a security-definer function — see below).
create policy "developer can update site status"
  on site_status for update
  using (
    exists (select 1 from staff where staff.auth_user_id = auth.uid() and staff.role = 'developer')
  );

-- STAFF_SHUTDOWN column: also add a per-account disabled flag to staff
alter table staff add column if not exists account_disabled boolean not null default false;

-- FAILED_LOGIN_ATTEMPTS: tracks failed logins for the flood detector.
-- Logged by the frontend on every failed attempt (not sensitive data
-- — just a timestamp and which username was tried, for rate analysis).
create table if not exists failed_login_attempts (
  id uuid primary key default gen_random_uuid(),
  username_attempted text,
  attempt_type text not null check (attempt_type in ('password', 'mfa')),
  created_at timestamptz default now()
);
alter table failed_login_attempts enable row level security;

create policy "anyone can log a failed attempt"
  on failed_login_attempts for insert
  with check (true);

create policy "staff can view failed attempts"
  on failed_login_attempts for select
  using (auth.role() = 'authenticated');

-- SUSPICIOUS_ACTIVITY: logged when a public form field contains a
-- pattern that looks like an injection/script attempt.
create table if not exists suspicious_activity (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  detail text,
  page_url text,
  created_at timestamptz default now()
);
alter table suspicious_activity enable row level security;

create policy "anyone can log suspicious activity"
  on suspicious_activity for insert
  with check (true);

create policy "staff can view suspicious activity"
  on suspicious_activity for select
  using (auth.role() = 'authenticated');
