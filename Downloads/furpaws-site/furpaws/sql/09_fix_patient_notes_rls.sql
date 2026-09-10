-- BUG FIX: patient_notes previously allowed ANY authenticated staff
-- (including receptionists) to insert notes — contradicting the
-- intended design where only the owner and assistant vets can write
-- clinical notes, and receptionists get view-only access.
--
-- This table isn't currently used by the frontend (pet_records
-- replaced it for the real records feature), but RLS is the only
-- real protection against direct API access — the anon key and
-- project URL are both public by design, so "the UI doesn't call it"
-- is not a security boundary. Anyone with browser DevTools could call
-- the Supabase client directly and bypass the UI entirely. Fixing
-- this now closes that gap regardless of whether the table sees
-- future use.

drop policy if exists "staff can insert patient notes" on patient_notes;

create policy "owner and assistant vet can insert patient notes"
  on patient_notes for insert
  with check (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
      and staff.role in ('owner', 'assistant_vet')
    )
  );
