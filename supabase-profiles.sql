-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Stores each student's avatar and the "hide me from leaderboards" choice.
-- (Without Supabase, the server falls back to profiles.json automatically.)

create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  kind text,                       -- null = default avatar, 'emoji' or 'img'
  emoji text,
  color text,
  img text,                        -- small JPEG as a data URL (about 10 KB)
  hide boolean not null default false,
  updated_at timestamptz default now()
);

-- Same as the other tables: the server uses the service_role key, which bypasses RLS.
alter table profiles disable row level security;
