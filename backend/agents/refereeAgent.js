// refereeAgent.js
// Pure logic — validates a player's word and computes points.

const VALID_MSGS = ['Zabardast! +{x} points', 'Sahi jawab!', 'Wah!'];
const INVALID_MSGS = ['Yeh list mein nahi', 'Dobara try karo'];

function refereeAgent({ word, wordList = [], foundWords = [], timeLeft = 0, score = 0 }) {
  const upper = String(word || '').toUpperCase();
  const list = wordList.map(w => String(w).toUpperCase());
  const found = foundWords.map(w => String(w).toUpperCase());

  const alreadyFound = found.includes(upper);
  const inList = list.includes(upper);

  if (alreadyFound) {
    return {
      isValid: false,
      alreadyFound: true,
      pointsEarned: 0,
      newScore: score,
      message: 'Yeh pehle mil gaya tha!',
      breakdown: { basePoints: 0, timeBonus: 0 },
    };
  }

  if (!inList) {
    return {
      isValid: false,
      alreadyFound: false,
      pointsEarned: 0,
      newScore: score,
      message: INVALID_MSGS[Math.floor(Math.random() * INVALID_MSGS.length)],
      breakdown: { basePoints: 0, timeBonus: 0 },
    };
  }

  const basePoints = upper.length * 10;
  const timeBonus = Math.floor(timeLeft / 10) * 5;
  const totalPoints = basePoints + timeBonus;
  const msgTpl = VALID_MSGS[Math.floor(Math.random() * VALID_MSGS.length)];
  const message = msgTpl.replace('{x}', totalPoints);

  return {
    isValid: true,
    alreadyFound: false,
    pointsEarned: totalPoints,
    newScore: score + totalPoints,
    message,
    breakdown: { basePoints, timeBonus },
  };
}

module.exports = refereeAgent;
