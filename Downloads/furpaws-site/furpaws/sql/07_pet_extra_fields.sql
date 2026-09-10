-- Add sex, owner email, and owner address fields to pets

alter table pets add column if not exists sex text;
alter table pets add column if not exists owner_email text;
alter table pets add column if not exists owner_address text;
