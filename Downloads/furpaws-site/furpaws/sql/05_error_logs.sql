-- Furpaws Veterinary Clinic — Error logging + dashboard support
-- Run after 04_public_staff_directory.sql

-- ERROR LOGS: real client-side JS errors, caught automatically
create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  source_url text,
  line_number int,
  column_number int,
  stack text,
  page_url text,
  user_agent text,
  staff_id uuid references staff(id), -- null if it happened on the public site
  created_at timestamptz default now()
);
alter table error_logs enable row level security;

-- Anyone's browser can log an error (public site + dashboard both need this)
create policy "anyone can log an error"
  on error_logs for insert
  with check (true);

-- Only staff can read the error log
create policy "staff can view error logs"
  on error_logs for select
  using (auth.role() = 'authenticated');
