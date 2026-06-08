// coachMemory.js — long-term memory for coachAgent (judges' feedback #2).
//
// Stores the last 10 ranked games per user (Quick Play + 1v1 Battle) inside
// wq_player_memory.metrics.coach_history.last10. Used by coachAgent to detect
// patterns ("always loses in food category", "hints overused 7/10 games",
// "slow on diagonals 4 sessions in a row") and recommend the next 3 rounds.
//
// We piggy-back the existing wq_player_memory row so no migration is needed.
// Re-read-before-write merges with concurrent writes by learningPathAgent
// and pakistanQuestMemory.

const { createClient } = require('@supabase/supabase-js');

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

async function readRow(userId) {
  const c = client(); if (!c) return null;
  try {
    const { data } = await c.from('wq_player_memory').select('*').eq('user_id', userId).maybeSingle();
    return data || null;
  } catch (_) { return null; }
}

function ensureMetrics(row) {
  const m = (row && row.metrics) || {};
  m.coach_history = m.coach_history || { last10: [] };
  if (!Array.isArray(m.coach_history.last10)) m.coach_history.last10 = [];
  return m;
}

async function loadLast10(userId) {
  const row = await readRow(userId);
  const m = ensureMetrics(row);
  return m.coach_history.last10 || [];
}

// gameRec shape:
// { mode: 'quick-play'|'1v1', outcome: 'win'|'loss'|'partial',
//   category, words, totalWords, completion, hintsUsed,
//   timeLeft, timeLimit, score, opponentScore?, ts }
async function appendGame(userId, gameRec) {
  if (!userId || !gameRec) return;
  const c = client(); if (!c) return;
  const row = await readRow(userId);
  const m = ensureMetrics(row);
  const entry = {
    mode: String(gameRec.mode || 'quick-play'),
    outcome: String(gameRec.outcome || 'partial'),
    category: String(gameRec.category || 'Mix'),
    words: Number(gameRec.words) || 0,
    totalWords: Number(gameRec.totalWords) || 0,
    completion: Number(gameRec.completion != null ? gameRec.completion
      : (gameRec.totalWords ? (gameRec.words || 0) / gameRec.totalWords : 0)),
    hintsUsed: Number(gameRec.hintsUsed) || 0,
    timeLeft: Number(gameRec.timeLeft) || 0,
    timeLimit: Number(gameRec.timeLimit) || 60,
    score: Number(gameRec.score) || 0,
    opponentScore: gameRec.opponentScore != null ? Number(gameRec.opponentScore) : null,
    ts: gameRec.ts || new Date().toISOString(),
  };
  m.coach_history.last10 = [...(m.coach_history.last10 || []), entry].slice(-10);
  try {
    await c.from('wq_player_memory').upsert({
      user_id: userId,
      metrics: m,
      category_stats: row?.category_stats || {},
      weaknesses: row?.weaknesses || [],
      strengths: row?.strengths || [],
      recommendations: row?.recommendations || [],
      sessions_logged: row?.sessions_logged || 0,
      last_updated: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (_) {}
}

// Aggregate signals from the last 10 games — coachAgent uses these to make
// kid-safe, specific recommendations instead of generic "play more" advice.
function summarizeLast10(games) {
  const g = Array.isArray(games) ? games : [];
  const n = g.length;
  if (n === 0) {
    return {
      n: 0, hasHistory: false, wins: 0, losses: 0, winRate: 0,
      avgCompletion: 0, avgHintsPerRound: 0, avgTimeLeftRatio: 0,
      lossStreak: 0, weakCategories: [], strongCategories: [],
      hintHeavy: false, slowFinisher: false, lowCompletion: false,
      battleLossStreak: 0,
    };
  }
  const wins = g.filter((x) => x.outcome === 'win').length;
  const losses = g.filter((x) => x.outcome === 'loss').length;
  const avgCompletion = g.reduce((s, x) => s + (x.completion || 0), 0) / n;
  const avgHints = g.reduce((s, x) => s + (x.hintsUsed || 0), 0) / n;
  const avgTimeLeftRatio = g.reduce((s, x) => {
    const lim = x.timeLimit || 60;
    return s + Math.max(0, (x.timeLeft || 0) / lim);
  }, 0) / n;

  // Per-category buckets
  const byCat = {};
  for (const x of g) {
    const k = x.category || 'Mix';
    byCat[k] = byCat[k] || { rounds: 0, completionSum: 0, wins: 0 };
    byCat[k].rounds += 1;
    byCat[k].completionSum += x.completion || 0;
    if (x.outcome === 'win') byCat[k].wins += 1;
  }
  const catList = Object.entries(byCat).map(([k, v]) => ({
    cat: k, rounds: v.rounds, accuracy: v.completionSum / v.rounds, wins: v.wins,
  }));
  const weakCategories = catList
    .filter((c) => c.rounds >= 2 && c.accuracy < 0.55)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 2)
    .map((c) => c.cat);
  const strongCategories = catList
    .filter((c) => c.rounds >= 2 && c.accuracy >= 0.85)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 2)
    .map((c) => c.cat);

  // Loss streak from the tail (most recent first)
  let lossStreak = 0;
  for (let i = g.length - 1; i >= 0; i--) {
    if (g[i].outcome === 'loss') lossStreak += 1; else break;
  }
  // Battle-specific loss streak
  let battleLossStreak = 0;
  for (let i = g.length - 1; i >= 0; i--) {
    if (g[i].mode === '1v1' && g[i].outcome === 'loss') battleLossStreak += 1;
    else if (g[i].mode === '1v1') break;
  }

  return {
    n, hasHistory: true,
    wins, losses, winRate: wins / n,
    avgCompletion, avgHintsPerRound: avgHints, avgTimeLeftRatio,
    lossStreak, battleLossStreak,
    weakCategories, strongCategories,
    hintHeavy: avgHints >= 1.5,
    slowFinisher: avgTimeLeftRatio < 0.15,
    lowCompletion: avgCompletion < 0.55,
  };
}

// Has the user played ANY ranked game (quick-play or 1v1)?
// New users with zero ranked history get the standard onboarding pick.
async function hasRankedHistory(userId) {
  const last10 = await loadLast10(userId);
  return last10.some((g) => g.mode === 'quick-play' || g.mode === '1v1');
}

module.exports = { loadLast10, appendGame, summarizeLast10, hasRankedHistory };
