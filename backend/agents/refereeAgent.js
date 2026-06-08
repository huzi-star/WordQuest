// refereeAgent.js
// Pure logic — validates a player's word and computes points. Logs every
// decision to agent_logs so the admin dashboard's live feed reflects
// each word the kid tries in real time.

const logger = require('../utils/logger');

const VALID_MSGS = ['Zabardast! +{x} points', 'Sahi jawab!', 'Wah!'];
const INVALID_MSGS = ['Yeh list mein nahi', 'Dobara try karo'];

function comboMultiplier(streak) {
  if (streak >= 6) return 3;
  if (streak >= 4) return 2;
  if (streak >= 2) return 1.5;
  return 1;
}

function refereeAgent({ word, wordList = [], foundWords = [], timeLeft = 0, score = 0, streak = 0, userId = null }) {
  const startedAt = Date.now();
  const upper = String(word || '').toUpperCase();
  const list = wordList.map(w => String(w).toUpperCase());
  const found = foundWords.map(w => String(w).toUpperCase());
  function log(out, decision) {
    try {
      logger.push({
        agent: 'refereeAgent', status: 'ok',
        durationMs: Date.now() - startedAt,
        prompt: JSON.stringify({ word: upper, wordListSize: list.length, foundCount: found.length, timeLeft, score, streak }).slice(0, 600),
        response: JSON.stringify(out).slice(0, 600),
        meta: { tool: 'Local dictionary', decision, reason: out.message || null, fallback: false, userId },
      });
    } catch (_) {}
    return out;
  }

  const alreadyFound = found.includes(upper);
  const inList = list.includes(upper);

  if (alreadyFound) {
    return log({
      isValid: false, alreadyFound: true, pointsEarned: 0, newScore: score,
      message: 'Yeh pehle mil gaya tha!',
      breakdown: { basePoints: 0, timeBonus: 0, multiplier: 1 },
    }, `REJECT "${upper}" — already found`);
  }

  if (!inList) {
    return log({
      isValid: false, alreadyFound: false, pointsEarned: 0, newScore: score,
      message: INVALID_MSGS[Math.floor(Math.random() * INVALID_MSGS.length)],
      breakdown: { basePoints: 0, timeBonus: 0, multiplier: 1 },
    }, `REJECT "${upper}" — not in word list`);
  }

  // Streak passed in reflects the streak BEFORE this word lands; +1 because
  // landing this word makes it the (streak+1)th consecutive hit.
  const effectiveStreak = streak + 1;
  const multiplier = comboMultiplier(effectiveStreak);
  const basePoints = upper.length * 10;
  const timeBonus = Math.floor(timeLeft / 10) * 5;
  const totalPoints = Math.floor((basePoints + timeBonus) * multiplier);
  const msgTpl = VALID_MSGS[Math.floor(Math.random() * VALID_MSGS.length)];
  const message = msgTpl.replace('{x}', totalPoints);

  return log({
    isValid: true, alreadyFound: false, pointsEarned: totalPoints,
    newScore: score + totalPoints, message,
    breakdown: { basePoints, timeBonus, multiplier, effectiveStreak },
  }, `ACCEPT "${upper}" +${totalPoints} pts (×${multiplier} combo)`);
}

module.exports = refereeAgent;
