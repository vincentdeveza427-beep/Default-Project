-- Science Drills: full database setup.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again (everything is "if not exists").
-- Also run supabase-profiles.sql (avatars + "hide me from leaderboards").
--
-- Security model: the Node server uses the service_role key, which bypasses Row Level Security.
-- RLS is ENABLED on every table with NO policies, so the public anon key can read and write nothing.
-- Never put the service_role key in browser code.

-- ---------------------------------------------------------------- users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null,
  hash text not null,                       -- bcrypt hash, never plaintext
  role text not null default 'student',     -- 'admin' also works; ADMIN_EMAILS in the server env is the usual way
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness. The server's findByName / findByEmail use ilike, so the database must agree.
-- The index NAME matters: server.js looks for "users_name_lower_idx" to say "username taken" vs "email taken".
create unique index if not exists users_name_lower_idx  on users (lower(name)) where name <> '';
create unique index if not exists users_email_lower_idx on users (lower(email));

-- ---------------------------------------------------------------- activity
-- One row per timed-exam attempt, and one row per user + set + day for flashcard study.
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  mode text not null check (mode in ('exam', 'flashcards')),
  set_letter text not null check (set_letter ~ '^[A-Z]$'),
  day date not null,                        -- the student's local date, sent by the browser
  score integer not null default 0,         -- exam: correct answers; flashcards: cards learned so far
  total integer not null check (total > 0),
  unanswered integer not null default 0,
  duration_sec integer,                     -- exams only
  reviews integer not null default 0,
  again integer not null default 0,
  hard integer not null default 0,
  good integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activity_user_created_idx on activity (user_id, created_at);
create index if not exists activity_created_idx      on activity (created_at, id);
-- Server code does "find the row, then update it" for flashcards; this makes duplicates impossible even if two requests race.
create unique index if not exists activity_flash_per_day_idx
  on activity (user_id, set_letter, day) where mode = 'flashcards';

-- ---------------------------------------------------------------- flashcard + practice progress
create table if not exists flashcard_state (
  user_id uuid not null references users(id) on delete cascade,
  set_letter text not null check (set_letter ~ '^[A-Z]$'),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, set_letter)         -- required by upsert(... onConflict: 'user_id,set_letter')
);

create table if not exists practice_state (
  user_id uuid not null references users(id) on delete cascade,
  set_letter text not null check (set_letter ~ '^[A-Z]$'),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, set_letter)
);

-- ---------------------------------------------------------------- password reset codes
create table if not exists password_resets (
  user_id uuid primary key references users(id) on delete cascade,   -- one active code per user
  code_hash text not null,                  -- HMAC of the 6-digit code, never the code itself
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Row Level Security: on, no policies
alter table users           enable row level security;
alter table activity        enable row level security;
alter table flashcard_state enable row level security;
alter table practice_state  enable row level security;
alter table password_resets enable row level security;
