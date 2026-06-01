-- WordQuest Kids — vocabulary tier game schema.
-- Run once in the Supabase SQL editor. All tables prefixed `wq_kids_`
-- so the existing word-search game tables stay untouched.

-- ---------- users (linked to Supabase auth.users) ----------
create table if not exists public.wq_kids_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text,
  avatar_color text default '#7c3aed',
  created_at timestamptz not null default now()
);

-- ---------- per-user progress ----------
create table if not exists public.wq_kids_progress (
  user_id uuid primary key references public.wq_kids_users(id) on delete cascade,
  current_tier text not null default 'bronze',
  total_xp integer not null default 0,
  tier_xp integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  words_learned_count integer not null default 0,
  last_played_at timestamptz
);

-- ---------- AI-generated word cards ----------
create table if not exists public.wq_kids_words_cache (
  id bigserial primary key,
  word text not null,
  tier text not null,
  meaning text not null,
  example text,
  synonym text,
  synonym_2 text,
  antonym text,
  antonym_2 text,
  usage_tip text,
  difficulty_score integer default 1,
  created_at timestamptz not null default now()
);
create index if not exists wq_kids_words_tier_idx on public.wq_kids_words_cache (tier, created_at desc);
create unique index if not exists wq_kids_words_unique_idx on public.wq_kids_words_cache (lower(word), tier);

-- ---------- per-answer log ----------
create table if not exists public.wq_kids_answers (
  id bigserial primary key,
  user_id uuid references public.wq_kids_users(id) on delete cascade,
  word_id bigint references public.wq_kids_words_cache(id) on delete set null,
  question_type text not null check (question_type in ('meaning','synonym','antonym','fillblank')),
  is_correct boolean not null,
  response_time_ms integer not null default 0,
  xp_earned integer not null default 0,
  tier text,
  created_at timestamptz not null default now()
);
create index if not exists wq_kids_answers_user_idx on public.wq_kids_answers (user_id, created_at desc);

-- ---------- tier promotion log ----------
create table if not exists public.wq_kids_tier_history (
  id bigserial primary key,
  user_id uuid references public.wq_kids_users(id) on delete cascade,
  from_tier text,
  to_tier text not null,
  promoted_at timestamptz not null default now()
);

-- ---------- leaderboard view ----------
create or replace view public.wq_kids_leaderboard as
  select
    u.id as user_id,
    u.username,
    u.avatar_color,
    p.current_tier,
    p.total_xp,
    p.tier_xp,
    p.current_streak,
    p.last_played_at,
    rank() over (partition by p.current_tier order by p.tier_xp desc, p.total_xp desc) as tier_rank
  from public.wq_kids_users u
  join public.wq_kids_progress p on p.user_id = u.id;

-- ---------- row-level security ----------
alter table public.wq_kids_users         enable row level security;
alter table public.wq_kids_progress      enable row level security;
alter table public.wq_kids_words_cache   enable row level security;
alter table public.wq_kids_answers       enable row level security;
alter table public.wq_kids_tier_history  enable row level security;

-- Open policies for anon (the backend uses anon key + ownership checks
-- on user_id at the API layer). Tighten later if needed.
drop policy if exists "wq_kids_users_all"   on public.wq_kids_users;
drop policy if exists "wq_kids_prog_all"    on public.wq_kids_progress;
drop policy if exists "wq_kids_words_all"   on public.wq_kids_words_cache;
drop policy if exists "wq_kids_ans_all"     on public.wq_kids_answers;
drop policy if exists "wq_kids_hist_all"    on public.wq_kids_tier_history;
create policy "wq_kids_users_all"  on public.wq_kids_users        for all using (true) with check (true);
create policy "wq_kids_prog_all"   on public.wq_kids_progress     for all using (true) with check (true);
create policy "wq_kids_words_all"  on public.wq_kids_words_cache  for all using (true) with check (true);
create policy "wq_kids_ans_all"    on public.wq_kids_answers      for all using (true) with check (true);
create policy "wq_kids_hist_all"   on public.wq_kids_tier_history for all using (true) with check (true);
