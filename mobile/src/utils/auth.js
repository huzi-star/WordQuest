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
      // Lock state (Daily Challenge + Quiz cooldown) lives inside the
      // remote preferences JSONB. Prefer the newer (max) timestamp so the
      // cooldown can never be bypassed by signing out + back in.
      dailyChallengeLastAttemptAt: Math.max(
        Number(remote.preferences?.dailyChallengeLastAttemptAt) || 0,
        Number(localCurrent.dailyChallengeLastAttemptAt) || 0,
      ),
      quizLastAttemptAt: Math.max(
        Number(remote.preferences?.quizLastAttemptAt) || 0,
        Number(localCurrent.quizLastAttemptAt) || 0,
      ),
      // Onboarding flag — once true on the server, never re-show.
      hasSeenOnboarding: !!(
        remote.preferences?.hasSeenOnboarding || localCurrent.hasSeenOnboarding
      ),
      // Last tier celebrated — take whichever side has the HIGHER rank so
      // the TierUp screen can't re-trigger by signing in/out or syncing
      // from a stale cloud snapshot.
      lastSeenTier: (() => {
        // eslint-disable-next-line global-require
        const { TIERS } = require('./tiers');
        const rank = (k) => (TIERS.find((t) => t.key === k)?.rank || 1);
        const r = remote.preferences?.lastSeenTier || 'bronze';
        const l = localCurrent.lastSeenTier || 'bronze';
        return rank(r) >= rank(l) ? r : l;
      })(),
      // Practice Mode (unranked) — pulled from preferences blob. Keep
      // the higher value between local and remote so progress isn't lost.
      practiceHighScore: Math.max(
        Number(remote.preferences?.practiceHighScore) || 0,
        Number(localCurrent.practiceHighScore) || 0,
      ),
      practiceRoundsPlayed: Math.max(
        Number(remote.preferences?.practiceRoundsPlayed) || 0,
        Number(localCurrent.practiceRoundsPlayed) || 0,
      ),
      practiceRoundsWon: Math.max(
        Number(remote.preferences?.practiceRoundsWon) || 0,
        Number(localCurrent.practiceRoundsWon) || 0,
      ),
      practiceCurrentDifficulty:
        remote.preferences?.practiceCurrentDifficulty ||
        localCurrent.practiceCurrentDifficulty || 'easy',
      // Level retry word cache — local-only.
      levelWordCache: localCurrent.levelWordCache || {},
      // Per-level high scores: merge remote with local, taking the max
      // for each level so neither device wipes the other's record.
      levelHighScores: (() => {
        const remoteMap = (remote.preferences && remote.preferences.levelHighScores) || {};
        const localMap = localCurrent.levelHighScores || {};
        const merged = { ...remoteMap };
        for (const k of Object.keys(localMap)) {
          merged[k] = Math.max(Number(merged[k]) || 0, Number(localMap[k]) || 0);
        }
        return merged;
      })(),
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
    // Surface a display name + stable avatar color to the leaderboard.
    const displayName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      (user.email ? user.email.split('@')[0] : 'Player');
    const palette = ['#7c3aed', '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#06b6d4', '#facc15', '#a855f7'];
    let h = 0; for (let i = 0; i < user.id.length; i++) h = (h * 31 + user.id.charCodeAt(i)) >>> 0;
    // Player can override their auto-color via the Avatar screen.
    const avatarColor = settings.avatarColor || palette[h % palette.length];
    const avatarUrl = settings.avatarUrl || null;
    const avatarEmoji = settings.avatarEmoji || null;
    await upsertStats(user.id, local, { ...settings, displayName, avatarColor, avatarUrl, avatarEmoji });
    // Also push to the public leaderboard table (different RLS — anon can read).
    try {
      const { leaderboardUpsert } = require('./api');
      await leaderboardUpsert({
        userId: user.id,
        displayName,
        avatarColor,
        avatarUrl,
        avatarEmoji,
        totalScore: local.totalScoreEver || 0,
        highScore: local.highScore || 0,
        totalGames: local.totalGamesPlayed || 0,
      });
    } catch (_) {}
  }

  // After user IDENTITY changes (login / switch), pull cloud snapshot.
  // We use a ref so settings-driven re-renders don't accidentally retrigger
  // a syncDown that would wipe local-only state like lastAdaptiveStats.
  const lastSyncedUserId = useRef(null);
  useEffect(() => {
    if (user && user.id !== lastSyncedUserId.current) {
      lastSyncedUserId.current = user.id;
      (async () => {
        await syncDown();
        // Guarantee the player has a user_stats row right after login so they
        // show up in the Bronze leaderboard immediately (with displayName +
        // avatarColor), even before they've changed any setting.
        await syncUp();
      })();
    } else if (!user) {
      lastSyncedUserId.current = null;
    }
  }, [user]);

  // Whenever the user changes a setting, push to cloud (best-effort).
  useEffect(() => {
    if (user) syncUp();
  }, [settings.theme, settings.language, settings.sound, settings.vibration,
      settings.avatarEmoji, settings.avatarColor, settings.avatarBorder, settings.avatarUrl]);

  return (
    <AuthContext.Provider value={{ user, ready, configured: supabaseConfigured, syncDown, syncUp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
