-- Storage bucket for booking attachment photos/videos
insert into storage.buckets (id, name, public)
values ('booking-attachments', 'booking-attachments', true)
on conflict (id) do nothing;

create policy "anyone can upload booking attachments"
  on storage.objects for insert
  with check (bucket_id = 'booking-attachments');

create policy "anyone can view booking attachments"
  on storage.objects for select
  using (bucket_id = 'booking-attachments');

-- Column to store the attachment path on the booking row
alter table bookings add column if not exists attachment_path text;
