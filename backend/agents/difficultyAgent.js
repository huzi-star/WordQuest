// difficultyAgent.js
//
// Two modes:
//   1. LEVEL MODE (levelNumber 1-15) — exact config from the level table.
//      No adaptive logic, just the fixed grid/words/time for that level.
//   2. ADAPTIVE / QUICK PLAY — same heuristic as before.
//
// Every call is logged to the agent_logs ring buffer so the admin
// dashboard's live Overview shows this rule-based agent firing in
// real time alongside the LLM-using agents.

const logger = require('../utils/logger');

// Locked-in level table. Sole source of truth for Level Mode.
const LEVEL_CONFIG = {
  1:  { gridSize: 3,  wordCount: 2,  timeLimit: 40 },
  2:  { gridSize: 4,  wordCount: 4,  timeLimit: 40 },
  3:  { gridSize: 5,  wordCount: 4,  timeLimit: 45 },
  4:  { gridSize: 5,  wordCount: 5,  timeLimit: 45 },
  5:  { gridSize: 6,  wordCount: 6,  timeLimit: 60 },
  6:  { gridSize: 6,  wordCount: 7,  timeLimit: 76 },
  7:  { gridSize: 7,  wordCount: 8,  timeLimit: 80 },
  8:  { gridSize: 7,  wordCount: 7,  timeLimit: 80 },
  9:  { gridSize: 8,  wordCount: 7,  timeLimit: 100 },
  10: { gridSize: 8,  wordCount: 8,  timeLimit: 100 },
  11: { gridSize: 9,  wordCount: 8,  timeLimit: 110 },
  12: { gridSize: 9,  wordCount: 9,  timeLimit: 110 },
  13: { gridSize: 10, wordCount: 9,  timeLimit: 120 },
  14: { gridSize: 10, wordCount: 10, timeLimit: 120 },
  15: { gridSize: 12, wordCount: 12, timeLimit: 130 },
};

// Quick Play difficulty bands — unchanged adaptive behaviour.
const ADAPTIVE_CONFIG = {
  easy:   { difficulty: 'easy',   timeLimit: 90, wordCount: 4, gridSize: 6 },
  medium: { difficulty: 'medium', timeLimit: 75, wordCount: 6, gridSize: 8 },
  hard:   { difficulty: 'hard',   timeLimit: 75, wordCount: 8, gridSize: 12 },
};

function levelConfigFor(n) {
  const cfg = LEVEL_CONFIG[n];
  if (!cfg) return null;
  // Difficulty tag is purely informational here so the UI can colour-code.
  const tag = n <= 5 ? 'easy' : n <= 10 ? 'medium' : 'hard';
  return {
    difficulty: tag,
    gridSize: cfg.gridSize,
    wordCount: cfg.wordCount,
    timeLimit: cfg.timeLimit,
    reason: `Level ${n} — ${cfg.gridSize}×${cfg.gridSize} grid, ${cfg.wordCount} words, ${cfg.timeLimit}s.`,
  };
}

function compute(playerStats = {}, options = {}) {
  // LEVEL MODE
  const lvl = Number(options.levelNumber) || 0;
  if (lvl >= 1 && lvl <= 15) {
    return { ...levelConfigFor(lvl), levelNumber: lvl };
  }

  // ADAPTIVE / QUICK PLAY (unchanged)
  const {
    roundsPlayed = 0,
    avgWordsFound = 0,
    avgTimeLeft = 0,
  } = playerStats;

  if (!roundsPlayed || roundsPlayed === 0) {
    return { ...ADAPTIVE_CONFIG.easy, reason: 'Starting easy — small grid to warm up.' };
  }

  const wordsRatio = avgWordsFound / 5;
  const timeRatio = avgTimeLeft / 60;

  if (wordsRatio > 0.8 && timeRatio > 0.4) {
    return { ...ADAPTIVE_CONFIG.hard, reason: 'Dominating performance — bumping to a 12×12 hard grid.' };
  } else if (wordsRatio > 0.5) {
    return { ...ADAPTIVE_CONFIG.medium, reason: 'Solid performance — switching to an 8×8 medium grid.' };
  } else {
    return { ...ADAPTIVE_CONFIG.easy, reason: 'Easy round — a smaller grid to build confidence.' };
  }
}

function difficultyAgent(playerStats = {}, options = {}) {
  const startedAt = Date.now();
  const out = compute(playerStats, options);
  try {
    logger.push({
      agent: 'difficultyAgent', status: 'ok',
      durationMs: Date.now() - startedAt,
      prompt: JSON.stringify({ playerStats, options }).slice(0, 600),
      response: JSON.stringify(out).slice(0, 600),
      meta: {
        tool: 'Local logic',
        decision: `difficulty=${out.difficulty}, grid=${out.gridSize}, words=${out.wordCount}, time=${out.timeLimit}s`,
        reason: out.reason || null,
        fallback: false,
        userId: options.userId || null,
      },
    });
  } catch (_) {}
  return out;
}

module.exports = difficultyAgent;
module.exports.LEVEL_CONFIG = LEVEL_CONFIG;
