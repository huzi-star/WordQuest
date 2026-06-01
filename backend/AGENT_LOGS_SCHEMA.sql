-- WordQuest · Agent observability schema
-- Run this once in Supabase SQL editor.

create table if not exists public.agent_logs (
  id bigserial primary key,
  trace_id text unique,
  agent text not null,
  model text,
  status text not null check (status in ('ok','error','running')),
  duration_ms integer default 0,
  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  total_tokens integer default 0,
  prompt text,
  response text,
  error text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_logs_created_at_idx on public.agent_logs (created_at desc);
create index if not exists agent_logs_agent_idx on public.agent_logs (agent);
create index if not exists agent_logs_status_idx on public.agent_logs (status);

alter table public.agent_logs enable row level security;

-- The dashboard is a private dev tool; allow anon to read + insert + delete.
-- Tighten in production if you ship this externally.
drop policy if exists "agent_logs_anon_all" on public.agent_logs;
create policy "agent_logs_anon_all" on public.agent_logs
  for all using (true) with check (true);
