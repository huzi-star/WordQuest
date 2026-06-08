// WordQuest Learning Academy — REST API.
//
//   GET  /api/learn/path/:userId          — full skill tree with locks
//   GET  /api/learn/unit/:unitId          — unit metadata + lesson types
//   GET  /api/learn/lesson?unitId=&i=&type=&userId=  — per-user dynamic lesson
//   POST /api/learn/submit                — record a single answer
//   POST /api/learn/lesson-result         — mark a lesson pass/fail (per-unit memory + retry gate)
//   POST /api/learn/complete-unit         — mark unit complete, unlock next (pass-gated)
//   GET  /api/learn/progress/:userId      — quick progress fetch
//
// Per-user adaptation: every lesson is generated FRESH for the player.
// learnMemory.js holds last 10 lessons PER UNIT independently — Unit 2
// difficulty is NOT influenced by Unit 1's history. AI uses excludeWords
// from those 10 lessons so vocabulary doesn't repeat; <=10% repeats are
// tolerated only when the pool genuinely runs out.
//
// Unit gating: a unit unlocks the next ONLY when all 5 lessons have been
// passed in a row. A failed lesson does NOT advance — the player must
// retry until the pass threshold is met.

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const { UNITS, getUnit, nextUnitId, lessonTypesForUnit, LESSONS_PER_UNIT } = require('../config/curriculum');
const { lessonAgent } = require('../agents/lessonAgent');
const {
  loadUnitMemory, decideDifficulty, recentWords,
  recordLessonResult, didPass,
} = require('../utils/learnMemory');
const { guardText } = require('../utils/guardrailRunner');
const { generate, isConfigured } = require('../utils/llm');

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

async function ensureProgress(userId) {
  const c = client(); if (!c) return null;
  const { data } = await c.from('wq_learn_progress').select('*').eq('user_id', userId).maybeSingle();
  if (data) return data;
  await c.from('wq_learn_progress').insert({ user_id: userId, current_unit_id: 1 });
  return { user_id: userId, current_unit_id: 1, completed_units: [], total_xp: 0 };
}

