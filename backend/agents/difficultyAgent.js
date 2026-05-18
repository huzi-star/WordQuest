// difficultyAgent.js
// Pure logic agent — decides next-round difficulty from player stats.
// Grid size also scales with difficulty:
//   easy   → 6x6  (smaller, fewer words, beginner-friendly)
//   medium → 8x8  (balanced)
//   hard   → 12x12 (bigger, more words, longer words allowed)

const DIFFICULTY_CONFIG = {
  easy:   { difficulty: 'easy',   timeLimit: 90, wordCount: 4, gridSize: 6 },
  medium: { difficulty: 'medium', timeLimit: 75, wordCount: 6, gridSize: 8 },
  hard:   { difficulty: 'hard',   timeLimit: 75, wordCount: 8, gridSize: 12 },
};

function difficultyAgent(playerStats = {}) {
  const {
    roundsPlayed = 0,
    avgWordsFound = 0,
    avgTimeLeft = 0,
  } = playerStats;

  // First round → easy.
  if (!roundsPlayed || roundsPlayed === 0) {
    return {
      ...DIFFICULTY_CONFIG.easy,
      reason: 'Pehla round — chhota grid se shuru karte hain!',
    };
  }

  // Performance heuristic — assume a baseline of 5 words & 60 s.
  const wordsRatio = avgWordsFound / 5;
  const timeRatio = avgTimeLeft / 60;

  if (wordsRatio > 0.8 && timeRatio > 0.4) {
    return {
      ...DIFFICULTY_CONFIG.hard,
      reason: 'Tum bohot acha kar rahe ho — 12x12 grid, hard mode!',
    };
  } else if (wordsRatio > 0.5) {
    return {
      ...DIFFICULTY_CONFIG.medium,
      reason: 'Acha performance — 8x8 grid, medium level',
    };
  } else {
    return {
      ...DIFFICULTY_CONFIG.easy,
      reason: 'Practice karo — chhota 6x6 grid, easy words',
    };
  }
}

module.exports = difficultyAgent;
