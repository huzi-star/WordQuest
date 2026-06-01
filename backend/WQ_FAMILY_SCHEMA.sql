-- Run in Supabase SQL editor. Pro Max family child profiles.
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
