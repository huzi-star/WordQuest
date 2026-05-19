// quizAgent.js — AI-only quiz generator.
// No hardcoded question pool. Gemini generates everything, with retries
// and aggressive variance so questions never repeat across runs.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const VARIETY_TOPICS = [
  'world geography', 'ancient history', 'modern history', 'science discoveries',
  'space and astronomy', 'pop culture', 'music', 'movies', 'sports',
  'world cuisine', 'animals', 'inventions', 'famous people',
  'literature', 'mythology', 'philosophy', 'world religions',
  'technology', 'video games', 'art', 'languages', 'world currencies',
  'capital cities', 'rivers and mountains', 'oceans', 'famous landmarks',
  'wars and battles', 'nobel laureates', 'olympics', 'cricket',
  'football', 'tennis', 'chemistry', 'physics', 'biology', 'medicine',
  'mathematics', 'economics', 'business leaders', 'famous architects',
  'Pakistani culture', 'Indian culture', 'Middle Eastern history',
  'African geography', 'Asian art', 'European monarchies',
  'American presidents', 'space missions', 'inventors',
];

async function tryGemini({
  apiKey, count, language, difficulty, excludeTopics = [], excludeQuestions = [],
}) {
  const langInstruction = language === 'urdu'
    ? 'All questions, options and explanations in Roman Urdu mixed with English (Pakistani conversational style).'
    : 'All questions, options and explanations in clear, motivating English.';

  // Pick 3 random seed topics each call to push Gemini towards genuinely
  // different content even if the player retries the quiz repeatedly.
  const seeds = [];
  const pool = VARIETY_TOPICS.filter((t) => !excludeTopics.includes(t));
  while (seeds.length < 3 && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    seeds.push(pool.splice(idx, 1)[0]);
  }
  const seedStr = seeds.join(', ');

  const excludeTopicsHint = excludeTopics.length
    ? `\nDO NOT use these topics (recently shown): ${excludeTopics.slice(0, 10).join(', ')}.`
    : '';
  // Trim each excluded question to keep the prompt small, but warn Gemini
  // strongly against repeating them.
  const excludeQHint = excludeQuestions.length
    ? `\nDO NOT reuse, paraphrase, or duplicate any of these exact questions:\n- ${excludeQuestions.slice(0, 12).map((q) => String(q).slice(0, 120)).join('\n- ')}`
    : '';
  const varianceSeed = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const prompt = `You are an expert trivia quiz designer.

Mix questions across these themes (pick a different focus each time): ${seedStr}.
Difficulty: ${difficulty}.
Variance token (must influence your output): ${varianceSeed}.
${excludeTopicsHint}
${excludeQHint}
${langInstruction}

Generate exactly ${count} multiple-choice questions. Each must:
- Be a real, factually accurate question (no made-up trivia).
- Have exactly 4 plausible options with ONE clearly correct answer (index 0..3).
- Include a short one-sentence explanation citing why the answer is right.
- Be COMPLETELY DIFFERENT from any common quiz cliches (avoid "tallest mountain", "fastest animal", "largest ocean" etc unless directly relevant).
- Span DIFFERENT topics — do not stack 5 questions in one theme.

Return STRICTLY valid JSON only (no markdown, no commentary):
{"topic":"...","topicEmoji":"...","questions":[{"question":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 1.15, topP: 0.95 },
  });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 22000)),
  ]);
  const text = result.response.text() || '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  const excludeSet = new Set((excludeQuestions || []).map((q) => String(q).toLowerCase().trim()));
  const questions = (parsed.questions || [])
    .filter(
      (q) =>
        q &&
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        // Strict: skip anything we've already asked.
        !excludeSet.has(String(q.question).toLowerCase().trim()),
    )
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
  count = 8,
  language = 'english',
  difficulty = 'medium',
  excludeTopics = [],
  excludeQuestions = [],
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const lang = language === 'urdu' ? 'urdu' : 'english';

  if (!apiKey || apiKey === 'your_key_here') {
    return { ok: false, error: 'AI not configured. Set GEMINI_API_KEY on the backend.' };
  }

  // Try up to 3 times with widening creativity if the first attempt returns
  // empty / duplicate / parse-error.
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await tryGemini({
        apiKey, count, language: lang, difficulty,
        excludeTopics, excludeQuestions,
      });
      // If the model returned fewer than requested questions, still return
      // what we got — better some than none.
      if (result.questions.length > 0) return result;
    } catch (err) {
      lastError = err.message;
      console.warn(`[quizAgent] attempt ${attempt + 1} failed:`, err.message);
    }
  }
  return { ok: false, error: lastError || 'Quiz AI is slow right now. Try again in a moment.' };
}

module.exports = quizAgent;
