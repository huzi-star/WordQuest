// quizAgent.js — Gemini-powered MCQ trivia generator.
//
// Given { topic, count, language }, returns an array of questions:
//   [{ question, options: [4], correctIndex, explanation }, ...]

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function quizAgent({ topic = '', count = 5, language = 'urdu', difficulty = 'medium' }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('Gemini API key missing — AI quiz unavailable');
  }

  const langInstruction = language === 'english'
    ? 'All questions, options and explanations in clear English.'
    : 'All questions, options and explanations in Roman Urdu mixed with English (Pakistani conversational style).';

  const topicHint = topic
    ? `Topic / theme: ${topic}.`
    : 'Pick an interesting cultural/world topic — Pakistani, Indian, sports, science, history, anything. Vary the topics.';

  const prompt = `You are a trivia quiz designer.

${topicHint}
Difficulty: ${difficulty}
${langInstruction}

Generate exactly ${count} multiple-choice questions. Each question must:
- Be self-contained (no follow-up references).
- Have exactly 4 plausible options.
- Have exactly ONE correct option (index 0..3).
- Include a one-sentence explanation about why the correct answer is right.

Return STRICTLY valid JSON only (no markdown):
{
  "topic": "human-readable topic name",
  "topicEmoji": "single emoji",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "..."
    }
  ]
}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('quiz timeout')), 22000)),
  ]);
  const text = result.response.text();
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

  const questions = (parsed.questions || [])
    .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4)
    .slice(0, count)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map((o) => String(o)),
      correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
      explanation: String(q.explanation || ''),
    }));
  if (!questions.length) throw new Error('Quiz agent returned no questions');

  return {
    topic: String(parsed.topic || 'Quiz'),
    topicEmoji: String(parsed.topicEmoji || '❓'),
    questions,
  };
}

module.exports = quizAgent;
