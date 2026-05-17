// commentatorAgent.js
// Live in-round commentary. Gemini-first with template fallbacks so the
// player always sees a milestone comment even if AI is slow.

const { GoogleGenerativeAI } = require('@google/generative-ai');

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function render(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

const TEMPLATES = {
  english: {
    word_found: [
      'Nice find! Keep the streak going.',
      'Sharp eyes — {wordsFound}/{totalWords} now.',
      'Another one down — momentum building!',
    ],
    streak: [
      '{streak} in a row — you are on fire!',
      'Streak {streak}! Multiplier active.',
      'Combo {streak} — keep cooking!',
    ],
    half_time: [
      'Half time! {wordsFound}/{totalWords} found. Push harder.',
      'Halfway done — focus the search.',
    ],
    low_time: [
      'Only {timeLeft}s left — grab anything!',
      'Final stretch — hurry!',
    ],
    idle: [
      'Look across rows AND columns. Diagonals too!',
      'Try starting from a rare letter — like Q or Z.',
      'Stuck? A hint costs only 30 points.',
    ],
  },
  urdu: {
    word_found: [
      'Sahi! Aur {totalWords} mein se {wordsFound} ho gaye.',
      'Acha kaam — momentum bana ke rakho.',
      'Ek aur mil gaya, keep going!',
    ],
    streak: [
      '{streak} in a row — bilkul fire pe ho!',
      'Streak {streak}! Combo multiplier active.',
      'Combo {streak} — kamaal!',
    ],
    half_time: [
      'Half time! {wordsFound}/{totalWords} ho gaye. Speed up.',
      'Aadha time gaya — focus karo.',
    ],
    low_time: [
      'Sirf {timeLeft} second baqi — jaldi karo!',
      'Final stretch — koi bhi word grab karo!',
    ],
    idle: [
      'Letters dhyaan se dekho — diagonals bhi try karo.',
      'Q ya Z jaisa letter dhoondh ke wahan se shuru karo.',
      'Stuck ho? Hint sirf 30 points ka hai.',
    ],
  },
};

function templateFor(trigger, language, vars) {
  const lang = language === 'english' ? 'english' : 'urdu';
  const pool = (TEMPLATES[lang][trigger]) || TEMPLATES[lang].idle;
  return render(pick(pool), vars);
}

async function commentatorAgent({
  trigger = 'idle',
  category = '',
  wordsFound = 0,
  totalWords = 0,
  timeLeft = 0,
  timeLimit = 0,
  streak = 0,
  language = 'english',
}) {
  const vars = { wordsFound, totalWords, timeLeft, timeLimit, streak };
  const fallback = templateFor(trigger, language, vars);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') return { comment: fallback };

  const triggerHint = {
    streak: `Player just hit a streak of ${streak}. Hype them up.`,
    word_found: `Player just found a word, total ${wordsFound}/${totalWords}.`,
    half_time: `Half the round is over. ${wordsFound}/${totalWords} found.`,
    low_time: `Only ${timeLeft}s left. Urgent encouragement.`,
    idle: `Player has not found a word in a while. Tiny tip or motivation.`,
  }[trigger] || 'Encourage briefly.';

  const langInstruction = language === 'urdu'
    ? 'Reply in Roman Urdu mixed with English (Pakistani conversational style).'
    : 'Reply in clear, energetic English.';

  const prompt = `You are an energetic sports commentator inside a word puzzle game.
Category: ${category || 'mixed'}
Words found: ${wordsFound}/${totalWords}
Time left: ${timeLeft}/${timeLimit}s
Streak: ${streak}
Situation: ${triggerHint}

Return ONE short line (max 15 words). ${langInstruction} No quotes, no labels.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 7000)),
    ]);
    const text = (result.response.text() || '').trim().replace(/^["']|["']$/g, '');
    if (!text || text.length > 160) return { comment: fallback };
    return { comment: text };
  } catch (err) {
    return { comment: fallback };
  }
}

module.exports = commentatorAgent;
