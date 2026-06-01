// wordDetailAgent — kid-friendly explanation card for a found word.
// Returns: { word, meaning, example, synonym, antonym }

const { generate, isConfigured } = require('../utils/llm');

async function wordDetailAgent({ word, tier = 'bronze' } = {}) {
  const upper = String(word || '').toUpperCase();
  if (!upper) return null;
  if (!isConfigured()) {
    return { word: upper, meaning: '', example: '', synonym: '', antonym: '' };
  }
  const prompt = `You are a friendly English teacher for children aged 6 to 13.
The child just found the word "${upper}" in a puzzle.

Write a tiny learning card in VERY simple English:
- "meaning": one short sentence, max 15 words, easy enough for a 6 or 7 year old to understand
- "example": one short sentence relatable to a child's life, using the word naturally
- "synonym": ONE single common word that means the same thing
- "antonym": ONE single common word that means the opposite

If a synonym or antonym does not exist for this word, return "" for that field.
Never use scary, adult, or complex content.

Return STRICTLY valid JSON, nothing else:
{"meaning":"...","example":"...","synonym":"...","antonym":"..."}`;

  try {
    const text = await generate(prompt, {
      agent: 'wordDetailAgent',
      temperature: 0.6,
      maxTokens: 220,
      timeoutMs: 9000,
      responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return {
      word: upper,
      meaning: String(parsed.meaning || '').trim(),
      example: String(parsed.example || '').trim(),
      synonym: String(parsed.synonym || '').trim(),
      antonym: String(parsed.antonym || '').trim(),
    };
  } catch (err) {
    return { word: upper, meaning: '', example: '', synonym: '', antonym: '' };
  }
}

module.exports = wordDetailAgent;
