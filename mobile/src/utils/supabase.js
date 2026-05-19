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
    },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('user_stats')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) console.warn('upsertStats error:', error.message);
}

export async function deleteUserStats(userId) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('user_stats').delete().eq('user_id', userId);
  if (error) console.warn('deleteUserStats error:', error.message);
}
