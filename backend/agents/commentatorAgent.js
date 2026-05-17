// commentatorAgent.js
// Live in-round commentary. Gemini sees the player's current state and
// writes a short hype-y / coaching one-liner. Falls back to canned lines
// when Gemini is offline or slow.

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function commentatorAgent({
  trigger = 'idle',
  category = '',
  wordsFound = 0,
  totalWords = 0,
  timeLeft = 0,
  timeLimit = 0,
  streak = 0,
  language = 'urdu',
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') return { comment: '' };

  const triggerHint = {
    streak: `Player just hit a streak of ${streak}. Hype them up.`,
    half_time: `Half the round is over. ${wordsFound}/${totalWords} found.`,
    low_time: `Only ${timeLeft}s left. Urgent encouragement.`,
    idle: `Player hasn't found a word in a while. Give a tiny motivation.`,
  }[trigger] || 'Encourage briefly.';

  const langInstruction = language === 'english'
    ? 'Reply in clear, energetic English.'
    : 'Reply in Roman Urdu mixed with English (Pakistani conversational style).';

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
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');
    if (!text || text.length > 160) return { comment: '' };
    return { comment: text };
  } catch (err) {
    return { comment: '' };
  }
}

module.exports = commentatorAgent;
