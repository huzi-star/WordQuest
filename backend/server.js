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
      // Level-Mode retry / reshuffle parameters.
      reshuffleWords = null,
      reshuffleCategory = '',
      reshuffleEmoji = '',
      reshuffleFunFact = '',
    } = req.body || {};
    let difficulty;
    let chaalbaazActive = false;

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
    } else {
      // Quick Play — adaptive difficulty (unchanged).
      difficulty = difficultyAgent(playerStats);
      const chaalbaazTune = await chaalbaazAgent({ mode: 'tune', playerStats });
      if (chaalbaazTune) {
        difficulty = { ...difficulty, ...chaalbaazTune };
        chaalbaazActive = true;
      }
    }

    const rawLevel = await levelGeneratorAgent({
      ...difficulty,
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
