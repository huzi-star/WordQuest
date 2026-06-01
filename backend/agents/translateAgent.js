// translateAgent — translates the English meaning of a word into one of the
// supported home languages so non-native English-speaking kids understand.

const { generate, isConfigured } = require('../utils/llm');

const LANGUAGES = {
  urdu:    'Urdu (Roman Urdu using English letters, the way Pakistanis casually write)',
  hindi:   'Hindi (Devanagari script)',
  arabic:  'Arabic (Arabic script)',
  spanish: 'Spanish',
  french:  'French',
};

const cache = new Map(); // key: `${word}|${lang}` → translation

async function translateAgent({ word, meaning, language = 'urdu' } = {}) {
  const lang = LANGUAGES[language] || LANGUAGES.urdu;
  const key = `${String(word || '').toLowerCase()}|${language}`;
  if (cache.has(key)) return cache.get(key);

  if (!isConfigured()) return null;

  const prompt = `Translate the meaning of the English word "${word}" into ${lang}.
English meaning: "${meaning || ''}".

Return STRICTLY valid JSON only:
{"translation":"one simple sentence in the target language, max 20 words"}`;

  try {
    const text = await generate(prompt, {
      agent: 'translateAgent', temperature: 0.3, maxTokens: 200, timeoutMs: 9000, responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const out = String(parsed.translation || '').trim();
    if (out) cache.set(key, out);
    return out;
  } catch (err) {
    return null;
  }
}

module.exports = { translateAgent, LANGUAGES };
