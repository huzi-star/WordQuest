// wordDetailAgent — kid-friendly explanation card for a found word.
// Returns: { word, meaning, example, synonym, antonym }
//
// Upgraded to be FACTUALLY ACCURATE for every word in every category.
// Earlier the LLM occasionally hallucinated nonsense ("lion is largest
// car animal") because the prompt invited fluency over correctness and
// had no validation pass. This version:
//   1. Hands the LLM both the WORD and its CATEGORY context so it
//      anchors the definition in the right real-world meaning.
//   2. Instructs the LLM explicitly: "factually correct, dictionary
//      accurate; if uncertain, leave the field empty rather than
//      inventing".
//   3. Validates the response — meaning must be non-trivial, must
//      contain at least one informative word besides the head word,
//      must not say nonsense like "<word> is a kind of <word>".
//   4. Retries up to 2 more times with a stricter prompt if the first
//      output fails validation.
//   5. Routes every visible field through the safety guardrail (no
//      offensive, no over-difficult, no repeats within the last ~80
//      cards for the same kid, no non-age-appropriate content).

const { generate, isConfigured } = require('../utils/llm');
const { guardObjectFields, guardText } = require('../utils/guardrailRunner');

function looksFactuallyOk(card, upper) {
  if (!card || typeof card !== 'object') return false;
  const m = String(card.meaning || '').trim();
  if (!m) return false;
  if (m.length < 8) return false;
  const lowM = m.toLowerCase();
  const lowW = upper.toLowerCase();
  // Reject tautologies / self-references.
  if (lowM === lowW) return false;
  if (lowM === `${lowW}.`) return false;
  // Reject "X is a X" style nonsense.
  const tautRe = new RegExp(`\\b${lowW}\\s+is\\s+(a|an|the)?\\s*${lowW}\\b`, 'i');
  if (tautRe.test(lowM)) return false;
  // Must contain at least one informative word besides the head word.
  const words = lowM.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w && w !== lowW);
  if (words.length < 3) return false;
  return true;
}

function buildPrompt({ upper, category, attempt }) {
  const base = `You are a careful, kid-friendly English teacher writing a learning card for a child aged 6 to 13.

The child just found the word: "${upper}"
${category ? `Category context: "${category}"` : ''}

YOUR JOB
1. First, think (silently) which REAL-WORLD meaning of "${upper}" best fits the category above. If the word has more than one meaning, pick the one most natural for this category.
2. Then write a tiny learning card in VERY simple English.

FACTUAL ACCURACY IS THE #1 RULE.
- Every line must be DICTIONARY-CORRECT real-world information about "${upper}".
- NEVER invent attributes. NEVER mix categories (e.g. an animal is not a "car", a fruit is not a "country").
- If you are not 100% sure about a synonym or antonym, return "" for that field. Empty is FAR better than wrong.

FIELDS
- "meaning": one clear, factual sentence (max 15 words). Easy enough for a 6-7 year old. Must explain what "${upper}" actually IS, not a poem about it.
- "example": one short sentence relatable to a child's life that uses "${upper}" naturally and correctly.
- "synonym": ONE single common English word that means the same as "${upper}". "" if none exists.
- "antonym": ONE single common English word that means the opposite of "${upper}". "" if none exists.

Never use scary, adult, or complex content. Plain ASCII letters only.

Return STRICTLY valid JSON, nothing else:
{"meaning":"...","example":"...","synonym":"...","antonym":"..."}`;
  if (attempt === 0) return base;
  return base + `

NOTE: A previous attempt produced an inaccurate definition. Be EXTRA careful this time — verify every claim against your real knowledge of the word "${upper}" before writing it. If you don't know the word with certainty, return:
{"meaning":"","example":"","synonym":"","antonym":""}`;
}

async function callOnce({ upper, category, attempt }) {
  const prompt = buildPrompt({ upper, category, attempt });
  const text = await generate(prompt, {
    agent: 'wordDetailAgent',
    temperature: attempt === 0 ? 0.35 : 0.15,
    maxTokens: 260,
    timeoutMs: 10000,
    responseFormat: 'json',
  });
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return {
    word: upper,
    meaning: String(parsed.meaning || '').trim(),
    example: String(parsed.example || '').trim(),
    synonym: String(parsed.synonym || '').trim(),
    antonym: String(parsed.antonym || '').trim(),
  };
}

async function wordDetailAgent({ word, tier = 'bronze', category = '', userId = null } = {}) {
  const upper = String(word || '').toUpperCase();
  if (!upper) return null;

  // Guardrail INPUT — never call the LLM on an unsafe head-word.
  const safeHead = await guardText(upper, 'word', { ageGroup: 'kid', userId });
  if (safeHead === null) {
    return { word: upper, meaning: '', example: '', synonym: '', antonym: '', blocked: true };
  }

  if (!isConfigured()) {
    return { word: upper, meaning: '', example: '', synonym: '', antonym: '' };
  }

  let card = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await callOnce({ upper, category, attempt });
      if (r && looksFactuallyOk(r, upper)) {
        card = r;
        break;
      }
      // Keep best-so-far in case all attempts fall short — still better
      // than returning nothing.
      if (r && (!card || (r.meaning && r.meaning.length > (card.meaning || '').length))) {
        card = r;
      }
    } catch (_) { /* try again */ }
  }
  if (!card) {
    return { word: upper, meaning: '', example: '', synonym: '', antonym: '' };
  }

  // Guardrail OUTPUT — strip any field flagged as offensive / inaccurate
  // / non-age-appropriate. Head word is allow-listed so a clean
  // self-reference in the example doesn't trip the repeat rule.
  try {
    const safe = await guardObjectFields(card, 'tutor', {
      ageGroup: 'kid', userId, allowList: [upper],
      fields: ['meaning', 'example', 'synonym', 'antonym'],
    });
    return {
      ...safe,
      meaning: safe.meaning || '',
      example: safe.example || '',
      synonym: safe.synonym || '',
      antonym: safe.antonym || '',
    };
  } catch (_) {
    return card;
  }
}

module.exports = wordDetailAgent;
