-- Run in Supabase SQL editor.
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

-- Anyone signed in can read their own row; service role writes.
DROP POLICY IF EXISTS sub_read_own ON wq_subscriptions;
CREATE POLICY sub_read_own ON wq_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sub_anon_read ON wq_subscriptions;
CREATE POLICY sub_anon_read ON wq_subscriptions FOR SELECT TO anon
  USING (true);

-- Daily Quick Play counter (server-tracked so phone reset can't bypass).
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
