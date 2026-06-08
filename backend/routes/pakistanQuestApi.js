// pakistanQuestApi.js — Pakistan Culture Quest Pack endpoints.
//
//   GET  /api/pakistan-quest/categories      — list available categories
//   POST /api/pakistan-quest/level           — generate a Pakistan-themed
//                                              puzzle (curated word pool)
//   GET  /api/pakistan-quest/note/:word      — short learning note for a
//                                              word (English + Roman Urdu)

const express = require('express');
const router = express.Router();
const levelGeneratorAgent = require('../agents/levelGeneratorAgent');
const { CATEGORIES, WORD_INDEX, pickWords } = require('../config/pakistanPack');
const { insertLog } = require('../utils/supabaseLogger');
const { guardText, guardArray } = require('../utils/guardrailRunner');
const PKQuest = require('../utils/pakistanQuestMemory');

function traceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Difficulty → grid + count + length window. Kept here as the legacy table
// the old code referenced; PKQuest.DIFFICULTY_CFG is the source of truth
// now (per-section adaptive picker reads from that map).
const DIFFICULTY = PKQuest.DIFFICULTY_CFG;

router.get('/api/pakistan-quest/categories', (req, res) => {
  res.json({
    ok: true,
    categories: CATEGORIES.map((c) => ({
      key: c.key, name: c.name, emoji: c.emoji,
      description: c.description, wordCount: c.words.length,
    })),
  });
});

