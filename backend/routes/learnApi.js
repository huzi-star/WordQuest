// WordQuest Learning Academy — REST API.
//
//   GET  /api/learn/path/:userId          — full skill tree with locks
//   GET  /api/learn/unit/:unitId          — unit metadata + lesson types
//   GET  /api/learn/lesson?unitId=&i=&type= — cached or freshly generated lesson
//   POST /api/learn/submit                — record a single answer
//   POST /api/learn/complete-unit         — mark unit complete, advance to next
//   GET  /api/learn/progress/:userId      — quick progress fetch

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const { UNITS, getUnit, nextUnitId, lessonTypesForUnit, LESSONS_PER_UNIT } = require('../config/curriculum');
const { lessonAgent } = require('../agents/lessonAgent');

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

router.get('/api/learn/lesson', async (req, res) => {
  const unitId = Number(req.query.unitId);
  const lessonIndex = Number(req.query.i || 0);
  let type = req.query.type ? String(req.query.type) : null;
  const u = getUnit(unitId);
  if (!u) return res.status(404).json({ ok: false });

  // If no explicit type, rotate through allowed types deterministically per index.
  const allowed = lessonTypesForUnit(u);
  if (!type) type = allowed[lessonIndex % allowed.length];
  if (!allowed.includes(type)) type = allowed[0];

  const c = client();
  if (c) {
    const { data: cached } = await c
      .from('wq_learn_lesson_cache')
      .select('payload')
      .eq('unit_id', unitId).eq('lesson_index', lessonIndex).eq('lesson_type', type)
      .maybeSingle();
    if (cached?.payload) return res.json({ ok: true, lesson: cached.payload, cached: true });
  }

  const lesson = await lessonAgent({ unitId, lessonIndex, type });
  if (!lesson) return res.json({ ok: false, error: 'generation failed' });
  if (c) {
    await c.from('wq_learn_lesson_cache').upsert({
      unit_id: unitId, lesson_index: lessonIndex, lesson_type: type, payload: lesson,
    }, { onConflict: 'unit_id,lesson_index,lesson_type' });
  }
  res.json({ ok: true, lesson, cached: false });
});

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

router.post('/api/learn/complete-unit', async (req, res) => {
  const c = client(); if (!c) return res.json({ ok: false });
  const { userId, unitId, score = 0 } = req.body || {};
  if (!userId || !unitId) return res.status(400).json({ ok: false });
  const p = await ensureProgress(userId);
  const unitsDone = Array.from(new Set([...(p.completed_units || []), Number(unitId)]));
  const nxtId = nextUnitId(unitId) || unitId;
  const xpGained = 50 + score * 5; // base + per-correct bonus
  await c.from('wq_learn_progress').update({
    current_unit_id: nxtId,
    completed_units: unitsDone,
    total_xp: (p.total_xp || 0) + xpGained,
    last_lesson_at: new Date().toISOString(),
  }).eq('user_id', userId);

  // Also bump the legacy total_score so the player's tier auto-promotes.
  const { data: stats } = await c
    .from('user_stats').select('total_score').eq('user_id', userId).maybeSingle();
  if (stats) {
    await c.from('user_stats').update({
      total_score: (stats.total_score || 0) + xpGained,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }

  res.json({ ok: true, xpGained, nextUnitId: nxtId, unitsCompleted: unitsDone });
});

module.exports = router;
