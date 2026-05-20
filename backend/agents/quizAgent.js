// quizAgent.js — AI-only quiz generator (OpenAI gpt-4o-mini).

const { generate, isConfigured } = require('../utils/llm');

const VARIETY_TOPICS = [
  'world geography', 'history', 'science', 'pop culture', 'music',
  'movies', 'sports', 'animals', 'inventions', 'literature',
  'mythology', 'technology', 'art', 'capital cities', 'famous people',
];

async function tryGenerate({ count, language, difficulty, excludeQuestions = [] }) {
  const langInstruction = language === 'urdu'
    ? 'Roman Urdu mixed with English (Pakistani style).'
    : 'Clear English.';

  const pool = [...VARIETY_TOPICS];
  const seeds = [];
  while (seeds.length < 2 && pool.length) {
    seeds.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  const excludeQHint = excludeQuestions.length
    ? `\nAvoid repeating: ${excludeQuestions.slice(0, 5).map((q) => String(q).slice(0, 60)).join(' | ')}`
    : '';

  const prompt = `Generate ${count} multiple-choice trivia questions.
Mix these themes: ${seeds.join(', ')}.
Difficulty: ${difficulty}. ${langInstruction}${excludeQHint}

Each question: exactly 4 options, ONE correct (correctIndex 0-3), one-sentence explanation.

Return ONLY this JSON structure:
{"topic":"…","topicEmoji":"…","questions":[{"question":"…","options":["a","b","c","d"],"correctIndex":0,"explanation":"…"}]}`;

  const text = await generate(prompt, { agent: 'quizAgent',
    timeoutMs: 22000,
    temperature: 0.9,
    maxTokens: 3500,
    responseFormat: 'json',
  });

  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  const excludeSet = new Set((excludeQuestions || []).map((q) => String(q).toLowerCase().trim()));
  const questions = (parsed.questions || [])
    .filter((q) =>
      q && q.question && Array.isArray(q.options) && q.options.length === 4
      && !excludeSet.has(String(q.question).toLowerCase().trim()))
    .slice(0, count)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map((o) => String(o)),
      correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
      explanation: String(q.explanation || ''),
    }));
  if (!questions.length) throw new Error('No questions parsed');
  return {
    topic: String(parsed.topic || 'World Trivia'),
    topicEmoji: String(parsed.topicEmoji || '🌍'),
    questions,
  };
}

async function quizAgent({
  count = 20,
  language = 'english',
  difficulty = 'medium',
  excludeQuestions = [],
}) {
  if (!isConfigured()) {
    return { ok: false, error: 'AI not configured. Set OPENAI_API_KEY on the backend.' };
  }
  const lang = language === 'urdu' ? 'urdu' : 'english';

  // Try the full count first. If parse fails, retry with half size (faster).
  try {
    return await tryGenerate({ count, language: lang, difficulty, excludeQuestions });
  } catch (err) {
    console.warn('[quizAgent] full size failed:', err.message);
  }
  try {
    return await tryGenerate({
      count: Math.max(5, Math.floor(count / 2)),
      language: lang, difficulty, excludeQuestions,
    });
  } catch (err) {
    return { ok: false, error: err.message || 'Quiz AI temporarily unavailable.' };
  }
}

module.exports = quizAgent;
