-- WordQuest Learning Academy — progress + lesson cache.
-- Run once in Supabase SQL editor.

-- Per-user learning progress.
create table if not exists public.wq_learn_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_unit_id integer not null default 1,
  completed_units integer[] not null default '{}',
  total_xp integer not null default 0,
  last_lesson_at timestamptz,
  weak_concepts text[] not null default '{}',
  -- Per-unit memory: { "1": { last10:[{lessonType,words,passed,...}], lastDifficulty }, "2": {...} }.
  -- Powers per-user adaptive difficulty (hidden from frontend) and no-repeat
  -- vocabulary for Continue Learning. Each unit is independent.
  unit_memory jsonb not null default '{}'::jsonb
);

-- Migration for existing deployments: add the column if it doesn't exist yet.
alter table public.wq_learn_progress
  add column if not exists unit_memory jsonb not null default '{}'::jsonb;

-- Per-lesson attempts (for adaptive review + parent reports).
create table if not exists public.wq_learn_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id integer not null,
  lesson_index integer not null,
  lesson_type text not null,
  correct boolean not null,
  response_time_ms integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists wq_learn_attempts_user_idx on public.wq_learn_attempts (user_id, created_at desc);

-- Generated lesson content cache (per unit + index + type). Same lesson
-- index 0..4 across all users yields the same payload from cache.
create table if not exists public.wq_learn_lesson_cache (
  id bigserial primary key,
  unit_id integer not null,
  lesson_index integer not null,
  lesson_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (unit_id, lesson_index, lesson_type)
);

alter table public.wq_learn_progress      enable row level security;
alter table public.wq_learn_attempts      enable row level security;
alter table public.wq_learn_lesson_cache  enable row level security;

drop policy if exists wq_learn_progress_anon on public.wq_learn_progress;
create policy wq_learn_progress_anon on public.wq_learn_progress for all using (true) with check (true);

drop policy if exists wq_learn_attempts_anon on public.wq_learn_attempts;
create policy wq_learn_attempts_anon on public.wq_learn_attempts for all using (true) with check (true);

drop policy if exists wq_learn_cache_anon on public.wq_learn_lesson_cache;
create policy wq_learn_cache_anon on public.wq_learn_lesson_cache for all using (true) with check (true);
