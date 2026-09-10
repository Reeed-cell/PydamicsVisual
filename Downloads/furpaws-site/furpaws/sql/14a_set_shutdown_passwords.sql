-- Run this AFTER 14_manual_shutdown_functions.sql.
-- Sets the three shutdown passwords. Each is hashed with bcrypt
-- before storage — the plaintext is never saved in the table itself,
-- only in this one-time command you're about to run.

update shutdown_config
set
  site_password_hash = crypt('raijan2013', gen_salt('bf')),
  staff_password_hash = crypt('hello@*&24@Jah', gen_salt('bf')),
  account_password_hash = crypt('BanningStaff@Hhoa%#9083', gen_salt('bf'))
where id = 1;
