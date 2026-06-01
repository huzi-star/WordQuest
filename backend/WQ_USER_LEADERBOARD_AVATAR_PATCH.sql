-- Add avatar fields to existing wq_user_leaderboard table.
ALTER TABLE wq_user_leaderboard ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE wq_user_leaderboard ADD COLUMN IF NOT EXISTS avatar_emoji TEXT;

-- Avatars bucket for photo uploads (Storage tab in Supabase dashboard works too).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone signed in to upload their own avatar.
DROP POLICY IF EXISTS avatars_anon_all ON storage.objects;
CREATE POLICY avatars_anon_all ON storage.objects FOR ALL TO anon
  USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');
