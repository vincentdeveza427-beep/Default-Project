-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Stores app users. Passwords are bcrypt hashes (never plaintext).

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text default '',
  email text unique not null,
  hash text not null,
  created_at timestamptz default now()
);

-- Server uses the service_role key, which bypasses RLS,
-- so no RLS policies are needed for this simple setup.
alter table users disable row level security;
