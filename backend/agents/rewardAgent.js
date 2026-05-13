// rewardAgent.js
// Pure logic — awards badges and produces a summary after each round.

function rewardAgent({
  wordsFound = 0,
  totalWords = 0,
  timeLeft = 0,
  score = 0,
  roundNumber = 1,
  streak = 0,
}) {
  const badges = [];

  if (timeLeft > 45 && wordsFound >= 3) {
    badges.push({ id: 'SPEED_DEMON', name: '⚡ Speed Demon', message: 'Bohot fast ho!' });
  }
  if (totalWords > 0 && wordsFound === totalWords) {
    badges.push({ id: 'PERFECT_ROUND', name: '🎯 Perfect Round', message: 'Sab words dhoondh liye!' });
  }
  if (streak >= 5) {
    badges.push({ id: 'ON_FIRE', name: '🔥 On Fire', message: '5 streak! Kamaal ho!' });
  }
  if (roundNumber >= 10 && score > 1000) {
    badges.push({ id: 'PAKISTAN_EXPERT', name: '🇵🇰 Pakistan Expert', message: 'Tum Pakistan ke expert ho!' });
  }
  if (wordsFound > 0 && wordsFound < totalWords * 0.5) {
    badges.push({ id: 'COMEBACK_KID', name: '💪 Keep Going', message: 'Agli baar aur behtar!' });
  }

  const allFound = totalWords > 0 && wordsFound === totalWords;
  const streakUpdated = allFound ? streak + 1 : 0;

  let encouragement;
  if (allFound) encouragement = 'Mukammal! Tum cricket ke Babar Azam ho!';
  else if (wordsFound >= totalWords / 2) encouragement = 'Acha kaam — agli round aur behtar!';
  else encouragement = 'Koi baat nahi, practice se sab seekh jate hain!';

  let nextRoundPreview;
  if (allFound && timeLeft > 30) nextRoundPreview = 'AI agla round HARD karega — taiyaar raho!';
  else if (wordsFound >= totalWords / 2) nextRoundPreview = 'AI agla round medium difficulty pe rakhega.';
  else nextRoundPreview = 'AI agle round mein easy words dega taa keh confidence build ho.';

  return {
    badges,
    streakUpdated,
    roundSummary: {
      wordsFound,
      totalWords,
      pointsEarned: score,
      timeLeft,
    },
    encouragement,
    nextRoundPreview,
  };
}

module.exports = rewardAgent;
