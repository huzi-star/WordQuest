// commentatorAgent.js
// Live in-round commentary. Gemini sees the player's current state and
// writes a short hype-y / coaching one-liner. Falls back to canned lines
// when Gemini is offline or slow.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const FALLBACKS = {
  streak: [
    'Streak {streak}! Tum on fire ho 🔥',
    '{streak} in a row! Bilkul Babar mode mein!',
    '{streak} streak — combo multiplier active!',
  ],
  half_time: [
    'Half time! {found}/{total} ho gaye. Speed up!',
    'Aadha time gaya — focus karo!',
  ],
  low_time: [
    '15 second baqi! Jaldi karo!',
    'Time ki kami — koi bhi word grab karo!',
  ],
  idle: [
    'Letters dhyaan se dekho — line mein hi search karo.',
    'Kahin pe stuck ho gaye? Pehla letter pakar ke try karo.',
    'Cells horizontal aur vertical mein hi connect hote hain.',
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function render(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

async function commentatorAgent({
  trigger = 'idle',
  category = '',
  wordsFound = 0,
  totalWords = 0,
  timeLeft = 0,
  timeLimit = 0,
  streak = 0,
}) {
  const vars = { wordsFound, totalWords, timeLeft, timeLimit, streak, found: wordsFound, total: totalWords };
  const fallbackPool = FALLBACKS[trigger] || FALLBACKS.idle;
  const fallback = render(pick(fallbackPool), vars);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') return { comment: fallback };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const triggerHint = {
      streak: `Player just hit a streak of ${streak}. Hype them up.`,
      half_time: `Half the round is over. ${wordsFound}/${totalWords} found.`,
      low_time: `Only ${timeLeft}s left. Urgent encouragement.`,
      idle: `Player hasn't found a word in a while. Give a tiny hint or motivation.`,
    }[trigger] || 'Encourage briefly.';

    const prompt = `You are a Pakistani sports commentator inside a word puzzle game.
Category: ${category || 'Pakistan-themed'}
Words found: ${wordsFound}/${totalWords}
Time left: ${timeLeft}/${timeLimit}s
Streak: ${streak}
Situation: ${triggerHint}

Return ONE short, energetic line (max 15 words). Mix Urdu + English casually
("Roman Urdu") like a cricket commentator. No quotes, no labels. Just the line.`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');
    if (!text || text.length > 140) return { comment: fallback };
    return { comment: text };
  } catch (err) {
    return { comment: fallback };
  }
}

module.exports = commentatorAgent;
