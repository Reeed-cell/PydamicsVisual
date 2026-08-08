-- Furpaws Veterinary Clinic — Full schema (remaining tables)
-- staff table already exists — this adds everything else

-- SHIFTS: which staff work which dates
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now()
);
alter table shifts enable row level security;
create policy "staff can view shifts" on shifts for select using (auth.role() = 'authenticated');

-- SERVICES: public-facing service list, editable by owner
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price text,
  active boolean default true,
  created_at timestamptz default now()
);
alter table services enable row level security;
create policy "anyone can view active services" on services for select using (active = true);
create policy "staff can view all services" on services for select using (auth.role() = 'authenticated');

-- BOOKINGS: client booking requests
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  owner_contact text not null,
  pet_name text not null,
  pet_species text not null,
  service text not null,
  preferred_datetime timestamptz not null,
  assigned_staff_id uuid references staff(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'done', 'cancelled')),
  notes text,
  created_at timestamptz default now()
);
alter table bookings enable row level security;
create policy "anyone can create a booking" on bookings for insert with check (true);
create policy "staff can view bookings" on bookings for select using (auth.role() = 'authenticated');
create policy "staff can update bookings" on bookings for update using (auth.role() = 'authenticated');

-- PATIENT NOTES: clinical notes tied to a booking
create table if not exists patient_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) not null,
  written_by uuid references staff(id) not null,
  note_text text not null,
  created_at timestamptz default now()
);
alter table patient_notes enable row level security;
create policy "staff can view patient notes" on patient_notes for select using (auth.role() = 'authenticated');
create policy "staff can insert patient notes" on patient_notes for insert with check (auth.role() = 'authenticated');

-- INTERNAL MESSAGES: staff-to-staff mail + auto-routed booking notifications
create table if not exists internal_messages (
  id uuid primary key default gen_random_uuid(),
  from_address text not null,
  to_address text not null,
  subject text,
  body text not null,
  related_booking_id uuid references bookings(id),
  read boolean default false,
  created_at timestamptz default now()
);
alter table internal_messages enable row level security;
create policy "staff can view internal messages" on internal_messages for select using (auth.role() = 'authenticated');
create policy "staff can send internal messages" on internal_messages for insert with check (auth.role() = 'authenticated');

-- FEEDBACK: support/bug reports from clients or staff
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  message text not null,
  category text check (category in ('bug', 'suggestion', 'question')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz default now()
);
alter table feedback enable row level security;
create policy "anyone can submit feedback" on feedback for insert with check (true);
create policy "staff can view feedback" on feedback for select using (auth.role() = 'authenticated');
