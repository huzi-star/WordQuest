import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigured, onAuthChange, getCurrentUser, fetchStats, upsertStats } from './supabase';
import { loadStats, replaceStats, setStatsUserScope } from './storage';
import { setSettingsUserScope, useSettings } from './settings';

const AuthContext = createContext({
  user: null,
  ready: false,
  configured: false,
  syncDown: async () => {},
  syncUp: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const { settings, refresh: refreshSettings, applyServer } = useSettings();

  useEffect(() => {
    if (!supabaseConfigured) {
      // Guest mode — bind everything to the '_guest' scope.
      setStatsUserScope(null);
      setSettingsUserScope(null);
      setReady(true);
      return undefined;
    }
    let mounted = true;
    (async () => {
      const u = await getCurrentUser();
      if (!mounted) return;
      const uid = u?.id || null;
      setStatsUserScope(uid);
      setSettingsUserScope(uid);
      await refreshSettings();
      setUser(u);
      setReady(true);
    })();
    const sub = onAuthChange(async (u) => {
      if (!mounted) return;
      const uid = u?.id || null;
      setStatsUserScope(uid);
      setSettingsUserScope(uid);
      // Reload settings from the new namespace BEFORE swapping user
      // state so consumers immediately see the right theme/language.
      await refreshSettings();
      setUser(u);
    });
    return () => {
      mounted = false;
      sub?.unsubscribe?.();
    };
  }, []);

  async function syncDown() {
    if (!user) return null;
    const remote = await fetchStats(user.id);
    if (!remote) return null;

    // Build the new local snapshot directly from the cloud row — do NOT
    // merge with whatever was sitting in AsyncStorage, otherwise a previous
    // account's numbers could leak in.
    const snapshot = {
      highScore: remote.high_score || 0,
      bestStreak: remote.best_streak || 0,
      totalGamesPlayed: remote.total_games || 0,
      totalRoundsPlayed: remote.total_rounds || 0,
      totalWordsFound: remote.total_words || 0,
      totalTimeSpent: remote.total_time || 0,
      totalScoreEver: remote.total_score || 0,
      perfectRounds: remote.perfect_rounds || 0,
      hintsUsed: remote.hints_used || 0,
      maxUnlockedLevel: remote.max_unlocked_level || 1,
      completedLevels: remote.completed_levels || [],
      categoryStats: remote.category_stats || {},
      recentScores: remote.recent_scores || [],
      activeDays: remote.active_days || {},
    };
    await replaceStats(snapshot);

    // Apply server-saved preferences (theme / language / sound / vibration).
    if (remote.preferences && typeof remote.preferences === 'object') {
      await applyServer(remote.preferences);
    }
    return snapshot;
  }

  async function syncUp() {
    if (!user) return;
    const local = await loadStats();
    await upsertStats(user.id, local, settings);
  }

  // After user signs in, pull cloud snapshot into local storage.
  useEffect(() => { if (user) { syncDown(); } }, [user]);

  // Whenever the user changes a setting, push to cloud (best-effort).
  useEffect(() => {
    if (user) syncUp();
  }, [settings.theme, settings.language, settings.sound, settings.vibration]);

  return (
    <AuthContext.Provider value={{ user, ready, configured: supabaseConfigured, syncDown, syncUp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