// Light, kid-safe motivational line for engagement after each lesson and
// at the end of a unit. NO points / rewards / tier mention per spec —
// purely encouragement. Falls back to a curated set if LLM is unavailable.
async function motivationalLine({ userId, kind, unit, lessonType, passed }) {
  const local = {
    'lesson-pass':  ['Nice one — onto the next 🌟', 'Great focus! 💡', 'You got it! Keep going.', 'Sharp answer — moving on.'],
    'lesson-fail':  ['Almost — try once more 💪', 'Close! Read it again, you got this.', 'No worries — give it another go.', 'Try again, take your time.'],
    'unit-done':    ['Unit complete — beautifully done 🎉', 'You finished the whole unit. Proud of you!', 'Whole unit unlocked above you — keep climbing 🌟'],
  };
  const pool = local[kind] || local['lesson-pass'];
  // Deterministic-ish variety per user/unit/lesson so the same line doesn't
  // appear twice in a row for the same kid.
  const seed = ((unit || 0) * 31 + (lessonType ? lessonType.length : 0)) % pool.length;
  let line = pool[(seed + (passed ? 0 : 1)) % pool.length];
  if (isConfigured()) {
    try {
      const prompt = `Write ONE short, warm motivational line (max 12 words) for a child aged 8-12 who just ${kind === 'lesson-fail' ? 'attempted but did not pass' : (kind === 'unit-done' ? 'finished a whole learning unit' : 'completed a learning lesson')} in the WordQuest English-learning app. No emojis required, no exclamation overload, no points, no badges. Just kindness. Return only the line.`;
      const out = await generate(prompt, { agent: 'motivationLine', timeoutMs: 9000, temperature: 0.85, maxTokens: 60 });
      const cleaned = String(out || '').replace(/^["'`\s]+|["'`\s]+$/g, '').split(/\r?\n/)[0].trim();
      if (cleaned) line = cleaned;
    } catch (_) { /* keep local fallback */ }
  }
  const safe = await guardText(line, 'tutor', { ageGroup: 'kid', userId });
  return safe || pool[seed % pool.length];
}

router.get('/api/learn/units', (_req, res) => {
  res.json({ ok: true, units: UNITS });
});

router.get('/api/learn/progress/:userId', async (req, res) => {
  const p = await ensureProgress(req.params.userId);
  res.json({ ok: true, progress: p });
});

router.get('/api/learn/path/:userId', async (req, res) => {
  const p = await ensureProgress(req.params.userId);
  if (!p) return res.json({ ok: false });
  const completed = new Set(p.completed_units || []);
  const current = p.current_unit_id || 1;
  const path = UNITS.map((u) => {
    const isDone = completed.has(u.id);
    const isCurrent = u.id === current;
    const isLocked = !isDone && u.id > current;
    return {
      ...u,
      status: isDone ? 'done' : isCurrent ? 'current' : isLocked ? 'locked' : 'available',
    };
  });
  res.json({ ok: true, progress: p, path });
});

router.get('/api/learn/unit/:unitId', (req, res) => {
  const u = getUnit(req.params.unitId);
  if (!u) return res.status(404).json({ ok: false });
  res.json({
    ok: true,
    unit: u,
    lessonTypes: lessonTypesForUnit(u),
    totalLessons: LESSONS_PER_UNIT,
  });
});

// Pull every word-looking string out of a lesson payload so learnMemory's
// excludeWords stays accurate per unit. Different lesson types nest words
// in different keys; this collects them all.
function extractLessonWords(lesson) {
  const out = new Set();
  if (!lesson || !Array.isArray(lesson.items)) return [];
  for (const it of lesson.items) {
    if (!it) continue;
    for (const k of ['word', 'correct', 'left', 'right', 'acronym']) {
      if (typeof it[k] === 'string' && it[k]) out.add(it[k].toUpperCase());
    }
    if (Array.isArray(it.options)) {
      for (const o of it.options) {
        if (typeof o === 'string' && o.length <= 24) out.add(o.toUpperCase());
      }
    }
  }
  return Array.from(out);
}

// GET a SINGLE lesson — generated PER USER. No global cache. Difficulty
// comes from this user's per-unit memory (hidden from the response).
router.get('/api/learn/lesson', async (req, res) => {
  const unitId = Number(req.query.unitId);
  const lessonIndex = Number(req.query.i || 0);
  const userId = req.query.userId ? String(req.query.userId) : null;
  const attempt = Number(req.query.attempt || 0);
  let type = req.query.type ? String(req.query.type) : null;
  const u = getUnit(unitId);
  if (!u) return res.status(404).json({ ok: false });

  // Lesson type rotation through allowed types if not explicitly given.
  const allowed = lessonTypesForUnit(u);
  if (!type) type = allowed[lessonIndex % allowed.length];
  if (!allowed.includes(type)) type = allowed[0];

  // Per-unit, per-user memory drives difficulty + excludeWords. First-time
  // entry into any unit is ALWAYS 'easy' (per spec).
  const unitMem = userId ? await loadUnitMemory(userId, unitId) : { last10: [], lastDifficulty: 'easy', firstTime: true };
  const difficulty = decideDifficulty(unitMem);
  const exclude = recentWords(unitMem);

  let lesson = await lessonAgent({
    unitId, lessonIndex, type, userId,
    difficulty, excludeWords: exclude, attemptNumber: attempt,
  });
  // Safety net — if the AI returned a payload but with zero items, retry
  // ONCE with a higher attempt counter so the LLM rewords. This prevents
  // the "Card 1 / 0" empty-screen the player otherwise sees when the
  // guardrail drops every item or the model returns a malformed payload.
  if (lesson && Array.isArray(lesson.items) && lesson.items.length === 0) {
    const retried = await lessonAgent({
      unitId, lessonIndex, type, userId,
      difficulty, excludeWords: exclude, attemptNumber: attempt + 1,
    });
    if (retried && Array.isArray(retried.items) && retried.items.length > 0) {
      lesson = retried;
    }
  }
  if (!lesson) return res.json({ ok: false, error: 'generation failed' });
  // Last-ditch: if still empty after retry, return ok:false so the client
  // can show its "couldn't load — try again" affordance instead of a
  // blank lesson card.
  if (Array.isArray(lesson.items) && lesson.items.length === 0) {
    return res.json({ ok: false, error: 'empty lesson — please retry' });
  }
  // STRIP internal difficulty marker before responding — frontend must
  // NOT see the difficulty (per spec). Memory + decision stay backend-only.
  delete lesson._difficulty;
  res.json({ ok: true, lesson, cached: false });
});

// Submit a single answer (legacy bookkeeping — still used by some lessons).
router.post('/api/learn/submit', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId, unitId, lessonIndex, lessonType, correct, responseTimeMs = 0 } = req.body || {};
  if (!userId || !unitId) return res.status(400).json({ ok: false });
  await c.from('wq_learn_attempts').insert({
    user_id: userId,
    unit_id: unitId,
    lesson_index: lessonIndex || 0,
    lesson_type: lessonType || 'unknown',
    correct: !!correct,
    response_time_ms: responseTimeMs,
  });
  res.json({ ok: true });
});

