-- Public staff directory — for the "message the clinic" autocomplete
-- on the public site. This exposes ONLY full_name and internal_address,
-- never username, role, or auth_user_id, so visitors can't see anything
-- sensitive about staff accounts.

create or replace view public_staff_directory as
select full_name, internal_address
from staff;

grant select on public_staff_directory to anon, authenticated;

-- Allow public (unauthenticated) visitors to send internal messages —
-- needed for the "Message the clinic" contact form. Reading messages
-- still requires being authenticated staff (see 02_full_schema.sql).
drop policy if exists "staff can send internal messages" on internal_messages;
create policy "anyone can send internal messages"
  on internal_messages for insert
  with check (true);
