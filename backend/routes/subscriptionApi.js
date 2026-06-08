const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';
let sb = null;
try { sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }); } catch (_) { sb = null; }

// Single source of truth for hints per game (Quick Play + Daily Challenge).
// Must be kept in sync with mobile/src/utils/plan.js HINT_LIMITS.
const HINT_LIMITS = { free: 1, pro: 3, pro_max: 4 };

const PLAN_FEATURES = {
  free: {
    qpPerDay: 5, quizPerDay: 3, dailyPerDay: 1,
    maxLevel: 5, maxUnit: 8,
    battle: false, ads: true, hints: HINT_LIMITS.free,
    tts: false, family: false, allCategories: false,
  },
  pro: {
    qpPerDay: -1, quizPerDay: -1, dailyPerDay: 1,
    maxLevel: 15, maxUnit: 24,
    battle: true, ads: false, hints: HINT_LIMITS.pro,
    tts: true, family: false, allCategories: true,
  },
  pro_max: {
    qpPerDay: -1, quizPerDay: -1, dailyPerDay: 1,
    maxLevel: 15, maxUnit: 32,
    battle: true, ads: false, hints: HINT_LIMITS.pro_max,
    tts: true, family: true, allCategories: true,
    aiTutor: true, customAvatars: true, parentDashboard: true, offline: true,
    aiTutorPerDay: 30,
  },
};

router.get('/api/sub/features', (_req, res) => res.json({ ok: true, features: PLAN_FEATURES }));

router.get('/api/sub/me/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: true, plan: 'free', status: 'active', features: PLAN_FEATURES.free });
  const { userId } = req.params;
  const { data } = await sb.from('wq_subscriptions').select('*').eq('user_id', userId).maybeSingle();
  let plan = 'free';
  let status = 'active';
  let expiresAt = null;
  let trialUsed = false;
  if (data) {
    plan = data.plan || 'free';
    status = data.status || 'active';
    expiresAt = data.expires_at;
    trialUsed = !!data.trial_used;
    if (expiresAt && new Date(expiresAt) < new Date() && plan !== 'free') {
      plan = 'free'; status = 'expired';
      await sb.from('wq_subscriptions').update({ plan: 'free', status: 'expired' }).eq('user_id', userId);
    }
  }
  res.json({ ok: true, plan, status, expiresAt, trialUsed, features: PLAN_FEATURES[plan] });
});

router.post('/api/sub/start-trial/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: false, error: 'no_db' });
  const { userId } = req.params;
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await sb.from('wq_subscriptions').upsert({
    user_id: userId, plan: 'pro', status: 'trial', expires_at: expires, trial_used: true,
    started_at: new Date().toISOString(), provider: 'trial', updated_at: new Date().toISOString(),
  });
  res.json({ ok: true, plan: 'pro', status: 'trial', expiresAt: expires });
});

// Mock upgrade endpoint — real version verifies Google Play / App Store receipt.
router.post('/api/sub/upgrade/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: false, error: 'no_db' });
  const { userId } = req.params;
  const { plan = 'pro', cycle = 'monthly', provider = 'mock', providerToken = null } = req.body || {};
  if (!['pro', 'pro_max'].includes(plan)) return res.json({ ok: false, error: 'invalid_plan' });
  const days = cycle === 'yearly' ? 365 : 30;
  const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  await sb.from('wq_subscriptions').upsert({
    user_id: userId, plan, status: 'active', expires_at: expires,
    started_at: new Date().toISOString(), provider, provider_token: providerToken,
    updated_at: new Date().toISOString(),
  });
  res.json({ ok: true, plan, status: 'active', expiresAt: expires });
});

// Coupon redemption — instant 7-day Pro or Pro Max activation.
const COUPONS = {
  HUZIQUEST: 'pro',
  HUZIBUILD: 'pro_max',
};
router.post('/api/sub/coupon/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: false, error: 'no_db' });
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const plan = COUPONS[code];
  if (!plan) return res.json({ ok: false, error: 'Invalid coupon code' });
  const { userId } = req.params;
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await sb.from('wq_subscriptions').upsert({
    user_id: userId, plan, status: 'active', expires_at: expires,
    started_at: new Date().toISOString(), provider: 'coupon', provider_token: code,
    updated_at: new Date().toISOString(),
  });
  res.json({ ok: true, plan, status: 'active', expiresAt: expires, days: 7 });
});

router.post('/api/sub/cancel/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: false });
  await sb.from('wq_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('user_id', req.params.userId);
  res.json({ ok: true });
});

// Daily usage counters — bumped server-side so phone reset can't bypass.
router.post('/api/sub/usage/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: true });
  const { userId } = req.params;
  const { kind = 'quick_play' } = req.body || {};
  const today = new Date().toISOString().slice(0, 10);
  const col = kind === 'quiz' ? 'quiz_count' : kind === 'daily' ? 'daily_challenge_count' : 'quick_play_count';
  const { data } = await sb.from('wq_daily_usage').select('*').eq('user_id', userId).eq('day', today).maybeSingle();
  if (!data) {
    const row = { user_id: userId, day: today, quick_play_count: 0, quiz_count: 0, daily_challenge_count: 0 };
    row[col] = 1;
    await sb.from('wq_daily_usage').insert(row);
    return res.json({ ok: true, count: 1 });
  }
  const next = (data[col] || 0) + 1;
  await sb.from('wq_daily_usage').update({ [col]: next }).eq('user_id', userId).eq('day', today);
  res.json({ ok: true, count: next });
});

router.get('/api/sub/usage/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: true, quick_play: 0, quiz: 0, daily: 0 });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from('wq_daily_usage').select('*').eq('user_id', req.params.userId).eq('day', today).maybeSingle();
  res.json({
    ok: true,
    quick_play: data?.quick_play_count || 0,
    quiz: data?.quiz_count || 0,
    daily: data?.daily_challenge_count || 0,
  });
});

module.exports = router;
