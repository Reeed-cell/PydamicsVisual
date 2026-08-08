-- Furpaws Veterinary Clinic — Staff table
-- Run this first to create the table structure

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) unique, -- links to Supabase Auth
  full_name text not null,
  username text not null unique,
  internal_address text not null unique, -- e.g. franzmembere@furpawsclinic.mail
  role text not null check (role in ('owner', 'assistant_vet', 'receptionist', 'developer')),
  created_at timestamptz default now()
);

-- Enable Row Level Security (we'll add policies once more roles exist)
alter table staff enable row level security;

-- For now: any authenticated staff member can view the staff table
create policy "staff can view staff table"
  on staff for select
  using (auth.role() = 'authenticated');
