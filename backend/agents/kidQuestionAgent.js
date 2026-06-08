// kidQuestionAgent — turns a word card into one age-appropriate multiple
// choice question. Cheap distractor types (synonym/antonym) are built
// locally to save LLM calls; meaning/fill-in-the-blank go to gpt-4o-mini
// for plausible-but-wrong distractors.

const { generate, isConfigured } = require('../utils/llm');
const { getTier } = require('../config/tiers');
const { guardText, guardArray } = require('../utils/guardrailRunner');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueLower(items) {
  const seen = new Set();
  const out = [];
  for (const x of items) {
    const v = String(x || '').trim().toLowerCase();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

// Pull simple distractor pool from the tier's other cached words.
function poolDistractors(field, target, otherWords, n) {
  const candidates = uniqueLower(otherWords.map((w) => w[field]).filter(Boolean));
  return shuffle(candidates.filter((c) => c !== String(target).toLowerCase())).slice(0, n);
}

async function llmDistractors({ word, type, correct, tier }) {
  if (!isConfigured()) return [];
  const t = getTier(tier);
  const prompt = `You are writing a vocabulary quiz for a child aged ${t.ageRange}.
Target word: "${word}".
Correct answer (do NOT repeat): "${correct}".
Question type: ${type === 'meaning' ? 'meaning of the word' : 'word that fits the blank'}.

Give THREE wrong-but-plausible options that a child might wrongly pick.
- Each option must be ONE short ${type === 'meaning' ? 'definition (max 12 words)' : 'single word'}.
- None should be correct.
- Avoid adult or scary content.

Return STRICTLY JSON: {"distractors": ["...", "...", "..."]}`;
  try {
    const text = await generate(prompt, {
      agent: 'kidQuestionAgent',
      temperature: 0.9,
      maxTokens: 250,
      timeoutMs: 12000,
      responseFormat: 'json',
    });
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    return Array.isArray(parsed.distractors) ? parsed.distractors.slice(0, 3).map(String) : [];
  } catch (err) {
    return [];
  }
}

// type: meaning | synonym | antonym | fillblank
async function kidQuestionAgent({ card, type, otherWords = [] } = {}) {
  if (!card) return null;
  const tier = card.tier || 'bronze';

  let prompt = '';
  let correct = '';
  let distractors = [];

  if (type === 'synonym') {
    if (!card.synonym) return null;
    correct = card.synonym;
    prompt = `Which word means the SAME as "${card.word}"?`;
    distractors = poolDistractors('antonym', correct, otherWords, 3);
    if (distractors.length < 3) {
      distractors = distractors.concat(poolDistractors('word', correct, otherWords, 3 - distractors.length));
    }
  } else if (type === 'antonym') {
    if (!card.antonym) return null;
    correct = card.antonym;
    prompt = `Which word means the OPPOSITE of "${card.word}"?`;
    distractors = poolDistractors('synonym', correct, otherWords, 3);
    if (distractors.length < 3) {
      distractors = distractors.concat(poolDistractors('word', correct, otherWords, 3 - distractors.length));
    }
  } else if (type === 'fillblank') {
    if (!card.example) return null;
    correct = card.word;
    const blanked = card.example.replace(new RegExp('\\b' + escapeRe(card.word) + '\\b', 'i'), '_____');
    if (!blanked.includes('_____')) return null;
    prompt = `Choose the correct word:\n"${blanked}"`;
    distractors = poolDistractors('word', correct, otherWords, 3);
    if (distractors.length < 3) {
      const more = await llmDistractors({ word: card.word, type, correct, tier });
      distractors = uniqueLower(distractors.concat(more)).filter((d) => d !== correct.toLowerCase()).slice(0, 3);
    }
  } else {
    // meaning (default)
    correct = card.meaning;
    prompt = `What does "${card.word}" mean?`;
    distractors = poolDistractors('meaning', correct, otherWords, 3);
    if (distractors.length < 3) {
      const more = await llmDistractors({ word: card.word, type: 'meaning', correct, tier });
      distractors = distractors.concat(more).slice(0, 3);
    }
  }

  // backstop — never return fewer than 3 distractors
  while (distractors.length < 3) distractors.push('—');

  // SAFETY GUARDRAIL — every option (correct + distractors) and the
  // explanation must pass child-safety. If the correct answer itself
  // fails we drop the whole question (caller will retry / fall back).
  const allow = [String(card.word || '').toUpperCase()];
  const safePrompt = await guardText(prompt, 'tutor', { ageGroup: 'kid', allowList: allow });
  if (safePrompt === null) return null;
  const safeCorrect = await guardText(String(correct), 'tutor', { ageGroup: 'kid', allowList: allow });
  if (safeCorrect === null) return null;
  const safeDistractors = await guardArray(distractors.slice(0, 3).map(String), 'tutor', { ageGroup: 'kid', allowList: allow });
  while (safeDistractors.length < 3) safeDistractors.push('—');

  const optionsRaw = [safeCorrect, ...safeDistractors.slice(0, 3)];
  const options = shuffle(optionsRaw).map((text, i) => ({
    id: String.fromCharCode(65 + i), // A, B, C, D
    text: String(text),
  }));
  const correctId = options.find((o) => o.text === String(safeCorrect))?.id || 'A';
  const explanation =
    type === 'meaning'
      ? `${capitalize(card.word)} means: ${card.meaning}`
      : type === 'synonym'
      ? `${capitalize(card.synonym)} means the same as ${card.word}.`
      : type === 'antonym'
      ? `${capitalize(card.antonym)} is the opposite of ${card.word}.`
      : `The sentence was: "${card.example}"`;
  const safeExplain = await guardText(explanation, 'tutor', { ageGroup: 'kid', allowList: allow });

  return {
    type,
    word: card.word,
    prompt: safePrompt,
    options,
    correctId,
    explanation: safeExplain || '',
    usageTip: card.usage_tip || null,
  };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

module.exports = kidQuestionAgent;
