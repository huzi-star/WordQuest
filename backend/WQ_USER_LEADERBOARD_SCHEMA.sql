-- WordQuest · Public per-tier leaderboard table.
-- Mobile clients PUT their entry via the backend on login + after each
-- score-changing event. Backend reads from this table directly to power the
-- TierLeaderboardScreen — no dependency on user_stats RLS.

create table if not exists public.wq_user_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text default '#7c3aed',
  total_score integer not null default 0,
  high_score integer not null default 0,
  total_games integer not null default 0,
  tier text not null default 'bronze',
  updated_at timestamptz not null default now()
);
create index if not exists wq_user_lb_tier_score_idx on public.wq_user_leaderboard (tier, total_score desc);
create index if not exists wq_user_lb_score_idx on public.wq_user_leaderboard (total_score desc);

alter table public.wq_user_leaderboard enable row level security;
drop policy if exists wq_user_lb_anon on public.wq_user_leaderboard;
create policy wq_user_lb_anon on public.wq_user_leaderboard for all using (true) with check (true);