// Record a FULL lesson result. Returns { passed, motivational, threshold }.
// The mobile client uses passed=false to show a Retry button instead of
// advancing. Backend stores the lesson in the user's per-unit last-10 so
// the next lesson's difficulty + excludeWords reflect it.
router.post('/api/learn/lesson-result', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const body = req.body || {};
  const userId = body.userId;
  const unitId = Number(body.unitId);
  const lessonIndex = Number(body.lessonIndex || 0);
  const lessonType = String(body.lessonType || '');
  const correctCount = Number(body.correctCount || 0);
  const totalItems = Number(body.totalItems || 0);
  const lessonPayload = body.lessonPayload || null;       // optional — used to harvest words
  if (!userId || !unitId) return res.status(400).json({ ok: false });

  const passed = didPass(lessonType, correctCount, totalItems);
  const words = lessonPayload ? extractLessonWords(lessonPayload) : [];

  // Update per-unit memory. Difficulty for the NEXT lesson is recomputed
  // on the next /api/learn/lesson call from this freshly-appended entry.
  try {
    const cur = await loadUnitMemory(userId, unitId);
    const nextDifficulty = passed
      ? decideDifficulty({ ...cur, last10: [...cur.last10, { passed: true }], firstTime: false })
      : cur.lastDifficulty || 'easy';
    await recordLessonResult(userId, unitId, {
      lessonType, lessonIndex, words,
      correct: correctCount, total: totalItems,
      passed, difficulty: nextDifficulty,
    });
  } catch (_) {}

  // Kid-safe motivational line for engagement — no points / no rewards.
  const motivational = await motivationalLine({
    userId, kind: passed ? 'lesson-pass' : 'lesson-fail',
    unit: unitId, lessonType, passed,
  });

  res.json({ ok: true, passed, motivational });
});

router.post('/api/learn/complete-unit', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId, unitId } = req.body || {};
  if (!userId || !unitId) return res.status(400).json({ ok: false });
  const p = await ensureProgress(userId);
  const unitsDone = Array.from(new Set([...(p.completed_units || []), Number(unitId)]));
  const nxtId = nextUnitId(unitId) || unitId;
  // No XP, no points — per spec. We still update current_unit_id + the
  // completed_units array so the NEXT unit unlocks on the path screen.
  await c.from('wq_learn_progress').update({
    current_unit_id: nxtId,
    completed_units: unitsDone,
    last_lesson_at: new Date().toISOString(),
  }).eq('user_id', userId);

  const motivational = await motivationalLine({
    userId, kind: 'unit-done', unit: Number(unitId),
  });

  res.json({ ok: true, nextUnitId: nxtId, unitsCompleted: unitsDone, motivational });
});

module.exports = router;
