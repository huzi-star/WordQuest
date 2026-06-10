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
const rewardAgent = require('../agents/rewardAgent');
const coachAgent = require('../agents/coachAgent');
const { guardText } = require('../utils/guardrailRunner');
const { TIERS, tierForScore } = require('../config/tiers');
const { loadLast10, appendGame } = require('../utils/coachMemory');

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
const QUEUE_LIVENESS_SEC = 8;     // a queue row is "live" if it pinged within this window
const QUEUE_MAX_AGE_SEC = 35;     // hard cap — older queue rows are presumed dead

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

  // Purge any queue row whose heartbeat is older than QUEUE_LIVENESS_SEC —
  // those players closed the app / lost connectivity and must NEVER be paired.
  const livenessCutoff = new Date(Date.now() - QUEUE_LIVENESS_SEC * 1000).toISOString();
  const hardCutoff = new Date(Date.now() - QUEUE_MAX_AGE_SEC * 1000).toISOString();
  try { await c.from('wq_match_queue').delete().lt('last_ping_at', livenessCutoff); } catch (_) {}
  try { await c.from('wq_match_queue').delete().lt('joined_at', hardCutoff); } catch (_) {}

  // Look for another LIVE player in the same tier within MMR_BAND.
  const widened = req.body?.widen ? MMR_BAND * 2 : MMR_BAND;
  const { data: candidates } = await c
    .from('wq_match_queue')
    .select('*')
    .eq('tier', tier)
    .neq('user_id', userId)
    .gte('mmr', myMmr - widened)
    .lte('mmr', myMmr + widened)
    .gte('last_ping_at', livenessCutoff)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (candidates && candidates.length) {
    const peer = candidates[0];
    // Atomically claim both queue rows.
    await c.from('wq_match_queue').delete().in('user_id', [userId, peer.user_id]);

    // Generate a single shared puzzle for the tier — both players get the
    // SAME grid, SAME words, SAME time limit (sourced from the tier config).
    const t = TIERS.find((x) => x.key === tier) || TIERS[0];
    const lvl = await levelGeneratorAgent({
      difficulty: t.rank <= 2 ? 'easy' : t.rank <= 4 ? 'medium' : 'hard',
      wordCount: t.puzzle.wordCount,
      gridSize: t.puzzle.gridSize,
      language: 'english',
      tier: t.key,
      userId, // per-player repeat check + guardrail attribution
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
      time_limit: t.puzzle.timeLimit,
      claims: {},
    }).select().single();
    if (error) return res.json({ ok: false, error: error.message });
    return res.json({ ok: true, matchId: match.id, status: 'matched' });
  }

  // No match — make sure I'm in the queue and mark me as ALIVE right now.
  const nowIso = new Date().toISOString();
  await c.from('wq_match_queue').upsert({
    user_id: userId, tier, mmr: myMmr,
    display_name: displayName || null,
    avatar_color: avatarColor || null,
    joined_at: nowIso,
    last_ping_at: nowIso,
  }, { onConflict: 'user_id' });

  res.json({ ok: true, status: 'queued', mmr: myMmr });
});

// Heartbeat — mobile pings every 2s while sitting on the queue screen.
// A queue row without a recent ping is treated as dead and will never be
// paired with a real player.
router.post('/api/battle/heartbeat', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false });
  await c.from('wq_match_queue')
    .update({ last_ping_at: new Date().toISOString() })
    .eq('user_id', userId);
  res.json({ ok: true });
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

