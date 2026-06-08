// Practice Mode — unranked, AI-adaptive.
//
// Difficulty escalates on pass, drops on fail. Easy/Medium/Hard differ in
// grid size, word count, time limit. Practice score adds to highScore only
// — totalScoreEver and leaderboard are NEVER touched.

import { client } from './api';

export const PRACTICE_DIFFICULTIES = {
  easy:   { key: 'easy',   label: 'EASY',   color: '#22c55e', gridSize: 6,  wordCount: 5, timeLimit: 75 },
  medium: { key: 'medium', label: 'MEDIUM', color: '#f59e0b', gridSize: 8,  wordCount: 7, timeLimit: 65 },
  hard:   { key: 'hard',   label: 'HARD',   color: '#ef4444', gridSize: 10, wordCount: 8, timeLimit: 65 },
};

// Practice is a pure skill-building mode — no points, no leaderboard.
// Hints scale per difficulty: easy 1 · medium 2 · hard 3 (matches Pakistan
// Quest so the player learns a consistent rule across modes).
export const PRACTICE_HINTS_PER_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

export function nextPracticeDifficulty(current, passed) {
  const order = ['easy', 'medium', 'hard'];
  const idx = order.indexOf(current);
  const safeIdx = idx < 0 ? 0 : idx;
  if (passed) {
    return order[Math.min(order.length - 1, safeIdx + 1)];
  }
  return order[Math.max(0, safeIdx - 1)];
}

export async function fetchPracticeRound({ difficulty, lastCategory = '', playerStats = {}, userId = null }) {
  try {
    const { data } = await client.post('/api/practice/round', {
      difficulty,
      lastCategory,
      language: 'english',
      playerStats,
      // Thread userId so the backend guardrail's last-80-items repeat
      // window has per-kid context AND can block recently-seen science
      // words from leaking back in.
      userId,
    });
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
