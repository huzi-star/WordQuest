// WordQuest · 1v1 real-time battle API.
//
//   POST /api/battle/queue        — join matchmaking queue
//   POST /api/battle/cancel       — leave queue
//   GET  /api/battle/match/:id    — poll a match's state
//   POST /api/battle/match/:id/result — submit my result
//   GET  /api/battle/ranking/:userId  — W/L + MMR
//
// Matchmaking pattern (no websockets — works on Vercel serverless):
//   1. Player POSTs /queue with their tier + MMR. Backend inserts a row into
//      wq_match_queue and immediately checks for another waiting player in
//      the same tier ±100 MMR. If found, atomically delete both queue rows,
//      generate ONE puzzle, insert a wq_matches row, return its id to BOTH.
//   2. Each player polls /match/:id every 2s until status='active' and they
//      see the same puzzle. Solve independently.
//   3. Each player POSTs /match/:id/result with score + wordsFound. When both
//      results arrive (or 90s elapsed), backend computes the winner, updates
//      MMR + W/L for both, and writes the result blob.

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const levelGeneratorAgent = require('../agents/levelGeneratorAgent');
const { TIERS, tierForScore } = require('../config/tiers');

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

const MMR_BAND = 200;             // initial fairness window
const MMR_WIDEN_AFTER_SEC = 8;    // expand the band if no match found

async function ensureRanking(userId) {
  const c = client(); if (!c) return null;
  const { data } = await c.from('wq_player_ranking').select('*').eq('user_id', userId).maybeSingle();
  if (data) return data;
  await c.from('wq_player_ranking').insert({ user_id: userId, mmr: 1000 });
  return { user_id: userId, mmr: 1000, wins: 0, losses: 0, current_streak: 0, total_matches: 0 };
}

router.post('/api/battle/queue', async (req, res) => {
  const c = client(); if (!c) return res.status(503).json({ ok: false, error: 'db down' });
  const { userId, tier = 'bronze', displayName, avatarColor } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });

  const r = await ensureRanking(userId);
  const myMmr = r?.mmr || 1000;

  // First: check if I am already in a fresh active match (server-side rematch).
  const { data: existing } = await c
    .from('wq_matches')
    .select('*')
    .eq('status', 'active')
    .or(`player_a.eq.${userId},player_b.eq.${userId}`)
    .order('started_at', { ascending: false })
    .limit(1);
  if (existing && existing.length && (Date.now() - new Date(existing[0].started_at).getTime() < 120 * 1000)) {
    return res.json({ ok: true, matchId: existing[0].id, status: 'matched' });
  }

  // Look for another player in the same tier within MMR_BAND, joined ≥0 sec ago.
  const widened = req.body?.widen ? MMR_BAND * 2 : MMR_BAND;
  const { data: candidates } = await c
    .from('wq_match_queue')
    .select('*')
    .eq('tier', tier)
    .neq('user_id', userId)
    .gte('mmr', myMmr - widened)
    .lte('mmr', myMmr + widened)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (candidates && candidates.length) {
    const peer = candidates[0];
    // Atomically claim both queue rows.
    await c.from('wq_match_queue').delete().in('user_id', [userId, peer.user_id]);

    // Generate a single shared puzzle for the tier. Smaller grid for snappy 60s play.
    const t = TIERS.find((x) => x.key === tier) || TIERS[0];
    const lvl = await levelGeneratorAgent({
      difficulty: t.rank <= 2 ? 'easy' : t.rank <= 4 ? 'medium' : 'hard',
      wordCount: t.rank <= 2 ? 4 : t.rank <= 4 ? 5 : 6,
      gridSize: t.rank <= 2 ? 6 : t.rank <= 4 ? 7 : 8,
      language: 'english',
      tier: t.key,
    });

    const { data: match, error } = await c.from('wq_matches').insert({
      tier,
      player_a: userId,
      player_b: peer.user_id,
      display_a: displayName || 'Player A',
      display_b: peer.display_name || 'Player B',
      avatar_a: avatarColor || '#7c3aed',
      avatar_b: peer.avatar_color || '#22c55e',
      mmr_a: myMmr, mmr_b: peer.mmr || 1000,
      category: lvl?.category || 'Mix',
      words: lvl?.words || [],
      grid: lvl?.grid || [],
      word_positions: lvl?.wordPositions || [],
    }).select().single();
    if (error) return res.json({ ok: false, error: error.message });
    return res.json({ ok: true, matchId: match.id, status: 'matched' });
  }

  // No match — make sure I'm in the queue.
  await c.from('wq_match_queue').upsert({
    user_id: userId, tier, mmr: myMmr,
    display_name: displayName || null,
    avatar_color: avatarColor || null,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  res.json({ ok: true, status: 'queued', mmr: myMmr });
});

router.post('/api/battle/cancel', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false });
  await c.from('wq_match_queue').delete().eq('user_id', userId);
  res.json({ ok: true });
});

router.get('/api/battle/match/:id', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { data, error } = await c.from('wq_matches').select('*').eq('id', req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ ok: false });
  res.json({ ok: true, match: data });
});

