// quizAgent.js — Gemini quiz generator with retries + emergency fallback.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const FALLBACK = {
  english: {
    topic: 'World Trivia',
    topicEmoji: '🌍',
    questions: [
      { question: 'Which planet is known as the Red Planet?', options: ['Mars', 'Venus', 'Jupiter', 'Mercury'], correctIndex: 0, explanation: 'Mars looks red because of iron oxide on its surface.' },
      { question: 'Largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correctIndex: 2, explanation: 'The Pacific covers more area than all continents combined.' },
      { question: 'Pakistan ke pehle PM kaun the?', options: ['Jinnah', 'Liaqat Ali Khan', 'Ayub Khan', 'Iqbal'], correctIndex: 1, explanation: 'Liaqat Ali Khan was Pakistan\'s first Prime Minister.' },
      { question: 'Which is the fastest land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Wolf'], correctIndex: 1, explanation: 'Cheetahs can sprint up to 110 km/h.' },
      { question: 'Babar Azam plays for which national team?', options: ['India', 'Pakistan', 'Bangladesh', 'England'], correctIndex: 1, explanation: 'Babar Azam is the captain of the Pakistan cricket team.' },
      { question: 'Which is the largest country by area?', options: ['USA', 'China', 'Canada', 'Russia'], correctIndex: 3, explanation: 'Russia spans 11 time zones.' },
      { question: 'Painter of the Mona Lisa?', options: ['Picasso', 'Da Vinci', 'Van Gogh', 'Michelangelo'], correctIndex: 1, explanation: 'Leonardo da Vinci painted the Mona Lisa around 1503.' },
      { question: 'How many continents are there?', options: ['5', '6', '7', '8'], correctIndex: 2, explanation: 'There are 7 continents on Earth.' },
    ],
  },
  urdu: {
    topic: 'World Trivia',
    topicEmoji: '🌍',
    questions: [
      { question: 'Red Planet kis ko kehte hain?', options: ['Mars', 'Venus', 'Jupiter', 'Mercury'], correctIndex: 0, explanation: 'Mars surface pe iron oxide ke wajah se red dikhta hai.' },
      { question: 'Earth ka sabse bara ocean?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correctIndex: 2, explanation: 'Pacific Ocean saare continents se bara hai.' },
      { question: 'Pakistan ke pehle PM?', options: ['Jinnah', 'Liaqat Ali Khan', 'Ayub Khan', 'Iqbal'], correctIndex: 1, explanation: 'Liaqat Ali Khan Pakistan ke pehle Prime Minister the.' },
      { question: 'Sabse fast land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Wolf'], correctIndex: 1, explanation: 'Cheetah 110 km/h tak speed kar leta hai.' },
      { question: 'Babar Azam kis team ke liye khelte hain?', options: ['India', 'Pakistan', 'Bangladesh', 'England'], correctIndex: 1, explanation: 'Babar Azam Pakistan cricket team ke captain hain.' },
      { question: 'Area ke hisab se sabse bara country?', options: ['USA', 'China', 'Canada', 'Russia'], correctIndex: 3, explanation: 'Russia 11 time zones cover karta hai.' },
      { question: 'Mona Lisa kis ne paint kiya?', options: ['Picasso', 'Da Vinci', 'Van Gogh', 'Michelangelo'], correctIndex: 1, explanation: 'Leonardo da Vinci ne 1503 ke aas-paas Mona Lisa banai.' },
      { question: 'Continents kitne hain Earth pe?', options: ['5', '6', '7', '8'], correctIndex: 2, explanation: 'Earth pe 7 continents hain.' },
    ],
  },
};

function shuffleAndSlice(arr, n) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}

async function tryGemini({ apiKey, topic, count, language, difficulty, excludeTopics = [] }) {
  const langInstruction = language === 'urdu'
    ? 'All questions, options and explanations in Roman Urdu mixed with English (Pakistani conversational style).'
    : 'All questions, options and explanations in clear English.';
  const excludeHint = excludeTopics.length
    ? `\nDO NOT pick these topics (already done recently): ${excludeTopics.join(', ')}.`
    : '';
  const topicHint = topic
    ? `Topic / theme: ${topic}.${excludeHint}`
    : `Pick a fresh, interesting cultural / world topic — Pakistani, Indian, sports, science, history, mythology, food, art, anything. Be creative and varied.${excludeHint}`;

  const prompt = `You are a trivia quiz designer.

${topicHint}
Difficulty: ${difficulty}
${langInstruction}

Generate exactly ${count} multiple-choice questions. Each question must:
- Be self-contained.
- Have exactly 4 plausible options.
- Have exactly ONE correct option (index 0..3).
- Include a one-sentence explanation.

Return STRICTLY valid JSON only (no markdown):
{"topic":"...","topicEmoji":"...","questions":[{"question":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 18000)),
  ]);
  const text = result.response.text() || '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON');
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
  if (!questions.length) throw new Error('No questions parsed');
  return {
    topic: String(parsed.topic || 'Quiz'),
    topicEmoji: String(parsed.topicEmoji || '❓'),
    questions,
  };
}

async function quizAgent({ topic = '', count = 8, language = 'english', difficulty = 'medium', excludeTopics = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const lang = language === 'urdu' ? 'urdu' : 'english';

  if (apiKey && apiKey !== 'your_key_here') {
    try {
      return await tryGemini({ apiKey, topic, count, language: lang, difficulty, excludeTopics });
    } catch (err) {
      console.warn('[quizAgent] Gemini failed, falling back:', err.message);
    }
  }

  // Emergency fallback: stable bilingual question pool. Always playable.
  const pool = FALLBACK[lang] || FALLBACK.english;
  return {
    topic: pool.topic,
    topicEmoji: pool.topicEmoji,
    questions: shuffleAndSlice(pool.questions, Math.min(count, pool.questions.length)),
  };
}

module.exports = quizAgent;
