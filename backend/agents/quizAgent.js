// quizAgent.js — AI-only quiz generator.
// Lean prompt + small cascade so the request fits inside the free-tier
// per-minute token budget. No hardcoded question pool.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const VARIETY_TOPICS = [
  'world geography', 'history', 'science', 'pop culture', 'music',
  'movies', 'sports', 'animals', 'inventions', 'literature',
  'mythology', 'technology', 'art', 'capital cities', 'famous people',
];

// Single lightweight model — cheapest path through free-tier quota. The
// quiz only needs basic factual questions, not deep reasoning.
// Single model. Adding more burns the project's per-minute token budget
// without buying us much — they all share the same project quota.
const QUIZ_MODELS = ['gemini-2.5-flash'];

async function tryGemini({ apiKey, count, language, difficulty, modelName, excludeQuestions = [] }) {
  const langInstruction = language === 'urdu'
    ? 'Roman Urdu mixed with English (Pakistani style).'
    : 'Clear English.';

  // Two random seed topics — keeps the prompt tiny and content varied.
  const pool = [...VARIETY_TOPICS];
  const seeds = [];
  while (seeds.length < 2 && pool.length) {
    seeds.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  // Cap the exclude list to 5 short snippets to keep input tokens low.
  const excludeQHint = excludeQuestions.length
    ? `\nAvoid repeating: ${excludeQuestions.slice(0, 5).map((q) => String(q).slice(0, 60)).join(' | ')}`
    : '';

  const prompt = `Generate ${count} multiple-choice trivia questions.
Mix these themes: ${seeds.join(', ')}.
Difficulty: ${difficulty}. ${langInstruction}${excludeQHint}

Each question: exactly 4 options, ONE correct (correctIndex 0-3), one-sentence explanation.

Return ONLY this JSON (no markdown):
{"topic":"…","topicEmoji":"…","questions":[{"question":"…","options":["a","b","c","d"],"correctIndex":0,"explanation":"…"}]}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName || 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.9,
      topP: 0.9,
      maxOutputTokens: 3500,
    },
  });
  // Vercel maxDuration is 60s so we have room for two real attempts.
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
  ]);
  const text = result.response.text() || '';
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
  const apiKey = process.env.GEMINI_API_KEY;
  const lang = language === 'urdu' ? 'urdu' : 'english';

  if (!apiKey || apiKey === 'your_key_here') {
    return { ok: false, error: 'AI not configured. Set GEMINI_API_KEY on the backend.' };
  }

  // Two-stage strategy:
  // 1. Ask for the full count from each model in the cascade.
  // 2. If all fail (likely free-tier RPM/RPD limits), fall back to a much
  //    smaller request — 10 questions — so the player still gets a quiz.
  const tryWithSize = async (size) => {
    let lastError = '';
    for (const modelName of QUIZ_MODELS) {
      try {
        const result = await tryGemini({
          apiKey, count: size, language: lang, difficulty, modelName, excludeQuestions,
        });
        if (result.questions.length > 0) return result;
      } catch (err) {
        lastError = err.message || String(err);
        console.warn(`[quizAgent] model ${modelName} size=${size} failed:`, lastError);
      }
    }
    return { error: lastError };
  };

  const full = await tryWithSize(count);
  if (full && full.questions) return full;
  const reduced = await tryWithSize(Math.max(5, Math.floor(count / 2)));
  if (reduced && reduced.questions) return reduced;
  return { ok: false, error: full?.error || reduced?.error || 'Quiz AI temporarily unavailable.' };
}

module.exports = quizAgent;
