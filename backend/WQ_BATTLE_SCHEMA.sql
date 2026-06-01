-- WordQuest · 1v1 Battle + MMR + Season schema.
-- Run once in Supabase SQL editor.

-- Match queue: players waiting to be matched. A row is deleted once the
-- player either joins a match or cancels.
create table if not exists public.wq_match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null,
  mmr integer not null default 1000,
  display_name text,
  avatar_color text,
  joined_at timestamptz not null default now()
);
create index if not exists wq_match_queue_tier_mmr_idx on public.wq_match_queue (tier, mmr);

-- Matches: one row per 1v1 battle.
create table if not exists public.wq_matches (
  id bigserial primary key,
  tier text not null,
  status text not null check (status in ('active','done','cancelled')) default 'active',
  player_a uuid not null references auth.users(id) on delete cascade,
  player_b uuid not null references auth.users(id) on delete cascade,
  display_a text, display_b text,
  avatar_a text, avatar_b text,
  mmr_a integer, mmr_b integer,
  category text, words jsonb, grid jsonb, word_positions jsonb,
  duration_sec integer not null default 60,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result jsonb, -- {winner, a:{words,score}, b:{words,score}, mmrDelta:{a,b}}
  score_a integer default 0, score_b integer default 0,
  words_a integer default 0, words_b integer default 0,
  finished_a boolean default false, finished_b boolean default false
);
create index if not exists wq_matches_status_idx on public.wq_matches (status, started_at desc);

-- MMR + W/L per player. Single row per user, upserted.
create table if not exists public.wq_player_ranking (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mmr integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  current_streak integer not null default 0, -- positive = win streak, negative = loss streak
  best_win_streak integer not null default 0,
  worst_loss_streak integer not null default 0,
  total_matches integer not null default 0,
  last_match_at timestamptz,
  season_id text
);

-- Friends list (mutual once both directions exist; in v1 keep simple unidirectional).
create table if not exists public.wq_friends (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

-- RLS — open for anon (the backend uses the anon key + enforces ownership at the API layer).
alter table public.wq_match_queue       enable row level security;
alter table public.wq_matches           enable row level security;
alter table public.wq_player_ranking    enable row level security;
alter table public.wq_friends           enable row level security;

drop policy if exists wq_match_queue_anon on public.wq_match_queue;
create policy wq_match_queue_anon on public.wq_match_queue for all using (true) with check (true);

drop policy if exists wq_matches_anon on public.wq_matches;
create policy wq_matches_anon on public.wq_matches for all using (true) with check (true);

drop policy if exists wq_player_ranking_anon on public.wq_player_ranking;
create policy wq_player_ranking_anon on public.wq_player_ranking for all using (true) with check (true);

drop policy if exists wq_friends_anon on public.wq_friends;
create policy wq_friends_anon on public.wq_friends for all using (true) with check (true);
