// wordOfDayAgent — produces the daily learning word for a given tier.
// Same UTC date always returns the same word for that tier (so every kid
// in the world sees the same word today).

const { generate, isConfigured } = require('../utils/llm');
const { TIERS } = require('../config/tiers');

const cache = new Map(); // key: `${tier}|${YYYY-MM-DD}` → result

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function wordOfDayAgent({ tier = 'bronze' } = {}) {
  const t = TIERS.find((x) => x.key === tier) || TIERS[0];
  const key = `${t.key}|${todayKey()}`;
  if (cache.has(key)) return cache.get(key);

  if (!isConfigured()) return null;

  const prompt = `You are an English vocabulary teacher for children aged 6 to 13.
Today is ${todayKey()}. Pick ONE English word for the "${t.name}" tier (${t.cefr} CEFR level).
Word style: ${t.wordStyle}.
The word must be simple enough for a class 5 student.

Return STRICTLY valid JSON, nothing else:
{
  "word": "the word in lowercase",
  "meaning": "one simple sentence (max 15 words) a child can understand",
  "example": "one short sentence using the word naturally",
  "synonym": "ONE single common word that means the same",
  "antonym": "ONE single common word that means the opposite"
}`;

  try {
    const text = await generate(prompt, {
      agent: 'wordOfDayAgent', temperature: 0.4, maxTokens: 240, timeoutMs: 12000, responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const result = {
      date: todayKey(),
      tier: t.key,
      word: String(parsed.word || '').toLowerCase().trim(),
      meaning: String(parsed.meaning || '').trim(),
      example: String(parsed.example || '').trim(),
      synonym: String(parsed.synonym || '').trim(),
      antonym: String(parsed.antonym || '').trim(),
    };
    if (result.word) cache.set(key, result);
    return result;
  } catch (err) {
    return null;
  }
}

module.exports = wordOfDayAgent;
