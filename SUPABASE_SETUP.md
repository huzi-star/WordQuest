# Supabase Setup for WordQuest

Total time: **~5 minutes**.

## 1. Create a Supabase project

1. Go to **https://supabase.com** and sign up (free tier is enough).
2. Click **New project**:
   - Name: `wordquest`
   - DB password: anything strong (you won't need it)
   - Region: closest to Pakistan (e.g. `Asia/Singapore`)
3. Wait ~2 min for the project to provision.

## 2. Get your URL + anon key

In the project dashboard:
- Left sidebar → **Project Settings** → **API**
- Copy two values:
  - **Project URL** — looks like `https://xxxxxx.supabase.co`
  - **Project API keys → anon public** — looks like `eyJhbGciOi...`

These two values are safe to ship in the client — Row-Level Security
protects the rows.

## 3. Run the schema migration

Left sidebar → **SQL Editor** → **New query**, paste this and click **Run**:

```sql
-- Stats table per user
create table if not exists public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  high_score integer default 0,
  best_streak integer default 0,
  total_games integer default 0,
  total_rounds integer default 0,
  total_words integer default 0,
  total_time integer default 0,
  total_score integer default 0,
  perfect_rounds integer default 0,
  hints_used integer default 0,
  max_unlocked_level integer default 1,
  completed_levels jsonb default '[]'::jsonb,
  category_stats jsonb default '{}'::jsonb,
  recent_scores jsonb default '[]'::jsonb,
  active_days jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Row Level Security
alter table public.user_stats enable row level security;

-- Each user can read + write only their own row
create policy "users read own stats"
  on public.user_stats for select
  using (auth.uid() = user_id);

create policy "users insert own stats"
  on public.user_stats for insert
  with check (auth.uid() = user_id);

create policy "users update own stats"
  on public.user_stats for update
  using (auth.uid() = user_id);
```

## 4. Plug the credentials into the app

Open `mobile/src/utils/supabase.js` and replace the two placeholders:

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
```

with your actual values.

## 5. Disable email confirmation (optional — easier testing)

Project Settings → **Authentication** → **Providers → Email**:
- Toggle off **"Confirm email"** so users can sign up + use immediately
  without clicking a verification link.

If you keep email confirmation ON, users sign up successfully but stats
won't sync until they click the verification link in their inbox.

## 6. Verify

After step 4, rebuild + install the APK. On first launch you'll get the
onboarding. Open **Settings → Account → Login or Sign up** and try:

- **Sign up** with any email + password (min 6 chars).
- Play a round → finish → check Supabase **Table Editor → user_stats**
  — your row should appear with all the synced stats.
- Sign out → sign back in on another device → stats restore.

## Notes

- **Anon key is public-safe.** RLS policies ensure each user only
  touches their own row.
- **Email + password only** for now. Social providers (Google/GitHub)
  can be added later from Supabase dashboard if needed.
- The app continues to work fully offline / without an account —
  stats just stay local until you sign in.
- On every round-complete, the client calls `syncUp()` automatically.
- On login, the client calls `syncDown()` and merges with local stats
  (cloud wins for higher numbers, local wins for ties).
