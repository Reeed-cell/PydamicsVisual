-- BUG FIX: the feedback table had insert and select policies, but no
-- update policy at all. RLS denies by default when no policy exists
-- for an operation — so every attempt to mark feedback as
-- "resolved" from the developer dashboard was silently failing. The
-- dropdown appeared to change (that's just native <select> behavior,
-- unrelated to whether the database write succeeded), but the actual
-- status never updated, and would revert to its original value on
-- next page load with no explanation.
--
-- Scoped to the developer role specifically, matching the intended
-- design — the feedback inbox is only shown in the developer
-- dashboard view, not to owner/assistant_vet/receptionist.

create policy "developer can update feedback status"
  on feedback for update
  using (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
      and staff.role = 'developer'
    )
  );
