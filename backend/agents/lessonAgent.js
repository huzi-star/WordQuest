// lessonAgent — generates a single lesson payload for a curriculum unit.
// One LLM call per (unit, lessonIndex, type). Cached in Supabase.

const { generate, isConfigured } = require('../utils/llm');
const { getUnit } = require('../config/curriculum');

// Universal payload shape:
// {
//   type, title, instruction,
//   items:[]  — shape depends on type
// }

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function jsonExtract(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const SPEC = {
  flashcard:    'flashcards: a list of 6 words/items. Each item has {word, meaning (max 12 words), example (one short sentence)}. Items are pure information — no question.',
  match_pairs:  'match pairs: 6 pairs of {left, right} where left is a word/concept and right is its meaning/match (max 6 words each).',
  fill_blank:   '4 fill-in-the-blank questions. Each: {sentence (use ___ where the blank goes), correct, options:[4 single words, including the correct]}.',
  listen_pick:  '5 listen-and-pick items. Each: {word (single word to be spoken via TTS), options:[4 single words including the correct]}. The audio cue IS the word itself.',
  syn_ant_match: '5 questions of {prompt (e.g. "Which word means the SAME as happy?"), correct, options:[4 single words including correct]}. Mix of synonym + antonym based on the concept.',
  tense_pick:   '5 tense-conversion questions. Each: {prompt (e.g. "Past tense of EAT?"), correct, options:[4 short words/phrases]}.',
  sentence_build: '4 sentence-building items. Each: {scrambled:[words shuffled], correct:["the","words","in","right","order"]}. Sentences ≤ 7 words.',
  acronym_expand: '5 acronym expansions. Each: {acronym, correct (the full form), options:[4 short phrases]}. Use kid-friendly acronyms only.',
  reading_qa:   '1 mini-story (3-4 short sentences) followed by 3 comprehension questions, each: {question, correct, options:[4 options]}.',
};

async function lessonAgent({ unitId, lessonIndex = 0, type = 'flashcard' } = {}) {
  const unit = getUnit(unitId);
  if (!unit) return null;
  const t = SPEC[type] || SPEC.flashcard;

  if (!isConfigured()) return null;

  const baseGuidance =
    `You are designing one lesson for the WordQuest Learning Academy.
Unit ${unit.id}: "${unit.title}" (${unit.stage} ${unit.tier} tier).
Concept: ${unit.concept}. Topic seed: ${unit.seed}.
Lesson index: ${lessonIndex} of 5. Vary content from earlier lessons of this unit.

Audience: international children aged 6 to 13 learning English. Words must be simple, kid-safe, never adult or scary.
Lesson TYPE = ${type}. Produce: ${t}`;

  const shape = (() => {
    switch (type) {
      case 'flashcard':
        return `{"type":"flashcard","title":"...","instruction":"Tap each card to read.","items":[{"word":"...","meaning":"...","example":"..."}]}`;
      case 'match_pairs':
        return `{"type":"match_pairs","title":"...","instruction":"Match each word to its meaning.","items":[{"left":"...","right":"..."}]}`;
      case 'fill_blank':
        return `{"type":"fill_blank","title":"...","instruction":"Pick the word that fits.","items":[{"sentence":"... ___ ...","correct":"...","options":["...","...","...","..."]}]}`;
      case 'listen_pick':
        return `{"type":"listen_pick","title":"...","instruction":"Listen and tap the word you heard.","items":[{"word":"...","options":["...","...","...","..."]}]}`;
      case 'syn_ant_match':
        return `{"type":"syn_ant_match","title":"...","instruction":"Pick the right answer.","items":[{"prompt":"Which word means the SAME as ...?","correct":"...","options":["...","...","...","..."]}]}`;
      case 'tense_pick':
        return `{"type":"tense_pick","title":"...","instruction":"Pick the correct form.","items":[{"prompt":"...","correct":"...","options":["...","...","...","..."]}]}`;
      case 'sentence_build':
        return `{"type":"sentence_build","title":"...","instruction":"Arrange the words.","items":[{"scrambled":["..."],"correct":["..."]}]}`;
      case 'acronym_expand':
        return `{"type":"acronym_expand","title":"...","instruction":"What does it mean?","items":[{"acronym":"...","correct":"...","options":["...","...","...","..."]}]}`;
      case 'reading_qa':
        return `{"type":"reading_qa","title":"...","instruction":"Read the story and answer.","story":"... 3 to 4 short sentences ...","items":[{"question":"...","correct":"...","options":["...","...","...","..."]}]}`;
      default:
        return null;
    }
  })();

  const prompt = `${baseGuidance}

Return STRICTLY one JSON object matching this shape (no markdown, no commentary):
${shape}`;

  try {
    const text = await generate(prompt, {
      agent: 'lessonAgent', temperature: 0.8, maxTokens: 900, timeoutMs: 22000, responseFormat: 'json',
    });
    const parsed = jsonExtract(text);
    parsed.type = parsed.type || type;
    parsed.unitId = unit.id;
    parsed.lessonIndex = lessonIndex;
    parsed.unitTitle = unit.title;
    parsed.unitEmoji = unit.emoji;
    return parsed;
  } catch (err) {
    return null;
  }
}

module.exports = { lessonAgent, shuffle };
