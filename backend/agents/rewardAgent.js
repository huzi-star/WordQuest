// rewardAgent.js — badges + AI-generated encouragement (OpenAI gpt-4o-mini).

const { generate, isConfigured } = require('../utils/llm');

function evalBadges({ wordsFound, totalWords, timeLeft, score, roundNumber, streak }) {
  const badges = [];
  if (timeLeft > 45 && wordsFound >= 3) badges.push({ id: 'SPEED_DEMON', name: '⚡ Speed Demon' });
  if (totalWords > 0 && wordsFound === totalWords) badges.push({ id: 'PERFECT_ROUND', name: '🎯 Perfect Round' });
  if (streak >= 5) badges.push({ id: 'ON_FIRE', name: '🔥 On Fire' });
  if (roundNumber >= 10 && score > 1000) badges.push({ id: 'EXPERT', name: '🏆 Expert' });
  if (wordsFound > 0 && wordsFound < totalWords * 0.5) badges.push({ id: 'COMEBACK_KID', name: '💪 Keep Going' });
  return badges;
}

async function narrative({ wordsFound, totalWords, timeLeft, streak, language }) {
  if (!isConfigured()) return { encouragement: '', nextRoundPreview: '' };

  const langInstruction = language === 'english'
    ? 'Respond in clear English.'
    : 'Respond in Roman Urdu mixed with English (Pakistani conversational style).';

  const prompt = `A player just finished a round of a word puzzle game.
Stats: words found ${wordsFound}/${totalWords}, time left ${timeLeft}s, streak ${streak}.

${langInstruction}

Return STRICTLY valid JSON only:
{
  "encouragement": "one short sentence congratulating or encouraging based on performance (max 15 words)",
  "nextRoundPreview": "one short sentence about what the AI plans for the next round (max 15 words)"
}`;

  try {
    const text = await generate(prompt, {
      timeoutMs: 12000,
      temperature: 0.8,
      maxTokens: 220,
      responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    return {
      encouragement: String(parsed.encouragement || ''),
      nextRoundPreview: String(parsed.nextRoundPreview || ''),
    };
  } catch (err) {
    return { encouragement: '', nextRoundPreview: '' };
  }
}

async function rewardAgent(input = {}) {
  const {
    wordsFound = 0, totalWords = 0, timeLeft = 0, score = 0,
    roundNumber = 1, streak = 0, language = 'english',
  } = input;

  const badges = evalBadges({ wordsFound, totalWords, timeLeft, score, roundNumber, streak });
  const allFound = totalWords > 0 && wordsFound === totalWords;
  const streakUpdated = allFound ? streak + 1 : 0;
  const nrt = await narrative({ wordsFound, totalWords, timeLeft, streak, language });

  return {
    badges: badges.map((b) => ({ ...b, message: '' })),
    streakUpdated,
    roundSummary: { wordsFound, totalWords, pointsEarned: score, timeLeft },
    encouragement: nrt.encouragement,
    nextRoundPreview: nrt.nextRoundPreview,
  };
}

module.exports = rewardAgent;
