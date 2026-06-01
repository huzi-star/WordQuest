// kidWordAgent — generates a batch of vocabulary cards for a given tier.
// One LLM call returns N child-friendly word objects. Caller is
// responsible for upserting into `wq_kids_words_cache`.

const { generate, isConfigured } = require('../utils/llm');
const { getTier } = require('../config/tiers');

async function kidWordAgent({ tier = 'bronze', count = 10, avoid = [] } = {}) {
  const t = getTier(tier);
  const richness =
    t.detailsTier === 'rich'
      ? '"synonym_2" (a second synonym), "antonym_2" (a second antonym), '
      : '';
  const tipField = t.detailsTier === 'basic' ? '' : '"usage_tip" (max 20 words, when/how a child would use this word), ';

  const avoidLine = avoid.length
    ? `Do NOT pick any of these (already taught): ${avoid.slice(0, 40).join(', ')}.`
    : '';

  const prompt = `You are a friendly English vocabulary teacher for children aged ${t.ageRange} years old.

Task: produce ${count} unique vocabulary cards for the "${t.name}" tier.
Word style seed: ${t.promptSeed}.
${avoidLine}

Rules:
- Each word must be a real English word a child of ${t.ageRange} could actually use.
- "meaning" must be ONE sentence, max 15 words, written in very simple English.
- "example" must be ONE short sentence relatable to a child's life, using the word.
- "synonym" and "antonym" must each be a single common word (no phrases).
- Never use adult themes, scary or violent ideas, or complex grammar.
- All ${count} words must be distinct from each other.

Return STRICTLY valid JSON only:
{
  "words": [
    {
      "word": "...",
      "meaning": "...",
      "example": "...",
      "synonym": "...",
      ${richness}"antonym": "...",
      ${tipField}"difficulty_score": 1
    }
  ]
}`;

  if (!isConfigured()) {
    return { tier: t.key, words: [] };
  }
  try {
    const text = await generate(prompt, {
      agent: 'kidWordAgent',
      temperature: 0.85,
      maxTokens: 1400,
      timeoutMs: 22000,
      responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const seen = new Set();
    const out = [];
    for (const w of Array.isArray(parsed.words) ? parsed.words : []) {
      const word = String(w.word || '').trim().toLowerCase();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push({
        word,
        meaning: String(w.meaning || '').trim(),
        example: String(w.example || '').trim(),
        synonym: String(w.synonym || '').trim().toLowerCase(),
        synonym_2: w.synonym_2 ? String(w.synonym_2).trim().toLowerCase() : null,
        antonym: String(w.antonym || '').trim().toLowerCase(),
        antonym_2: w.antonym_2 ? String(w.antonym_2).trim().toLowerCase() : null,
        usage_tip: w.usage_tip ? String(w.usage_tip).trim() : null,
        difficulty_score: Number(w.difficulty_score) || t.rank,
        tier: t.key,
      });
    }
    return { tier: t.key, words: out };
  } catch (err) {
    return { tier: t.key, words: [], error: err.message };
  }
}

module.exports = kidWordAgent;