// ATOMIC CLAIM — the authoritative "first to find a word wins it" endpoint.
// Mobile POSTs the moment it spells a target word. Server consults the
// claims JSONB ledger; if the word is still unclaimed it sets claims[word]
// to the caller's side and returns success. If already claimed it returns
// the claimant side so the loser's UI can grey the word out instantly.
router.post('/api/battle/match/:id/claim', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId, word } = req.body || {};
  if (!userId || !word) return res.status(400).json({ ok: false });
  const W = String(word).toUpperCase();

  const { data: m } = await c.from('wq_matches').select('*').eq('id', req.params.id).maybeSingle();
  if (!m) return res.status(404).json({ ok: false });
  if (m.status !== 'active') return res.json({ ok: false, reason: 'match-over', match: m });
  const isA = m.player_a === userId;
  const isB = m.player_b === userId;
  if (!isA && !isB) return res.status(403).json({ ok: false });
  if (!Array.isArray(m.words) || !m.words.map((x) => String(x).toUpperCase()).includes(W)) {
    return res.json({ ok: false, reason: 'not-a-target' });
  }
  const side = isA ? 'a' : 'b';
  const claims = (m.claims && typeof m.claims === 'object') ? m.claims : {};
  if (claims[W]) {
    return res.json({ ok: false, alreadyClaimed: true, claimedBy: claims[W], claims, match: m });
  }

  // Compare-and-swap: only succeed if the row still has NO claim on this
  // exact word at the moment we write. The filter pushes the check into
  // Postgres so two simultaneous claims can never both win.
  const newClaims = { ...claims, [W]: side };
  const nowIso = new Date().toISOString();
  // Server-authoritative scoring — points = letters + 2.
  const scoreInc = W.length + 2;
  const myScoreField = isA ? 'score_a' : 'score_b';
  const myWordsField = isA ? 'words_a' : 'words_b';
  const myLastWordField = isA ? 'last_word_a' : 'last_word_b';
  const update = {
    claims: newClaims,
    [myScoreField]: (m[myScoreField] || 0) + scoreInc,
    [myWordsField]: (m[myWordsField] || 0) + 1,
    [myLastWordField]: nowIso,
  };
  const { data: updRows } = await c
    .from('wq_matches')
    .update(update)
    .eq('id', m.id)
    .filter(`claims->>${W}`, 'is', null)
    .select();
  if (!updRows || !updRows.length) {
    // Lost the race — someone else just claimed it.
    const { data: fresh } = await c.from('wq_matches').select('*').eq('id', m.id).maybeSingle();
    return res.json({
      ok: false, alreadyClaimed: true,
      claimedBy: fresh?.claims?.[W] || null,
      claims: fresh?.claims || {}, match: fresh,
    });
  }
  const updated = updRows[0];

  // +25 completion bonus to any player whose claims account for EVERY
  // target word in this match. Applied once, on the claim that completes
  // their sweep.
  const totalWords = (m.words || []).length;
  let myClaimsCount = 0;
  for (const v of Object.values(updated.claims || {})) if (v === side) myClaimsCount++;
  if (totalWords > 0 && myClaimsCount >= totalWords && !m._completion_bonus_awarded) {
    const finalScoreField = isA ? 'score_a' : 'score_b';
    await c.from('wq_matches')
      .update({ [finalScoreField]: (updated[finalScoreField] || 0) + 25 })
      .eq('id', m.id);
    updated[finalScoreField] = (updated[finalScoreField] || 0) + 25;
  }

  // If every target word is now claimed (collectively), finalize.
  const claimedCount = Object.keys(updated.claims || {}).length;
  if (totalWords > 0 && claimedCount >= totalWords) {
    const final = await finalizeMatch(c, updated);
    return res.json({ ok: true, claimed: true, allDone: true, match: final });
  }
  res.json({ ok: true, claimed: true, match: updated });
});

// Forfeit — if a player leaves / disconnects mid-match, the OTHER player
// wins immediately. Used by the BattleScreen unmount path.
router.post('/api/battle/match/:id/forfeit', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false });
  const { data: m } = await c.from('wq_matches').select('*').eq('id', req.params.id).maybeSingle();
  if (!m) return res.status(404).json({ ok: false });
  if (m.status !== 'active') return res.json({ ok: true, alreadyDone: true, match: m });
  const isA = m.player_a === userId;
  const isB = m.player_b === userId;
  if (!isA && !isB) return res.status(403).json({ ok: false });

  // Mark forfeiter "finished" with current score so finalize sees them as
  // the loser. Boost the OTHER side so they always win the comparison.
  const totalWords = Array.isArray(m.words) ? m.words.length : 0;
  const update = isA
    ? { finished_a: true, finished_b: true, words_b: Math.max(m.words_b || 0, totalWords) }
    : { finished_a: true, finished_b: true, words_a: Math.max(m.words_a || 0, totalWords) };
  update.forfeited_by = userId;
  const { data: updated } = await c.from('wq_matches').update(update).eq('id', m.id).select().single();
  const final = await finalizeMatch(c, updated);
  res.json({ ok: true, forfeit: true, match: final });
});

