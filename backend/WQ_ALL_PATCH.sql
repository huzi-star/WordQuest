-- ============================================================================
-- One-shot patch — run this in Supabase SQL editor to set up everything
-- the new pricing + Pro Max + avatar features need.
-- Safe to re-run.
-- ============================================================================

-- 1) Subscriptions
CREATE TABLE IF NOT EXISTS wq_subscriptions (
  user_id UUID PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','pro_max')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','trial','expired','cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  trial_used BOOLEAN DEFAULT FALSE,
  family_member_ids UUID[] DEFAULT '{}',
  provider TEXT,
  provider_token TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wq_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_read_own ON wq_subscriptions;
DROP POLICY IF EXISTS sub_anon_read ON wq_subscriptions;
DROP POLICY IF EXISTS sub_anon_all  ON wq_subscriptions;
CREATE POLICY sub_anon_all ON wq_subscriptions FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 2) Daily usage counters
CREATE TABLE IF NOT EXISTS wq_daily_usage (
  user_id UUID,
  day DATE,
  quick_play_count INT DEFAULT 0,
  quiz_count INT DEFAULT 0,
  daily_challenge_count INT DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE wq_daily_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS du_anon_all ON wq_daily_usage;
CREATE POLICY du_anon_all ON wq_daily_usage FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3) Family profiles (Pro Max)
CREATE TABLE IF NOT EXISTS wq_family_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL,
  name TEXT NOT NULL,
  age INT DEFAULT 10,
  avatar_color TEXT DEFAULT '#7c3aed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wq_family_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fam_anon ON wq_family_profiles;
CREATE POLICY fam_anon ON wq_family_profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_fam_parent ON wq_family_profiles(parent_id);

-- 4) Backend read access — Parent Dashboard reads stats with the anon key,
--    so allow anon to SELECT from existing stats tables. Writes still go
--    through the authenticated user (RLS unchanged for INSERT/UPDATE).
DROP POLICY IF EXISTS stats_anon_read ON user_stats;
CREATE POLICY stats_anon_read ON user_stats FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS ranking_anon_read ON wq_player_ranking;
CREATE POLICY ranking_anon_read ON wq_player_ranking FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS learn_anon_read ON wq_learn_progress;
CREATE POLICY learn_anon_read ON wq_learn_progress FOR SELECT TO anon USING (true);

-- 5) Avatar columns + storage bucket
ALTER TABLE wq_user_leaderboard ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE wq_user_leaderboard ADD COLUMN IF NOT EXISTS avatar_emoji TEXT;
ALTER TABLE wq_user_leaderboard ADD COLUMN IF NOT EXISTS avatar_color TEXT;

-- Create the public `avatars` bucket. If it already exists with a different
-- public flag, force it public so getPublicUrl() works.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Wide-open storage policies for the avatars bucket so anon + authed clients
-- can upload, read, update, and delete their own avatar files.
DROP POLICY IF EXISTS avatars_anon_all     ON storage.objects;
DROP POLICY IF EXISTS avatars_anon_read    ON storage.objects;
DROP POLICY IF EXISTS avatars_anon_insert  ON storage.objects;
DROP POLICY IF EXISTS avatars_anon_update  ON storage.objects;
DROP POLICY IF EXISTS avatars_anon_delete  ON storage.objects;
DROP POLICY IF EXISTS avatars_authed_all   ON storage.objects;

CREATE POLICY avatars_anon_read   ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY avatars_anon_insert ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'avatars');
CREATE POLICY avatars_anon_update ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');
CREATE POLICY avatars_anon_delete ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'avatars');
