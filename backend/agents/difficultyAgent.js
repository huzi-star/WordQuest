// difficultyAgent.js
// Pure logic agent — decides next-round difficulty from player stats.

function difficultyAgent(playerStats = {}) {
  const {
    roundsPlayed = 0,
    avgWordsFound = 0,
    avgTimeLeft = 0,
  } = playerStats;

  // First round defaults
  if (!roundsPlayed || roundsPlayed === 0) {
    return {
      difficulty: 'easy',
      timeLimit: 90,
      wordCount: 4,
      gridSize: 8,
      reason: 'Pehla round — easy se shuru karte hain!',
    };
  }

  // We don't know totalWords historically — assume the agent ran with the
  // wordCount used in the previous round category. Use a reasonable
  // denominator of 5 for ratio calculations as a rolling average baseline.
  const assumedTotal = 5;
  const assumedTime = 60;

  const wordsRatio = avgWordsFound / assumedTotal;
  const timeRatio = avgTimeLeft / assumedTime;

  if (wordsRatio > 0.8 && timeRatio > 0.4) {
    return {
      difficulty: 'hard',
      timeLimit: 45,
      wordCount: 6,
      gridSize: 8,
      reason: 'Tumne zyada words dhoondhe — ab hard!',
    };
  } else if (wordsRatio > 0.5) {
    return {
      difficulty: 'medium',
      timeLimit: 60,
      wordCount: 5,
      gridSize: 8,
      reason: 'Acha performance — medium level',
    };
  } else {
    return {
      difficulty: 'easy',
      timeLimit: 90,
      wordCount: 4,
      gridSize: 8,
      reason: 'Practice karo — easy level',
    };
  }
}

module.exports = difficultyAgent;
