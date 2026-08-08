-- Furpaws Veterinary Clinic — Pet Records
-- Run this in the SQL Editor after the earlier schema scripts

-- PETS: the profile, accumulates records over time
create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null,
  breed text,
  birthdate date,
  weight_kg numeric,
  owner_name text not null,
  owner_contact text not null,
  general_notes text,
  created_at timestamptz default now()
);
alter table pets enable row level security;

create policy "staff can view pets"
  on pets for select
  using (auth.role() = 'authenticated');

create policy "owner and assistant vet can create pets"
  on pets for insert
  with check (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
      and staff.role in ('owner', 'assistant_vet')
    )
  );

create policy "owner and assistant vet can update pets"
  on pets for update
  using (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
      and staff.role in ('owner', 'assistant_vet')
    )
  );

-- PET_RECORDS: one row per visit/entry, tied to a pet
create table if not exists pet_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid references pets(id) not null,
  written_by uuid references staff(id) not null,
  visit_date date not null default current_date,
  diagnosis text,
  treatment text,
  medications text,
  image_paths text[], -- array of Supabase Storage file paths
  created_at timestamptz default now()
);
alter table pet_records enable row level security;

create policy "staff can view pet records"
  on pet_records for select
  using (auth.role() = 'authenticated');

create policy "owner and assistant vet can create pet records"
  on pet_records for insert
  with check (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
      and staff.role in ('owner', 'assistant_vet')
    )
  );

-- STORAGE: bucket for pet record images
insert into storage.buckets (id, name, public)
values ('pet-record-images', 'pet-record-images', true)
on conflict (id) do nothing;

create policy "staff can upload pet record images"
  on storage.objects for insert
  with check (
    bucket_id = 'pet-record-images'
    and auth.role() = 'authenticated'
  );

create policy "anyone can view pet record images"
  on storage.objects for select
  using (bucket_id = 'pet-record-images');
