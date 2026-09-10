-- Run this FIRST, before 14_manual_shutdown_functions.sql.
-- Enables the pgcrypto extension, needed for password hashing.
create extension if not exists pgcrypto;
