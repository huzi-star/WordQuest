// server.js
// WordQuest Pakistan — Express backend orchestrating 4 agents.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const difficultyAgent = require('./agents/difficultyAgent');
const levelGeneratorAgent = require('./agents/levelGeneratorAgent');
const refereeAgent = require('./agents/refereeAgent');
const rewardAgent = require('./agents/rewardAgent');
const tutorAgent = require('./agents/tutorAgent');
const commentatorAgent = require('./agents/commentatorAgent');
const coachAgent = require('./agents/coachAgent');
const chaalbaazAgent = require('./agents/chaalbaazAgent');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({
    name: 'WordQuest Pakistan Backend',
    status: 'ok',
    endpoints: ['/api/health', '/api/generate-level', '/api/validate-word', '/api/round-complete'],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Agent observability — Supabase-backed trace console + JSON API
app.use(require('./routes/logsDashboard'));

// Game-wide event ingest (mobile POSTs every meaningful action here) +
// the new tabbed Game Trace Dashboard at /dashboard.
app.use(require('./routes/eventApi'));
app.use(require('./routes/gameDashboard'));

// Premium admin dashboard at /admin — Lattice-inspired, per-user drill-down.
app.use(require('./routes/adminDashboard'));

// WordQuest Kids — vocabulary tier game (new product, /api/kids/*)
app.use(require('./routes/kidsApi'));

// Tier system + word-detail card + tier leaderboards
app.use(require('./routes/tierApi'));

// 1v1 real-time battle (matchmaking + match polling + result + MMR)
app.use(require('./routes/battleApi'));

// Learning Academy — 32-unit curriculum + AI-generated lessons
app.use(require('./routes/learnApi'));

// Subscription / pricing system (Free / Pro / Pro Max)
app.use(require('./routes/subscriptionApi'));

// Practice Mode — unranked AI-adaptive word search
app.use(require('./routes/practiceApi'));

// Pro Max — AI Tutor 1-on-1 chat
app.use(require('./routes/tutorApi'));

// Pro Max — Parent dashboard + family profiles
app.use(require('./routes/parentApi'));

// (Personalized Learning Path Agent retired.)

// Pakistan Culture Quest Pack — curated PK-themed word puzzles +
// bilingual learning notes (English + Roman Urdu).
app.use(require('./routes/pakistanQuestApi'));

// Safety Guardrail Agent — pre-display validation layer that EVERY AI
// output (words, quiz, tutor, messages) passes through. Blocks offensive,
// non-age-appropriate, too-difficult, repeated content.
app.use(require('./routes/guardrailApi'));

function dedupeLevel(level) {
  if (!level) return level;
  const seen = new Set();
  const words = [];
  for (const w of level.words || []) {
    const u = String(w).toUpperCase();
    if (!seen.has(u)) {
      seen.add(u);
      words.push(u);
    }
  }
  const posSeen = new Set();
  const positions = [];
  for (const p of level.wordPositions || []) {
    const u = String(p.word).toUpperCase();
    if (seen.has(u) && !posSeen.has(u)) {
      posSeen.add(u);
      positions.push({ ...p, word: u });
    }
  }
  return { ...level, words, wordPositions: positions };
}

app.post('/api/generate-level', async (req, res) => {
  try {
    const {
      playerStats = {},
      language = 'english',
      levelNumber = 0,
      // Tier from the caller — for Quick Play, this is the SOURCE OF TRUTH
      // and overrides whatever difficultyAgent picks.
      tier = null,
      // Level-Mode retry / reshuffle parameters.
      reshuffleWords = null,
      reshuffleCategory = '',
      reshuffleEmoji = '',
      reshuffleFunFact = '',
      userId = null,
    } = req.body || {};
    let difficulty;
    let chaalbaazActive = false;
    let chaalbaazIntro = null;

    // Look up tier puzzle config if a tier was supplied.
    const TIER_CFG = require('./config/tiers');
    const tierObj = tier ? TIER_CFG.TIERS.find((t) => t.key === tier) : null;

    if (levelNumber > 0) {
      // Level Mode — use the locked level table; no adaptive logic.
      difficulty = difficultyAgent({}, { levelNumber });
    } else if (tierObj?.puzzle) {
      // Quick Play with a tier — DIFFICULTY IS LOCKED TO TIER.
      //
      // Per latest spec, while the player stays inside a tier the
      // difficulty must NOT change between rounds. Only the words
      // change (which happens naturally via fresh AI generation each
      // call). Bumping the grid mid-tier (the old Chaalbaaz path) was
      // breaking the "Bronze should always feel easy" promise.
      //
      // Tier rank → difficulty band (per latest spec):
      //   Bronze (1)   → easy
      //   Silver (2)   → medium
      //   Gold (3)     → hard
      //   Platinum (4) → hard   (grid + wordCount keep scaling via puzzle config)
      //   Diamond (5)  → hard   (further scaling)
      //   Elite (6)    → hard   (further scaling)
      //   Master (7)   → hard   (max scaling)
      // The "further scaling above Gold" requirement is satisfied by the
      // per-tier puzzle config (gridSize 8→12, wordCount 6→10, timeLimit
      // 70→40, minLen/maxLen tightening) — only the difficulty BAND
      // string stays at 'hard' so the LLM keeps generating challenging
      // but kid-safe vocabulary while the puzzle structure escalates.
      const tierBand = tierObj.rank === 1 ? 'easy'
        : tierObj.rank === 2 ? 'medium' : 'hard';
      // Run difficultyAgent for TELEMETRY ONLY so it appears in the
      // admin pipeline alongside the tier-locked decision. We ignore its
      // output (tier puzzle config wins) but the log entry it emits
      // makes the pipeline show difficultyAgent → levelGeneratorAgent
      // in correct chronological order.
      try { difficultyAgent(playerStats || {}, { userId }); } catch (_) {}
      difficulty = {
        difficulty: tierBand,
        timeLimit: tierObj.puzzle.timeLimit,
        wordCount: tierObj.puzzle.wordCount,
        gridSize: tierObj.puzzle.gridSize,
        pointsPerWord: tierObj.puzzle.pointsPerWord,
        tier: tierObj.key,
        reason: `${tierObj.name} tier — locked at ${tierBand} (${tierObj.puzzle.gridSize}×${tierObj.puzzle.gridSize}, ${tierObj.puzzle.wordCount} words, ${tierObj.puzzle.timeLimit}s). New words every round.`,
      };
      // Chaalbaaz INTRO modal — fires only when the band is HARD AND the
      // player has been dominating (Gold+ tier, hot streak, etc.). The
      // modal pauses the user on the preview screen until they tap
      // Continue, then the hard level begins.
      if (tierBand === 'hard' && chaalbaazAgent.isPlayerDominating(playerStats || {}, tierObj.puzzle)) {
        try {
          const intro = await chaalbaazAgent({ mode: 'intro', playerStats, difficulty, userId });
          if (intro && intro.active) {
            chaalbaazActive = true;
            chaalbaazIntro = intro;
          }
        } catch (_) {}
      }
    } else {
      // Quick Play with no tier — legacy adaptive path (kept for fallback).
      difficulty = difficultyAgent(playerStats);
      const bump = await chaalbaazAgent({ mode: 'tune', playerStats, baseDifficulty: difficulty });
      if (bump) {
        difficulty = { ...difficulty, ...bump };
        chaalbaazActive = true;
        try {
          const intro = await chaalbaazAgent({ mode: 'intro', playerStats, difficulty, userId });
          if (intro && intro.active) chaalbaazIntro = intro;
        } catch (_) {}
      }
    }

    // Guardrail-driven regeneration loop. The level generator already
    // routes its output through the safety guardrail (no offensive, no
    // age-inappropriate, no over-difficulty, no per-user repeats). If
    // the guardrail strips words, the agent ships fewer than the tier's
    // target wordCount. We retry up to 2 more times — each attempt
    // varies category (lastCategory rotation) — so the kid always gets
    // a full, kid-safe, repeat-free puzzle.
    const targetWordCount = difficulty.wordCount || 0;
    let rawLevel = null;
    let lastSeenCategory = playerStats.lastCategory || '';
    for (let regenAttempt = 0; regenAttempt < 3; regenAttempt++) {
      rawLevel = await levelGeneratorAgent({
        ...difficulty,
        tier,
        lastCategory: lastSeenCategory,
        language,
        levelNumber,
        reshuffleWords: regenAttempt === 0 ? reshuffleWords : null,
        reshuffleCategory,
        reshuffleEmoji,
        reshuffleFunFact,
        userId,
      });
      const wordsOk = Array.isArray(rawLevel?.words) && rawLevel.words.length >= Math.max(2, targetWordCount);
      if (wordsOk) break;
      // Rotate category so the next attempt explores a different pool.
      lastSeenCategory = rawLevel?.category || lastSeenCategory;
    }
    const level = dedupeLevel(rawLevel);
    res.json({
      ok: true,
      difficulty,
      level,
      chaalbaazActive,
      chaalbaazIntro,
      levelNumber,
    });
  } catch (err) {
    console.error('generate-level error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/validate-word', (req, res) => {
  try {
    const result = refereeAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('validate-word error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/explain-word', async (req, res) => {
  try {
    const result = await tutorAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('explain-word error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/commentary', async (req, res) => {
  try {
    const body = req.body || {};
    // Pass userId so guardrail's repeat-detection has context across the
    // player's last 80 lines and the same commentary never recurs.
    const result = await commentatorAgent({ ...body, userId: body.userId });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('commentary error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/coach', async (req, res) => {
  try {
    const result = await coachAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('coach error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/chat-chaalbaaz', async (req, res) => {
  try {
    const result = await chaalbaazAgent({ ...(req.body || {}), mode: 'chat' });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('chaalbaaz error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/round-complete', async (req, res) => {
  try {
    const body = req.body || {};
    // Thread userId into rewardAgent so its guardrail repeat-detection
    // remembers the last 80 encouragement lines and never recycles them
    // for the same kid in two consecutive rounds.
    const result = await rewardAgent({ ...body, userId: body.userId });
    // Chaalbaaz Agent — playful post-round one-liner. Fires alongside
    // reward so the agent pipeline surfaces it every round across Quick
    // Play / Practice / Pakistan Quest. Tier difficulty is NOT bumped;
    // chat-style flavour only. Runs fire-and-forget so a failure here
    // never blocks the actual round-end reward response.
    chaalbaazAgent({
      mode: 'chat',
      userId: body.userId,
      message: body.wordsFound >= (body.totalWords || 0)
        ? `Just cleared a ${body.totalWords || 0}-word round.`
        : `Found ${body.wordsFound || 0} of ${body.totalWords || 0} words.`,
      context: { trigger: 'round-end', mode: body.mode || 'quick-play' },
    }).catch(() => {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('round-complete error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Local dev: start a listener. On Vercel (serverless), just export the app.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎮 WordQuest backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
