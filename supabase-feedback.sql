-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Stores messages from the homepage "Send feedback" box. Run supabase.sql first (this references users).

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,   -- keep the message even if the student account is deleted
  category text not null default 'other' check (category in ('question', 'bug', 'suggestion', 'other')),
  message text not null check (char_length(message) between 3 and 2000),
  status text not null default 'new' check (status in ('new', 'read', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on feedback (created_at desc, id);

-- Same model as the other tables: RLS on, no policies. Only the server (service key) can touch it.
alter table feedback enable row level security;
