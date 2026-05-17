import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigured, onAuthChange, getCurrentUser, fetchStats, upsertStats } from './supabase';
import { loadStats, saveStats } from './storage';

const AuthContext = createContext({
  user: null,
  ready: false,
  configured: false,
  refresh: async () => {},
  syncDown: async () => {},
  syncUp: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return undefined;
    }
    let mounted = true;
    (async () => {
      const u = await getCurrentUser();
      if (mounted) {
        setUser(u);
        setReady(true);
      }
    })();
    const sub = onAuthChange((u) => { if (mounted) setUser(u); });
    return () => {
      mounted = false;
      sub?.unsubscribe?.();
    };
  }, []);

  // Pull cloud stats into local storage.
  async function syncDown() {
    if (!user) return null;
    const remote = await fetchStats(user.id);
    if (!remote) return null;
    const local = await loadStats();
    // Cloud wins where it has higher numbers, otherwise keep local.
    const merged = {
      ...local,
      highScore: Math.max(local.highScore || 0, remote.high_score || 0),
      bestStreak: Math.max(local.bestStreak || 0, remote.best_streak || 0),
      totalGamesPlayed: Math.max(local.totalGamesPlayed || 0, remote.total_games || 0),
      totalRoundsPlayed: Math.max(local.totalRoundsPlayed || 0, remote.total_rounds || 0),
      totalWordsFound: Math.max(local.totalWordsFound || 0, remote.total_words || 0),
      totalTimeSpent: Math.max(local.totalTimeSpent || 0, remote.total_time || 0),
      totalScoreEver: Math.max(local.totalScoreEver || 0, remote.total_score || 0),
      perfectRounds: Math.max(local.perfectRounds || 0, remote.perfect_rounds || 0),
      hintsUsed: Math.max(local.hintsUsed || 0, remote.hints_used || 0),
      maxUnlockedLevel: Math.max(local.maxUnlockedLevel || 1, remote.max_unlocked_level || 1),
      completedLevels: Array.from(new Set([...(local.completedLevels || []), ...(remote.completed_levels || [])])),
      categoryStats: { ...(local.categoryStats || {}), ...(remote.category_stats || {}) },
      recentScores: (remote.recent_scores && remote.recent_scores.length >= (local.recentScores || []).length)
        ? remote.recent_scores
        : (local.recentScores || []),
      activeDays: { ...(local.activeDays || {}), ...(remote.active_days || {}) },
    };
    await saveStats(merged);
    return merged;
  }

  // Push local stats up to cloud.
  async function syncUp() {
    if (!user) return;
    const local = await loadStats();
    await upsertStats(user.id, local);
  }

  // After login, perform initial sync.
  useEffect(() => {
    if (user) { syncDown(); }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, ready, configured: supabaseConfigured, syncDown, syncUp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
