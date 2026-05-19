// coachAgent.js — End-of-session AI coach (OpenAI gpt-4o-mini).

const { generate, isConfigured } = require('../utils/llm');

function analyzeLocally(stats) {
  const {
    totalScore = 0, rounds = 0, bestStreak = 0, badgesCount = 0,
    avgWordsPerRound = 0, avgTimeLeftPerRound = 0,
    weakCategories = [],
  } = stats;

  const strengths = [];
  const improvements = [];
  if (avgTimeLeftPerRound > 30) strengths.push('You play fast — time bonuses keep stacking up.');
  if (avgWordsPerRound >= 4) strengths.push('Strong word recognition — you find most words on the board.');
  if (bestStreak >= 5) strengths.push(`Streak of ${bestStreak} — your focus is solid.`);
  if (badgesCount >= 3) strengths.push('Achievement hunter — you collect badges consistently.');
  if (strengths.length === 0) strengths.push('You keep improving — every round teaches something.');

  if (avgWordsPerRound < 3) improvements.push('Spot more words — scan rows, columns and diagonals first.');
  if (avgTimeLeftPerRound < 15) improvements.push('Take a beat to read the category before searching.');
  if (weakCategories.length) improvements.push(`These categories tripped you up: ${weakCategories.join(', ')}.`);
  if (improvements.length === 0) improvements.push('Push to higher difficulty — your limits are still rising.');

  return {
    headline: rounds >= 5
      ? `Solid ${rounds}-round session — total score ${totalScore}.`
      : `Nice start — ${rounds} round${rounds === 1 ? '' : 's'} in the books.`,
    strengths,
    improvements,
    practice: [],
    nextMove: bestStreak >= 4
      ? 'Next time, try hard mode and chase a longer streak.'
      : 'Warm up on easy, then bump to medium next session.',
  };
}

async function coachAgent(stats = {}) {
  const local = analyzeLocally(stats);
  if (!isConfigured()) return local;

  const language = stats.language || 'english';
  const langInstruction = language === 'english'
    ? 'All copy in clear, motivating English (15 words max per bullet).'
    : 'All copy in Roman Urdu mixed with English (Pakistani trainer voice, 15 words max per bullet).';

  const prompt = `You are a friendly personal AI coach for a word puzzle game.
The player just finished a session. Analyze and give personalized feedback.

Session stats:
- Total score: ${stats.totalScore || 0}
- Rounds played: ${stats.rounds || 0}
- Best streak: ${stats.bestStreak || 0}
- Badges earned: ${stats.badgesCount || 0}
- Avg words per round: ${(stats.avgWordsPerRound || 0).toFixed(1)}
- Avg time left per round: ${(stats.avgTimeLeftPerRound || 0).toFixed(0)}s
- Categories played: ${(stats.categoriesPlayed || []).join(', ') || 'mixed'}

Return STRICTLY valid JSON with these keys:
{
  "headline": "single-sentence summary of the session",
  "strengths": ["2-3 short bullets about what they did well"],
  "improvements": ["2-3 short bullets about what to improve"]
}
${langInstruction}`;

  try {
    const text = await generate(prompt, {
      timeoutMs: 16000,
      temperature: 0.7,
      maxTokens: 600,
      responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    return {
      headline: parsed.headline || local.headline,
      strengths: Array.isArray(parsed.strengths) && parsed.strengths.length ? parsed.strengths : local.strengths,
      improvements: Array.isArray(parsed.improvements) && parsed.improvements.length ? parsed.improvements : local.improvements,
      practice: [],
      nextMove: '',
    };
  } catch (err) {
    return local;
  }
}

module.exports = coachAgent;
