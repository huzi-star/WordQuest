// learnMemory.js — per-user per-unit memory for Continue Learning.
//
// Each unit (1..32) has its OWN independent memory:
//   - last10[]: { lessonType, words[], passed, score, ts, difficulty }
//   - lastDifficulty: 'easy'|'medium'|'hard'  (hidden from frontend)
//
// First time a user enters a unit, last10 is empty → difficulty = 'easy'.
// As the user passes lessons, difficulty climbs the ladder. A fail drops
// it back one rung. Each unit is independent — Unit 2's history does NOT
// influence Unit 1's difficulty (per user spec).
//
// Storage: piggy-backs on wq_player_memory.metrics.learn_units (same
// JSONB blob used by coachAgent + pakistanQuest). No DDL needed.
//
// Layout:
//   wq_player_memory.metrics.learn_units = {
//     "1": { last10: [...], lastDifficulty: "easy" },
//     "2": { last10: [...], lastDifficulty: "medium" },
//     ...
//   }
//
// Read-merge-write to coexist with concurrent writes from learningPathAgent
// and pakistanQuestMemory on the same row.

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

const DIFFICULTY_LADDER = ['easy', 'medium', 'hard'];

// Lesson type → pass threshold (correctCount / totalItems).
// flashcard is informational — always passes (kids just read meaning).
// MCQ-style needs ≥60% to pass.
const PASS_THRESHOLD = {
  flashcard: 0,
  match_pairs: 0.6,
  fill_blank: 0.6,
  listen_pick: 0.6,
  syn_ant_match: 0.6,
  tense_pick: 0.6,
  acronym_expand: 0.6,
  sentence_build: 0.6,
  reading_qa: 0.6,
};

function thresholdFor(type) {
  return PASS_THRESHOLD[type] != null ? PASS_THRESHOLD[type] : 0.6;
}

function didPass(lessonType, correctCount, totalItems) {
  if (!totalItems) return true;
  const ratio = correctCount / totalItems;
  return ratio >= thresholdFor(lessonType);
}

async function readPlayerRow(userId) {
  const c = client(); if (!c) return null;
  try {
    const { data } = await c.from('wq_player_memory').select('*').eq('user_id', userId).maybeSingle();
    return data || null;
  } catch (_) { return null; }
}

function ensureMetrics(row) {
  const m = (row && row.metrics && typeof row.metrics === 'object') ? row.metrics : {};
  m.learn_units = m.learn_units || {};
  return m;
}

async function loadUnitMemory(userId, unitId) {
  if (!userId || !unitId) return { last10: [], lastDifficulty: 'easy', firstTime: true };
  const row = await readPlayerRow(userId);
  const m = ensureMetrics(row);
  const key = String(unitId);
  const u = m.learn_units[key];
  if (!u || !Array.isArray(u.last10) || !u.last10.length) {
    return { last10: [], lastDifficulty: 'easy', firstTime: true };
  }
  return {
    last10: u.last10,
    lastDifficulty: DIFFICULTY_LADDER.includes(u.lastDifficulty) ? u.lastDifficulty : 'easy',
    firstTime: false,
  };
}

function decideDifficulty(unitMem) {
  if (unitMem.firstTime) return 'easy';
  const recent = (unitMem.last10 || []).slice(-5);
  if (recent.length < 3) return unitMem.lastDifficulty || 'easy';
  const passes = recent.filter((x) => x.passed).length;
  const passRate = passes / recent.length;
  const cur = DIFFICULTY_LADDER.indexOf(unitMem.lastDifficulty || 'easy');
  if (passRate >= 0.7 && cur < DIFFICULTY_LADDER.length - 1) return DIFFICULTY_LADDER[cur + 1];
  if (passRate <= 0.3 && cur > 0) return DIFFICULTY_LADDER[cur - 1];
  return DIFFICULTY_LADDER[cur];
}

function recentWords(unitMem) {
  const out = new Set();
  for (const e of (unitMem.last10 || [])) {
    for (const w of (e.words || [])) {
      if (w) out.add(String(w).toUpperCase());
    }
  }
  return Array.from(out);
}

async function recordLessonResult(userId, unitId, payload) {
  if (!userId || !unitId) return;
  const c = client(); if (!c) return;
  const row = await readPlayerRow(userId);
  const m = ensureMetrics(row);
  const key = String(unitId);
  const cur = m.learn_units[key] || { last10: [], lastDifficulty: 'easy' };
  const entry = {
    lessonType: String(payload.lessonType || ''),
    lessonIndex: Number(payload.lessonIndex) || 0,
    words: Array.isArray(payload.words) ? payload.words.map((w) => String(w).toUpperCase()) : [],
    correct: Number(payload.correct) || 0,
    total: Number(payload.total) || 0,
    passed: !!payload.passed,
    difficulty: DIFFICULTY_LADDER.includes(payload.difficulty) ? payload.difficulty : 'easy',
    ts: new Date().toISOString(),
  };
  cur.last10 = [...(cur.last10 || []), entry].slice(-10);
  cur.lastDifficulty = entry.difficulty;
  m.learn_units[key] = cur;

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

module.exports = {
  loadUnitMemory,
  decideDifficulty,
  recentWords,
  recordLessonResult,
  didPass,
  thresholdFor,
  DIFFICULTY_LADDER,
};
