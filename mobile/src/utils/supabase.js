// Supabase client + auth + stats sync helpers.
//
// SETUP (one-time):
//   1. Create a project at https://supabase.com
//   2. Project settings → API → copy `Project URL` and `anon public` key
//   3. Paste them below (anon key is safe to ship — RLS policies protect rows)
//   4. In Supabase SQL Editor, run the migration from SUPABASE_SETUP.md
//
// Replace these placeholders with your real values:

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://epjndqbazobrfhovhpza.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';

export const supabaseConfigured =
  SUPABASE_URL && SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-PROJECT');

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// ---------- Auth ----------

export async function signUp({ email, password, displayName }) {
  if (!supabase) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: error.message };
  return { user: data.user };
}

export async function signIn({ email, password }) {
  if (!supabase) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { user: data.user };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export function onAuthChange(cb) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user || null);
  });
  return data.subscription;
}

// ---------- Stats sync ----------
// Table: user_stats (see SUPABASE_SETUP.md)

export async function fetchStats(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('fetchStats error:', error.message);
    return null;
  }
  return data;
}

export async function upsertStats(userId, stats, prefs = {}) {
  if (!supabase || !userId) return;
  const payload = {
    user_id: userId,
    high_score: stats.highScore || 0,
    best_streak: stats.bestStreak || 0,
    total_games: stats.totalGamesPlayed || 0,
    total_rounds: stats.totalRoundsPlayed || 0,
    total_words: stats.totalWordsFound || 0,
    total_time: stats.totalTimeSpent || 0,
    total_score: stats.totalScoreEver || 0,
    perfect_rounds: stats.perfectRounds || 0,
    hints_used: stats.hintsUsed || 0,
    max_unlocked_level: stats.maxUnlockedLevel || 1,
    completed_levels: stats.completedLevels || [],
    category_stats: stats.categoryStats || {},
    recent_scores: stats.recentScores || [],
    active_days: stats.activeDays || {},
    preferences: {
      theme: prefs.theme || 'green',
      language: prefs.language || 'english',
      sound: prefs.sound !== false,
      vibration: prefs.vibration !== false,
      // Lock-state timestamps + onboarding flag — stored inside the JSONB
      // preferences blob so no SQL migration is required. Prevents users
      // from bypassing daily/quiz cooldowns by signing out and back in.
      dailyChallengeLastAttemptAt: Number(stats.dailyChallengeLastAttemptAt) || 0,
      quizLastAttemptAt: Number(stats.quizLastAttemptAt) || 0,
      hasSeenOnboarding: !!stats.hasSeenOnboarding,
      dob: prefs.dob || null,
      displayName: prefs.displayName || null,
      avatarColor: prefs.avatarColor || null,
      // Per-level high scores — synced so the player keeps their bests
      // across devices and logins.
      levelHighScores: stats.levelHighScores || {},
      // Last tier the player has been celebrated for — must persist across
      // devices, or the TierUp screen would re-trigger every time stats
      // sync down from Supabase.
      lastSeenTier: stats.lastSeenTier || 'bronze',
      // Practice Mode (unranked) — kept inside the JSONB preferences blob
      // so it can sync across devices without a schema migration. Tier
      // points / leaderboard rank are never touched by these values.
      practiceHighScore: Number(stats.practiceHighScore) || 0,
      practiceRoundsPlayed: Number(stats.practiceRoundsPlayed) || 0,
      practiceRoundsWon: Number(stats.practiceRoundsWon) || 0,
      practiceCurrentDifficulty: stats.practiceCurrentDifficulty || 'easy',
    },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('user_stats')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) console.warn('upsertStats error:', error.message);
}

// Change password — verifies the current password by re-signing in, then
// updates to the new password. Both checks talk to the live Supabase auth
// backend so the change persists on the server immediately.
export async function changePassword({ email, currentPassword, newPassword }) {
  if (!supabase) return { error: 'Supabase not configured' };
  if (!email || !currentPassword || !newPassword) {
    return { error: 'All password fields are required.' };
  }
  // 1. Verify the current password by attempting a sign-in.
  const verify = await supabase.auth.signInWithPassword({
    email, password: currentPassword,
  });
  if (verify.error) {
    return { error: 'Current password is incorrect.' };
  }
  // 2. Update to the new password.
  const update = await supabase.auth.updateUser({ password: newPassword });
  if (update.error) return { error: update.error.message };
  return { ok: true };
}

export async function deleteUserStats(userId) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('user_stats').delete().eq('user_id', userId);
  if (error) console.warn('deleteUserStats error:', error.message);
}

// Pro Max avatar upload — uploads a photo to the `avatars` bucket and
// returns the public URL.
//
// Uses fetch(uri).arrayBuffer() so we don't depend on expo-file-system
// (whose readAsStringAsync was deprecated in SDK 54). ArrayBuffer is the
// payload type @supabase/storage-js v2 accepts directly in React Native —
// blob() on Android can come back zero-byte, while arrayBuffer carries the
// real image bytes from local file:// URIs.
export async function uploadAvatarPhoto(userId, fileUri) {
  if (!supabase) return { ok: false, error: 'Supabase client not configured.' };
  if (!userId)   return { ok: false, error: 'You must be logged in to upload a photo.' };
  if (!fileUri)  return { ok: false, error: 'No image selected.' };
  try {
    const ext = (fileUri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    // Stable filename per user — `upsert: true` overwrites the previous one,
    // so the player only ever has one avatar file in the bucket.
    const path = `${userId}/avatar.${ext}`;

    const res = await fetch(fileUri);
    if (!res.ok) return { ok: false, error: `Could not read selected file (${res.status}).` };

    // Prefer arrayBuffer (RN-safe). Fall back to blob if arrayBuffer is
    // unavailable on older runtimes.
    let body;
    if (typeof res.arrayBuffer === 'function') {
      body = await res.arrayBuffer();
    } else {
      body = await res.blob();
    }

    const { error } = await supabase.storage.from('avatars').upload(path, body, {
      contentType, upsert: true,
    });
    if (error) {
      console.warn('avatar upload error:', error.message);
      return { ok: false, error: error.message || 'Storage upload failed.' };
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    if (!pub?.publicUrl) return { ok: false, error: 'Uploaded but could not get public URL.' };
    // Cache-bust the URL so the new photo replaces the cached old one
    // immediately in the preview / home / leaderboard.
    return { ok: true, publicUrl: `${pub.publicUrl}?v=${Date.now()}` };
  } catch (err) {
    console.warn('avatar upload exception:', err?.message);
    return { ok: false, error: err?.message || 'Unknown upload error.' };
  }
}