// Adaptive level: client just supplies userId + category. The server
// reads this user's per-section memory (last 10 games for that exact
// category), decides difficulty, and picks words that haven't been shown
// in the last 10 rounds (allowing ≤10% old words once the unseen pool
// runs dry). Every other section's difficulty + memory is left alone —
// the seven categories adapt independently.
router.post('/api/pakistan-quest/level', async (req, res) => {
  const started = Date.now();
  const id = traceId();
  const body = req.body || {};
  const userId = body.userId || null;
  const categoryKey = String(body.category || 'cities').toLowerCase();
  const cat = CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return res.status(404).json({ ok: false, error: 'unknown category' });

  // 1) Load this player's memory for THIS section only.
  const { mem } = await PKQuest.loadMemory(userId);
  const sectionMem = mem.sections[categoryKey] || { last10: [], lastDifficulty: null };

  // 2) Adaptive difficulty — pass bumps up, fail drops down, cold start = easy.
  //    Mobile may still pass an override (e.g. for a manual "retry harder"
  //    button later). If absent, the ladder decides.
  const overrideDiff = body.difficulty ? String(body.difficulty).toLowerCase() : null;
  const difficulty = (overrideDiff && PKQuest.DIFF_ORDER.includes(overrideDiff))
    ? overrideDiff
    : PKQuest.decideDifficulty(sectionMem);
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.easy;

  // 3) Smart word pick — last-10 repeats hidden, ≤10% old words allowed
  //    once unseen pool dries up. Guardrail re-checks every word.
  const { words } = await PKQuest.pickWordsForRound({ userId, categoryKey, difficulty, sectionMem });
  if (!words || words.length < 2) {
    return res.status(400).json({ ok: false, error: 'not enough safe words for that section' });
  }

  try {
    const level = await levelGeneratorAgent({
      difficulty, wordCount: words.length, gridSize: cfg.gridSize,
      language: 'english',
      reshuffleWords: words,
      reshuffleCategory: cat.name,
      reshuffleEmoji: cat.emoji,
      reshuffleFunFact: cat.description,
      forceCategory: cat.name,
      forceCategoryEmoji: cat.emoji,
      userId,
    });

    // CRITICAL CONSISTENCY GATE — the word list shown to the kid MUST be
    // exactly the words actually placed in the grid. The levelGenerator
    // returns `words: positions.map(p => p.word)` so that's the truth.
    // We DO NOT override it with the originally requested list (which is
    // the bug the user reported — Cities word visible but not in grid).
    const placedWords = Array.isArray(level.words) ? level.words : [];
    if (!placedWords.length) {
      throw new Error(`levelGenerator returned a puzzle with zero placed words for ${cat.name}/${difficulty}`);
    }
    // Independent trace verification — for each placed word, walk the
    // grid along the recorded direction and confirm every letter matches.
    // Catches any latent bug between generator and route.
    const traceIssues = [];
    if (Array.isArray(level.wordPositions) && Array.isArray(level.grid)) {
      const size = level.grid.length;
      const DIR = { horizontal: { dr: 0, dc: 1 }, vertical: { dr: 1, dc: 0 }, diagonalDR: { dr: 1, dc: 1 }, diagonalDL: { dr: 1, dc: -1 } };
      for (const p of level.wordPositions) {
        const d = DIR[p.direction];
        if (!d) { traceIssues.push(`${p.word}: bad direction ${p.direction}`); continue; }
        for (let i = 0; i < p.word.length; i++) {
          const r = p.startRow + d.dr * i;
          const c = p.startCol + d.dc * i;
          if (r < 0 || c < 0 || r >= size || c >= size) { traceIssues.push(`${p.word}: out-of-bounds at idx ${i}`); break; }
          if (level.grid[r][c] !== p.word[i]) { traceIssues.push(`${p.word}: letter mismatch at idx ${i} (grid=${level.grid[r][c]} expected=${p.word[i]})`); break; }
        }
      }
    } else {
      traceIssues.push('missing grid or wordPositions in level payload');
    }
    if (traceIssues.length) {
      // Hard fail — never ship an unsolvable puzzle to the kid.
      throw new Error('Grid/word trace validation failed: ' + traceIssues.join(' | '));
    }

    const out = {
      ok: true,
      level: {
        ...level,
        // Use the PLACED words, not the originally requested list. This
        // guarantees every word in the list is findable in the grid.
        words: placedWords,
        category: cat.name,
        categoryKey: cat.key,
        emoji: cat.emoji,
        funFact: cat.description,
        difficulty,
        timeLimit: cfg.timeLimit,
      },
      difficulty: { ...cfg, difficulty },
      adaptive: {
        chosenDifficulty: difficulty,
        priorGames: (sectionMem.last10 || []).length,
        reason: !sectionMem.last10 || !sectionMem.last10.length
          ? 'Cold start — every section begins on Easy.'
          : sectionMem.last10[sectionMem.last10.length - 1].passed
            ? 'Passed the last round in this section — bumping up.'
            : 'Failed the last round in this section — easing back down.',
      },
      pack: 'pakistan-culture',
    };
    insertLog({
      id, agent: 'pakistanQuestAgent', status: 'ok',
      durationMs: Date.now() - started, model: null,
      prompt: JSON.stringify({ category: categoryKey, difficulty, requested: words, priorGames: (sectionMem.last10 || []).length }),
      response: JSON.stringify({ placedWords, category: cat.name, chosenDifficulty: difficulty, traced: true }),
      meta: {
        userId,
        decision: `built ${cat.name} · ${difficulty} · ${placedWords.length}/${words.length} words placed on grid`,
        reason: `PK Quest · ${cat.name} · ${difficulty} · ${placedWords.length}/${words.length} placed · trace-validated.`,
        tool: 'pakistanQuestMemory + Curated PK pack + levelGeneratorAgent + grid-trace-validator',
      },
    });
    res.json(out);
  } catch (err) {
    insertLog({ id, agent: 'pakistanQuestAgent', status: 'error', durationMs: Date.now() - started, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mobile pings this when the player's Pakistan-Quest round ends (pass or
// fail). It appends the result to the section's last-10 window, which is
// what `/level` reads next time to pick difficulty + suppress repeats.
router.post('/api/pakistan-quest/result', async (req, res) => {
  const started = Date.now();
  const id = traceId();
  const body = req.body || {};
  const userId = body.userId || null;
  const categoryKey = String(body.category || '').toLowerCase();
  const difficulty = String(body.difficulty || 'easy').toLowerCase();
  const passed = !!body.passed;
  const words = Array.isArray(body.words) ? body.words : [];

  if (!userId) return res.json({ ok: true, skipped: 'anonymous' });
  if (!CATEGORIES.find((c) => c.key === categoryKey)) {
    return res.status(400).json({ ok: false, error: 'unknown category' });
  }

  try {
    // Pakistan Quest is a pure learning mode — no score is tracked.
    const updated = await PKQuest.recordResult({ userId, categoryKey, difficulty, passed, words });
    const nextDifficulty = PKQuest.decideDifficulty(updated || { last10: [], lastDifficulty: difficulty });
    insertLog({
      id, agent: 'pakistanQuestAgent', status: 'ok',
      durationMs: Date.now() - started, model: null,
      prompt: 'result(' + categoryKey + ', ' + difficulty + ', ' + (passed ? 'pass' : 'fail') + ')',
      response: JSON.stringify({ recorded: true, nextDifficulty }),
      meta: {
        userId,
        decision: `${passed ? 'PASS' : 'FAIL'} recorded · next round = ${nextDifficulty}`,
        reason: `PK Quest · ${categoryKey} · ${passed ? 'PASS' : 'FAIL'} on ${difficulty}. Next pick: ${nextDifficulty}.`,
        tool: 'pakistanQuestMemory.recordResult',
      },
    });
    res.json({ ok: true, nextDifficulty, last10Count: (updated?.last10 || []).length });
  } catch (err) {
    insertLog({ id, agent: 'pakistanQuestAgent', status: 'error', durationMs: Date.now() - started, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/pakistan-quest/note/:word', async (req, res) => {
  const started = Date.now();
  const id = traceId();
  const W = String(req.params.word || '').toUpperCase();
  const language = String(req.query.lang || 'en').toLowerCase();
  const entry = WORD_INDEX[W];
  if (!entry) {
    insertLog({
      id, agent: 'pakistanTutorAgent', status: 'error',
      durationMs: Date.now() - started, model: null,
      prompt: 'note(' + W + ')',
      error: 'word not in pack',
      meta: { reason: 'Word not part of Pakistan Quest pack.', tool: 'Curated PK pack' },
    });
    return res.status(404).json({ ok: false, error: 'word not in Pakistan pack' });
  }
  let note = language === 'ur' || language === 'urdu' ? entry.ur : entry.en;
  // SAFETY GUARDRAIL — defence-in-depth for the curated notes.
  const safeNote = await guardText(note, 'tutor', { ageGroup: 'kid', allowList: [W] });
  if (safeNote === null) {
    return res.status(403).json({ ok: false, error: 'note blocked by safety guardrail' });
  }
  note = safeNote;
  insertLog({
    id, agent: 'pakistanTutorAgent', status: 'ok',
    durationMs: Date.now() - started, model: null,
    prompt: 'note(' + W + ', ' + language + ')',
    response: JSON.stringify({ note, language }),
    meta: {
      decision: `served ${language === 'ur' ? 'Urdu' : 'English'} note for "${W}"`,
      reason: `Served pre-curated ${language === 'ur' ? 'Roman Urdu' : 'English'} learning note for "${W}".`,
      tool: 'Curated PK pack (no LLM call)',
    },
  });
  res.json({
    ok: true,
    word: W,
    category: entry.category,
    note,
    bilingual: { en: entry.en, ur: entry.ur },
  });
});

module.exports = router;
