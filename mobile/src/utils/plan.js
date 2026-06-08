import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchPlan, fetchUsage, bumpUsage } from './api';
import { useAuth } from './auth';

// Single source of truth for hints per game (Quick Play + Daily Challenge).
// Backend subscriptionApi.js mirrors these EXACT values. If you change one,
// update the other or hints will desync.
export const HINT_LIMITS = { free: 1, pro: 3, pro_max: 4 };

// Single source of truth for Pro Max AI Tutor daily cap. Easy to tune.
export const AI_TUTOR_DAILY_CAP = 30;

export const FEATURES = {
  free: {
    qpPerDay: 5, quizPerDay: 3, dailyPerDay: 1,
    maxLevel: 5, maxUnit: 8,
    battle: false, ads: true, hints: HINT_LIMITS.free,
    tts: false, allCategories: false,
  },
  pro: {
    qpPerDay: -1, quizPerDay: -1, dailyPerDay: 1,
    maxLevel: 15, maxUnit: 24,
    battle: true, ads: false, hints: HINT_LIMITS.pro,
    tts: true, allCategories: true,
  },
  pro_max: {
    qpPerDay: -1, quizPerDay: -1, dailyPerDay: 1,
    maxLevel: 15, maxUnit: 32,
    battle: true, ads: false, hints: HINT_LIMITS.pro_max,
    tts: true, allCategories: true,
    aiTutor: true, customAvatars: true, parentDashboard: true, offline: true,
    aiTutorPerDay: 30,
  },
};

// Resolve the hint count for a player's current tier. Unknown / missing
// tier defaults to FREE (1 hint) — NEVER 99.
export function hintsFor(plan) {
  const key = plan === 'pro' || plan === 'pro_max' ? plan : 'free';
  return HINT_LIMITS[key];
}

const PlanContext = createContext({
  plan: 'free', status: 'active', trialUsed: false,
  features: FEATURES.free,
  usage: { quick_play: 0, quiz: 0, daily: 0 },
  refresh: async () => {},
  bump: async () => {},
});

export function PlanProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    plan: 'free', status: 'active', trialUsed: false, expiresAt: null,
    features: FEATURES.free,
    usage: { quick_play: 0, quiz: 0, daily: 0 },
  });

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setState((s) => ({ ...s, plan: 'free', features: FEATURES.free, usage: { quick_play: 0, quiz: 0, daily: 0 } }));
      return;
    }
    const [p, u] = await Promise.all([fetchPlan(user.id), fetchUsage(user.id)]);
    const planKey = p?.plan || 'free';
    // ALWAYS reconcile hint count against the local HINT_LIMITS — never
    // trust whatever the backend / a stale cached subscription row sent
    // (older deployments returned hints: 99 for Pro Max which crashed the
    // UI by showing "Hint (99)").
    const merged = {
      ...(p?.features || FEATURES[planKey] || FEATURES.free),
      hints: hintsFor(planKey),
    };
    setState({
      plan: planKey,
      status: p?.status || 'active',
      trialUsed: !!p?.trialUsed,
      expiresAt: p?.expiresAt || null,
      features: merged,
      usage: { quick_play: u?.quick_play || 0, quiz: u?.quiz || 0, daily: u?.daily || 0 },
    });
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const bump = useCallback(async (kind) => {
    if (!user?.id) return;
    await bumpUsage(user.id, kind);
    setState((s) => ({
      ...s,
      usage: { ...s.usage, [kind === 'quick_play' ? 'quick_play' : kind]: (s.usage[kind === 'quick_play' ? 'quick_play' : kind] || 0) + 1 },
    }));
  }, [user?.id]);

  return (
    <PlanContext.Provider value={{ ...state, refresh, bump }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() { return useContext(PlanContext); }

// True if the user can still do `kind` today, given their plan's daily cap.
export function canUseDaily(plan, usage, kind = 'quick_play') {
  const feat = FEATURES[plan] || FEATURES.free;
  const cap = kind === 'quiz' ? feat.quizPerDay : kind === 'daily' ? feat.dailyPerDay : feat.qpPerDay;
  if (cap < 0) return true; // unlimited
  const used = usage?.[kind] || 0;
  return used < cap;
}

// True if level/unit number is unlocked by current plan.
export function isLevelUnlocked(plan, levelNumber) {
  return levelNumber <= (FEATURES[plan]?.maxLevel || 5);
}
export function isUnitUnlocked(plan, unitNumber) {
  return unitNumber <= (FEATURES[plan]?.maxUnit || 8);
}
