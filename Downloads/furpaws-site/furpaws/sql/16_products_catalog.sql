-- Replaces the old (barely-used) 'services' table with a real
-- products catalog: treatments, vitamins, and other items the
-- clinic sells. Same permission philosophy as services had — public
-- can view in-stock items, staff can view everything, only the
-- owner can add/edit.

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  description text,
  cost text,
  in_stock boolean not null default true,
  created_at timestamptz default now()
);
alter table products enable row level security;

create policy "anyone can view in-stock products"
  on products for select
  using (in_stock = true);

create policy "staff can view all products"
  on products for select
  using (auth.role() = 'authenticated');

create policy "owner can insert products"
  on products for insert
  with check (
    exists (select 1 from staff where staff.auth_user_id = auth.uid() and staff.role = 'owner')
  );

create policy "owner can update products"
  on products for update
  using (
    exists (select 1 from staff where staff.auth_user_id = auth.uid() and staff.role = 'owner')
  );

-- The old services table is no longer used anywhere in the site —
-- confirmed via a full grep of every JS/HTML file before writing
-- this. Safe to drop.
drop table if exists services;
