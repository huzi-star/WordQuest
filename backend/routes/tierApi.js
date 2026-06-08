// Tier system endpoints.
//   GET  /api/tiers                       — tier ladder
//   GET  /api/tier-leaderboard/:tier?userId=X — top 25 + caller rank
//   POST /api/word-detail                 — kid-friendly word card

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const { TIERS, tierForScore, nextTier } = require('../config/tiers');
const wordDetailAgent = require('../agents/wordDetailAgent');
const wordOfDayAgent = require('../agents/wordOfDayAgent');
const { translateAgent, LANGUAGES } = require('../agents/translateAgent');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';

let sb = null;
function client() {
  if (sb) return sb;
  try { sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }); }
  catch (_) { sb = null; }
  return sb;
}

router.get('/api/tiers', (_req, res) => {
  res.json({
    ok: true,
    tiers: TIERS.map((t) => ({
      key: t.key, name: t.name, rank: t.rank, minScore: t.minScore,
      cefr: t.cefr, cefrLabel: t.cefrLabel,
      color: t.color, accent: t.accent, emoji: t.emoji,
    })),
  });
});

// Word of the Day — same word per day globally, scoped to the player's tier.
router.get('/api/word-of-day', async (req, res) => {
  const tier = req.query.tier ? String(req.query.tier) : 'bronze';
  const result = await wordOfDayAgent({ tier });
  if (!result) return res.json({ ok: false });
  res.json({ ok: true, ...result });
});

router.get('/api/translate-langs', (_req, res) => {
  res.json({ ok: true, languages: Object.keys(LANGUAGES) });
});

router.post('/api/translate-meaning', async (req, res) => {
  const { word, meaning, language } = req.body || {};
  if (!word || !meaning) return res.status(400).json({ ok: false, error: 'word and meaning required' });
  const translation = await translateAgent({ word, meaning, language });
  if (!translation) return res.json({ ok: false });
  res.json({ ok: true, translation, language });
});

function pickTierFromScore(score) {
  let pick = TIERS[0];
  for (const t of TIERS) if ((score || 0) >= t.minScore) pick = t;
  return pick;
}

// POST — mobile registers / refreshes its own leaderboard entry.
router.post('/api/leaderboard/upsert', async (req, res) => {
  const c = client();
  if (!c) return res.status(503).json({ ok: false });
  const { userId, displayName, avatarColor, avatarUrl, avatarEmoji, totalScore = 0, highScore = 0, totalGames = 0 } = req.body || {};
  if (!userId || !displayName) return res.status(400).json({ ok: false, error: 'userId and displayName required' });
  const t = pickTierFromScore(totalScore);
  const row = {
    user_id: userId,
    display_name: String(displayName).slice(0, 40),
    avatar_color: avatarColor || '#7c3aed',
    avatar_url: avatarUrl || null,
    avatar_emoji: avatarEmoji || null,
    total_score: totalScore,
    high_score: highScore,
    total_games: totalGames,
    tier: t.key,
    updated_at: new Date().toISOString(),
  };
  const { error } = await c.from('wq_user_leaderboard').upsert(row, { onConflict: 'user_id' });
  if (error) return res.json({ ok: false, error: error.message });
  res.json({ ok: true, tier: t.key });
});

// Leaderboard: top 25 + caller rank, read from the public table.
router.get('/api/tier-leaderboard/:tier', async (req, res) => {
  const tier = TIERS.find((t) => t.key === req.params.tier) || TIERS[0];
  const nxt = nextTier(tier.key);
  const userId = req.query.userId ? String(req.query.userId) : null;

  const c = client();
  if (!c) return res.json({ ok: true, tier: tier.key, top: [], me: null });

  const { data, error } = await c
    .from('wq_user_leaderboard')
    .select('user_id,display_name,avatar_color,avatar_url,avatar_emoji,total_score,high_score,total_games')
    .eq('tier', tier.key)
    .order('total_score', { ascending: false })
    .limit(500);

  if (error || !data) return res.json({ ok: true, tier: tier.key, top: [], me: null });

  const ranked = data.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    totalScore: r.total_score || 0,
    highScore: r.high_score || 0,
    totalGames: r.total_games || 0,
    displayName: r.display_name || (r.user_id || '').slice(0, 6),
    avatarColor: r.avatar_color || '#7c3aed',
    avatarUrl: r.avatar_url || null,
    avatarEmoji: r.avatar_emoji || null,
  }));

  const top = ranked.slice(0, 25);
  let me = null;
  let aboveMe = null;
  if (userId) {
    const idx = ranked.findIndex((r) => r.userId === userId);
    if (idx >= 0) {
      me = ranked[idx];
      if (idx > 0) aboveMe = ranked[idx - 1];
    }
  }

  res.json({
    ok: true,
    tier: tier.key,
    range: { min: tier.minScore, max: nxt ? nxt.minScore - 1 : null },
    count: ranked.length,
    top,
    me,
    aboveMe,
  });
});

router.post('/api/word-detail', async (req, res) => {
  const { word, tier, category, userId } = req.body || {};
  if (!word) return res.status(400).json({ ok: false, error: 'word required' });
  const detail = await wordDetailAgent({ word, tier, category, userId });
  res.json({ ok: true, detail });
});

module.exports = router;
