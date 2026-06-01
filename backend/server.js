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
const quizAgent = require('./agents/quizAgent');

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

// Pro Max — AI Tutor 1-on-1 chat
app.use(require('./routes/tutorApi'));

// Pro Max — Parent dashboard + family profiles
app.use(require('./routes/parentApi'));

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
      dailySeed = null,
      // Tier from the caller — for Quick Play, this is the SOURCE OF TRUTH
      // and overrides whatever difficultyAgent picks.
      tier = null,
      // Level-Mode retry / reshuffle parameters.
      reshuffleWords = null,
      reshuffleCategory = '',
      reshuffleEmoji = '',
      reshuffleFunFact = '',
    } = req.body || {};
    let difficulty;
    let chaalbaazActive = false;

    // Look up tier puzzle config if a tier was supplied.
    const TIER_CFG = require('./config/tiers');
    const tierObj = tier ? TIER_CFG.TIERS.find((t) => t.key === tier) : null;

    if (dailySeed) {
      // Daily Challenge — ALWAYS 10×10 grid, 10 words, 100s. Static.
      difficulty = {
        difficulty: 'hard',
        timeLimit: 100,
        wordCount: 10,
        gridSize: 10,
        reason: 'Daily Challenge — 10×10 grid, 10 words, 100s.',
        isDaily: true,
      };
    } else if (levelNumber > 0) {
      // Level Mode — use the locked level table; no adaptive logic.
      difficulty = difficultyAgent({}, { levelNumber });
    } else if (tierObj?.puzzle) {
      // Quick Play with a tier — TIER IS THE SOURCE OF TRUTH.
      difficulty = {
        difficulty: tierObj.rank <= 2 ? 'easy' : tierObj.rank <= 5 ? 'medium' : 'hard',
        timeLimit: tierObj.puzzle.timeLimit,
        wordCount: tierObj.puzzle.wordCount,
        gridSize: tierObj.puzzle.gridSize,
        pointsPerWord: tierObj.puzzle.pointsPerWord,
        tier: tierObj.key,
        reason: `${tierObj.name} tier — ${tierObj.puzzle.gridSize}×${tierObj.puzzle.gridSize} grid, ${tierObj.puzzle.wordCount} words, ${tierObj.puzzle.timeLimit}s.`,
      };
    } else {
      // Quick Play with no tier — fall back to adaptive difficulty (legacy).
      difficulty = difficultyAgent(playerStats);
      const chaalbaazTune = await chaalbaazAgent({ mode: 'tune', playerStats });
      if (chaalbaazTune) {
        difficulty = { ...difficulty, ...chaalbaazTune };
        chaalbaazActive = true;
      }
    }

    const rawLevel = await levelGeneratorAgent({
      ...difficulty,
      tier,
      lastCategory: playerStats.lastCategory || '',
      language,
      levelNumber,
      dailySeed,
      reshuffleWords,
      reshuffleCategory,
      reshuffleEmoji,
      reshuffleFunFact,
    });
    const level = dedupeLevel(rawLevel);
    res.json({
      ok: true,
      difficulty,
      level,
      chaalbaazActive,
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
    const result = await commentatorAgent(req.body || {});
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
    const result = await rewardAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('round-complete error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const result = await quizAgent(req.body || {});
    if (result && result.ok === false) {
      // Bubble up the AI failure to the client so it can show a real error
      // instead of an empty quiz screen.
      return res.status(503).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('quiz error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Local dev: start a listener. On Vercel (serverless), just export the app.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎮 WordQuest backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