router.post('/api/battle/match/:id/result', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId, score = 0, wordsFound = 0 } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false });
  const { data: m } = await c.from('wq_matches').select('*').eq('id', req.params.id).maybeSingle();
  if (!m) return res.status(404).json({ ok: false });
  if (m.status !== 'active') return res.json({ ok: true, alreadyDone: true, match: m });

  const isA = m.player_a === userId;
  const isB = m.player_b === userId;
  if (!isA && !isB) return res.status(403).json({ ok: false, error: 'not in this match' });

  const update = isA
    ? { score_a: score, words_a: wordsFound, finished_a: true }
    : { score_b: score, words_b: wordsFound, finished_b: true };
  const { data: updated } = await c
    .from('wq_matches')
    .update(update)
    .eq('id', m.id)
    .select()
    .single();

  let final = updated;
  if (updated.finished_a && updated.finished_b) {
    final = await finalizeMatch(c, updated);
  }
  res.json({ ok: true, match: final });
});

async function finalizeMatch(c, m) {
  const aScore = m.score_a || 0, bScore = m.score_b || 0;
  let winner = null;
  if (aScore > bScore) winner = 'a';
  else if (bScore > aScore) winner = 'b';
  else winner = null; // draw

  const { mmrA, mmrB } = computeElo(m.mmr_a || 1000, m.mmr_b || 1000, winner);
  const deltaA = mmrA - (m.mmr_a || 1000);
  const deltaB = mmrB - (m.mmr_b || 1000);

  const result = {
    winner,
    a: { userId: m.player_a, score: aScore, words: m.words_a || 0, mmrDelta: deltaA, newMmr: mmrA },
    b: { userId: m.player_b, score: bScore, words: m.words_b || 0, mmrDelta: deltaB, newMmr: mmrB },
  };

  await c.from('wq_matches').update({
    status: 'done', ended_at: new Date().toISOString(), result,
  }).eq('id', m.id);

  // Update per-player ranking + W/L + streak.
  await applyRanking(c, m.player_a, mmrA, winner === 'a' ? 'win' : winner === 'b' ? 'loss' : 'draw');
  await applyRanking(c, m.player_b, mmrB, winner === 'b' ? 'win' : winner === 'a' ? 'loss' : 'draw');

  const { data: refreshed } = await c.from('wq_matches').select('*').eq('id', m.id).maybeSingle();
  return refreshed || m;
}

function computeElo(ra, rb, winner) {
  const K = 32;
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const eb = 1 - ea;
  let sa = 0.5, sb = 0.5;
  if (winner === 'a') { sa = 1; sb = 0; }
  if (winner === 'b') { sa = 0; sb = 1; }
  return {
    mmrA: Math.max(100, Math.round(ra + K * (sa - ea))),
    mmrB: Math.max(100, Math.round(rb + K * (sb - eb))),
  };
}

async function applyRanking(c, userId, newMmr, outcome) {
  const { data: cur } = await c.from('wq_player_ranking').select('*').eq('user_id', userId).maybeSingle();
  const base = cur || { user_id: userId, mmr: 1000, wins: 0, losses: 0, draws: 0, current_streak: 0, best_win_streak: 0, worst_loss_streak: 0, total_matches: 0 };
  let cs = base.current_streak || 0;
  if (outcome === 'win') cs = cs >= 0 ? cs + 1 : 1;
  else if (outcome === 'loss') cs = cs <= 0 ? cs - 1 : -1;
  else cs = 0;
  const update = {
    user_id: userId,
    mmr: newMmr,
    wins: (base.wins || 0) + (outcome === 'win' ? 1 : 0),
    losses: (base.losses || 0) + (outcome === 'loss' ? 1 : 0),
    draws: (base.draws || 0) + (outcome === 'draw' ? 1 : 0),
    current_streak: cs,
    best_win_streak: Math.max(base.best_win_streak || 0, cs > 0 ? cs : 0),
    worst_loss_streak: Math.min(base.worst_loss_streak || 0, cs < 0 ? cs : 0),
    total_matches: (base.total_matches || 0) + 1,
    last_match_at: new Date().toISOString(),
  };
  await c.from('wq_player_ranking').upsert(update, { onConflict: 'user_id' });
}

router.get('/api/battle/ranking/:userId', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const r = await ensureRanking(req.params.userId);
  res.json({ ok: true, ranking: r });
});

// Force-finalize matches that have been hanging > 90s with at least one player submitted.
router.post('/api/battle/match/:id/timeout', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { data: m } = await c.from('wq_matches').select('*').eq('id', req.params.id).maybeSingle();
  if (!m || m.status !== 'active') return res.json({ ok: true });
  if (!(m.finished_a || m.finished_b)) {
    // Both bailed — cancel.
    await c.from('wq_matches').update({ status: 'cancelled', ended_at: new Date().toISOString() }).eq('id', m.id);
    return res.json({ ok: true, cancelled: true });
  }
  const final = await finalizeMatch(c, m);
  res.json({ ok: true, match: final });
});

module.exports = router;
