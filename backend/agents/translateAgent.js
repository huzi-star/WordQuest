// translateAgent — translates the English meaning of a word into one of the
// supported home languages so non-native English-speaking kids understand.

const { generate, isConfigured } = require('../utils/llm');
const { guardText } = require('../utils/guardrailRunner');

const LANGUAGES = {
  // Real Urdu in Nastaliq (Arabic) script — اردو، روان اور آسان جملہ۔
  // Use everyday vocabulary children can understand. Never reply in
  // Roman Urdu / English transliteration when this key is selected.
  urdu:    'Urdu in proper Nastaliq script (اردو رسم الخط). Use everyday, kid-friendly Urdu vocabulary. DO NOT reply in Roman Urdu or English letters — write directly in Urdu script.',
  hindi:   'Hindi (Devanagari script)',
  arabic:  'Arabic (Arabic script)',
  spanish: 'Spanish',
  french:  'French',
};

const cache = new Map(); // key: `${word}|${lang}` → translation

async function translateAgent({ word, meaning, language = 'urdu', userId = null } = {}) {
  const lang = LANGUAGES[language] || LANGUAGES.urdu;
  const key = `${String(word || '').toLowerCase()}|${language}`;
  if (cache.has(key)) return cache.get(key);

  if (!isConfigured()) return null;

  // INPUT GUARDRAIL — never translate a slur or adult phrase.
  const safeIn = await guardText(String(word || ''), 'word', { ageGroup: 'kid', userId });
  if (safeIn === null) return null;

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
    // OUTPUT GUARDRAIL — translation could surface adult phrasing even
    // when the head word was clean. Drop unsafe results before caching.
    const safeOut = await guardText(out, 'tutor', { ageGroup: 'kid', userId, allowList: [String(word || '').toUpperCase()] });
    if (safeOut === null) return null;
    if (safeOut) cache.set(key, safeOut);
    return safeOut;
  } catch (err) {
    return null;
  }
}

module.exports = { translateAgent, LANGUAGES };
