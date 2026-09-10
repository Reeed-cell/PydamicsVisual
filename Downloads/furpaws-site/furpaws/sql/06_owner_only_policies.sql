-- Restrict services and shifts to owner-only writes
-- (previously anyone authenticated could insert/update — this locks it
-- down to match the original role plan: only the owner manages these)

drop policy if exists "staff can view all services" on services;

create policy "staff can view all services"
  on services for select
  using (auth.role() = 'authenticated');

create policy "owner can insert services"
  on services for insert
  with check (
    exists (select 1 from staff where staff.auth_user_id = auth.uid() and staff.role = 'owner')
  );

create policy "owner can update services"
  on services for update
  using (
    exists (select 1 from staff where staff.auth_user_id = auth.uid() and staff.role = 'owner')
  );

create policy "owner can insert shifts"
  on shifts for insert
  with check (
    exists (select 1 from staff where staff.auth_user_id = auth.uid() and staff.role = 'owner')
  );
