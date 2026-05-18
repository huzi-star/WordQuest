import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

    // Preserve device-local fields (adaptive resume + quiz dedupe history)
    // — these are not stored in Supabase and would be lost if we wiped them.
    const localCurrent = await loadStats();

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
      // Local-only:
      lastAdaptiveStats: localCurrent.lastAdaptiveStats || null,
      recentQuizTopics: localCurrent.recentQuizTopics || [],
      recentQuizQuestions: localCurrent.recentQuizQuestions || [],
    };
    await replaceStats(snapshot);

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

  // After user IDENTITY changes (login / switch), pull cloud snapshot.
  // We use a ref so settings-driven re-renders don't accidentally retrigger
  // a syncDown that would wipe local-only state like lastAdaptiveStats.
  const lastSyncedUserId = useRef(null);
  useEffect(() => {
    if (user && user.id !== lastSyncedUserId.current) {
      lastSyncedUserId.current = user.id;
      syncDown();
    } else if (!user) {
      lastSyncedUserId.current = null;
    }
  }, [user]);

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