// Live progress — mobile POSTs after every word found. Updates word/score
// counters so the opponent sees them live. If THIS player has now found
// ALL words in the puzzle, immediately mark them finished and the OTHER
// player loses (regardless of timer) — first-to-finish wins.
router.post('/api/battle/match/:id/progress', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId, score = 0, wordsFound = 0 } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false });
  const { data: m } = await c.from('wq_matches').select('*').eq('id', req.params.id).maybeSingle();
  if (!m) return res.status(404).json({ ok: false });
  if (m.status !== 'active') return res.json({ ok: true, match: m });
  const isA = m.player_a === userId;
  const isB = m.player_b === userId;
  if (!isA && !isB) return res.status(403).json({ ok: false });

  const totalWords = Array.isArray(m.words) ? m.words.length : 0;
  const allDone = totalWords > 0 && wordsFound >= totalWords;
  const nowIso = new Date().toISOString();

  const update = isA
    ? { score_a: score, words_a: wordsFound, last_word_a: nowIso }
    : { score_b: score, words_b: wordsFound, last_word_b: nowIso };
  if (allDone) {
    if (isA) update.finished_a = true;
    else update.finished_b = true;
  }
  const { data: updated } = await c.from('wq_matches').update(update).eq('id', m.id).select().single();

  // First-to-find-all-words instantly wins — finalize right away.
  if (allDone && updated) {
    const final = await finalizeMatch(c, updated);
    return res.json({ ok: true, match: final, instantWin: true });
  }
  res.json({ ok: true, match: updated });
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
  // Prefer authoritative claims ledger if it exists — that is the source
  // of truth for shared first-come-first-served wins.
  const claims = (m.claims && typeof m.claims === 'object') ? m.claims : {};
  let aWords = m.words_a || 0, bWords = m.words_b || 0;
  if (Object.keys(claims).length) {
    aWords = 0; bWords = 0;
    for (const v of Object.values(claims)) {
      if (v === 'a') aWords++;
      else if (v === 'b') bWords++;
    }
  }
  const totalWords = Array.isArray(m.words) ? m.words.length : 0;

  // Winner rule:
  //   1) Anyone who found ALL words wins outright. If both did, the earlier
  //      finisher (last_word timestamp) wins.
  //   2) Otherwise, whoever found MORE words wins. No draws on word count.
  //   3) Tied word counts → whoever found their last word sooner wins.
  //   4) Truly identical (e.g. nobody found anything) → fall back to score.
  let winner = null;
  const aAll = totalWords > 0 && aWords >= totalWords;
  const bAll = totalWords > 0 && bWords >= totalWords;
  if (aAll && !bAll) winner = 'a';
  else if (bAll && !aAll) winner = 'b';
  else if (aAll && bAll) {
    const ta = m.last_word_a ? new Date(m.last_word_a).getTime() : Infinity;
    const tb = m.last_word_b ? new Date(m.last_word_b).getTime() : Infinity;
    winner = ta <= tb ? 'a' : 'b';
  } else if (aWords > bWords) winner = 'a';
  else if (bWords > aWords) winner = 'b';
  else {
    const ta = m.last_word_a ? new Date(m.last_word_a).getTime() : null;
    const tb = m.last_word_b ? new Date(m.last_word_b).getTime() : null;
    if (ta && tb) winner = ta <= tb ? 'a' : 'b';
    else if (ta && !tb) winner = 'a';
    else if (tb && !ta) winner = 'b';
    else if (aScore > bScore) winner = 'a';
    else if (bScore > aScore) winner = 'b';
    else winner = null; // both did literally nothing — rare; null = draw
  }

  // SPEED-BASED VICTORY BONUS — the faster of the two players (i.e. the
  // winner who finished sooner) earns extra points. Cap 0..20 so a perfect
  // sweep within the first quarter of the timer maxes out, and a buzzer-
  // beater win still earns at least a small bonus.
  const matchStartMs = m.created_at ? new Date(m.created_at).getTime() : 0;
  const timeLimitSec = Number(m.time_limit) || 60;
  let speedBonus = 0;
  let elapsedSec = 0;
  if (winner === 'a' || winner === 'b') {
    const lastWord = winner === 'a' ? m.last_word_a : m.last_word_b;
    const endMs = lastWord ? new Date(lastWord).getTime() : Date.now();
    elapsedSec = matchStartMs > 0 ? Math.max(0, Math.round((endMs - matchStartMs) / 1000)) : timeLimitSec;
    const ratio = Math.max(0, (timeLimitSec - elapsedSec) / timeLimitSec);
    speedBonus = Math.min(20, Math.max(0, Math.round(ratio * 20)));
  }

  // Apply the speed bonus to the winner's stored score so the result blob,
  // leaderboard credit, and scoreboard UI all reflect it consistently.
  if (winner === 'a') { aScore = aScore + speedBonus; }
  else if (winner === 'b') { bScore = bScore + speedBonus; }

  const { mmrA, mmrB } = computeElo(m.mmr_a || 1000, m.mmr_b || 1000, winner);
  const deltaA = mmrA - (m.mmr_a || 1000);
  const deltaB = mmrB - (m.mmr_b || 1000);

  const winnerId = winner === 'a' ? m.player_a : winner === 'b' ? m.player_b : null;

  // LONG-TERM MEMORY — append THIS battle to both players' last-10 ledger
  // BEFORE coachAgent runs, so the loser's diagnosis already counts this
  // loss in its battle-loss-streak / win-rate signals.
  const categoryName = (m.puzzle && m.puzzle.category) || (m.category || 'Mix');
  const aOutcome = winner === 'a' ? 'win' : (winner === 'b' ? 'loss' : 'partial');
  const bOutcome = winner === 'b' ? 'win' : (winner === 'a' ? 'loss' : 'partial');
  try {
    await Promise.all([
      m.player_a ? appendGame(m.player_a, {
        mode: '1v1', outcome: aOutcome, category: categoryName,
        words: aWords, totalWords, completion: totalWords ? aWords / totalWords : 0,
        hintsUsed: 0, timeLeft: Math.max(0, timeLimitSec - elapsedSec),
        timeLimit: timeLimitSec, score: aScore, opponentScore: bScore,
      }) : null,
      m.player_b ? appendGame(m.player_b, {
        mode: '1v1', outcome: bOutcome, category: categoryName,
        words: bWords, totalWords, completion: totalWords ? bWords / totalWords : 0,
        hintsUsed: 0, timeLeft: Math.max(0, timeLimitSec - elapsedSec),
        timeLimit: timeLimitSec, score: bScore, opponentScore: aScore,
      }) : null,
    ]);
  } catch (_) {}

  // REWARD AGENT for the winner — produces one kid-safe motivational line.
  // COACH AGENT for the loser — full long-term-memory diagnosis with the
  // next-3-rounds prescription (judges' feedback #2).
  let winnerLine = '';
  let loserLine = '';
  let coachNextRounds = [];
  let coachHowToFix = [];
  let coachWinner = null;
  let coachLoser = null;
  try {
    if (winnerId) {
      const winnerSide = winner === 'a' ? { score: aScore, words: aWords } : { score: bScore, words: bWords };
      // coachAgent WIN mode — full analysis (strengths + lite improvements).
      const winCoach = await coachAgent({
        outcome: 'win',
        mode: '1v1',
        userId: winnerId,
        wordsFound: winnerSide.words,
        totalWords,
        timeLeft: Math.max(0, timeLimitSec - elapsedSec),
        score: winnerSide.score,
        opponentScore: winner === 'a' ? bScore : aScore,
        streak: 1, bestStreak: 1,
        category: categoryName,
        language: 'english',
      });
      winnerLine = String(winCoach?.headline || '').trim();
      if (!winnerLine) {
        // Fallback to rewardAgent if coach failed for any reason.
        const rew = await rewardAgent({
          wordsFound: winnerSide.words, totalWords,
          timeLeft: Math.max(0, timeLimitSec - elapsedSec),
          score: winnerSide.score, streak: 1, roundNumber: 1,
          language: 'english', userId: winnerId,
        });
        winnerLine = String(rew?.encouragement || '').trim();
      }
      if (!winnerLine) winnerLine = 'Sharp play — you outpaced your opponent!';
      const safeWin = await guardText(winnerLine, 'tutor', { ageGroup: 'kid' });
      winnerLine = safeWin || 'Sharp play — you outpaced your opponent!';
      coachWinner = winCoach || null;
    }
  } catch (_) { winnerLine = 'Sharp play — you outpaced your opponent!'; }

  try {
    const loserId = winner === 'a' ? m.player_b : winner === 'b' ? m.player_a : null;
    if (loserId) {
      const loserSide = winner === 'a' ? { score: bScore, words: bWords } : { score: aScore, words: aWords };
      // coachAgent in LOSS mode pulls last-10 from memory automatically.
      const coach = await coachAgent({
        outcome: 'loss',
        mode: '1v1',
        userId: loserId,
        wordsFound: loserSide.words,
        totalWords,
        timeLeft: 0,
        hintsUsed: 0,
        category: categoryName,
        score: loserSide.score,
        opponentScore: winner === 'a' ? aScore : bScore,
        rounds: 1, totalScore: loserSide.score,
        language: 'english',
      });
      const first = (coach?.improvements && coach.improvements[0]) || coach?.headline || '';
      loserLine = String(first || '').trim();
      if (!loserLine) loserLine = 'Close one — scan diagonals next time.';
      const safeLose = await guardText(loserLine, 'tutor', { ageGroup: 'kid' });
      loserLine = safeLose || 'Close one — scan diagonals next time.';
      coachNextRounds = Array.isArray(coach?.nextRounds) ? coach.nextRounds : [];
      coachHowToFix = Array.isArray(coach?.howToFix) ? coach.howToFix : [];
      coachLoser = coach || null;

      // Persist coach's next-3-rounds prescription into the loser's
      // wq_player_memory.recommendations so HomeScreen "Recommended For
      // You" reflects this loss within seconds (judges' feedback #2 + #5).
      try {
        const c2 = c; // same supabase client
        if (coachNextRounds.length) {
          await c2.from('wq_player_memory').update({
            recommendations: coachNextRounds,
            last_updated: new Date().toISOString(),
          }).eq('user_id', loserId);
        }
      } catch (_) {}
    }
  } catch (_) { loserLine = 'Close one — scan diagonals next time.'; }

  const result = {
    winner,
    winnerId,
    totalWords,
    speedBonus,
    elapsedSec,
    winnerLine,
    loserLine,
    coach: {
      nextRounds: coachNextRounds,
      howToFix: coachHowToFix,
      // Per-side full coach payload — the mobile result screen reads
      // `winner` / `loser` based on which side `me` is on, so every kid
      // (winner OR loser) gets a personalised analysis on the screen.
      winner: coachWinner,
      loser: coachLoser,
    },
    a: { userId: m.player_a, score: aScore, words: aWords, mmrDelta: deltaA, newMmr: mmrA, foundAll: aAll, lastWordAt: m.last_word_a || null },
    b: { userId: m.player_b, score: bScore, words: bWords, mmrDelta: deltaB, newMmr: mmrB, foundAll: bAll, lastWordAt: m.last_word_b || null },
  };

  await c.from('wq_matches').update({
    status: 'done', ended_at: new Date().toISOString(), result, winner_id: winnerId,
  }).eq('id', m.id);

  // Update per-player ranking + W/L + streak.
  await applyRanking(c, m.player_a, mmrA, winner === 'a' ? 'win' : winner === 'b' ? 'loss' : 'draw');
  await applyRanking(c, m.player_b, mmrB, winner === 'b' ? 'win' : winner === 'a' ? 'loss' : 'draw');

  // Battle points DO affect rank/tier — credit each player's final match
  // score (which now includes the speed bonus for the winner) into
  // wq_user_leaderboard total_score + high_score. Winner also gets the
  // +25 completion bonus on top.
  try {
    const aTotal = (winner === 'a' ? 25 : 0) + aScore;
    const bTotal = (winner === 'b' ? 25 : 0) + bScore;
    await creditToLeaderboard(c, m.player_a, aTotal);
    await creditToLeaderboard(c, m.player_b, bTotal);
  } catch (_) { /* leaderboard credit must never break match finalisation */ }

  const { data: refreshed } = await c.from('wq_matches').select('*').eq('id', m.id).maybeSingle();
  return refreshed || m;
}

// Add `delta` to a player's leaderboard row. total_score is cumulative,
// high_score is max-of-single-match-score, tier is recomputed from total.
async function creditToLeaderboard(c, userId, delta) {
  if (!userId || !delta || delta <= 0) return;
  const { data: cur } = await c.from('wq_user_leaderboard').select('*').eq('user_id', userId).maybeSingle();
  if (!cur) return; // mobile creates the row on first leaderboard upsert
  const newTotal = (cur.total_score || 0) + delta;
  const newHigh = Math.max(cur.high_score || 0, delta);
  // Pick the tier from new total_score using the same ladder as everywhere else.
  let nextTier = TIERS[0];
  for (const t of TIERS) if (newTotal >= t.minScore) nextTier = t;
  await c.from('wq_user_leaderboard').update({
    total_score: newTotal,
    high_score: newHigh,
    tier: nextTier.key,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
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
