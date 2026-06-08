// lessonAgent — generates a single lesson payload for a curriculum unit.
// One LLM call per (unit, lessonIndex, type). Cached in Supabase.

const { generate, isConfigured } = require('../utils/llm');
const { getUnit } = require('../config/curriculum');
const { guardText, guardArray } = require('../utils/guardrailRunner');

// Run every "exposed string" in a lesson payload through the guardrail
// before the mobile client ever sees it. Lessons surface lots of free-form
// English (story paragraph, sentences, options) — exactly the kind of
// content the judges' brief asks us to validate for offensive / inaccurate /
// non-age-appropriate / too-difficult content.
async function applyLessonGuardrail(payload, userId) {
  if (!payload || typeof payload !== 'object') return payload;
  const ctx = 'lesson ' + (payload.type || '');
  // userId is intentionally NOT forwarded to the guardrail: per-lesson
  // uniqueness is handled at a higher level by learnMemory (per-unit,
  // last-10 lessons → excludeWords passed to the LLM). The guardrail's
  // in-memory `RECENT_PER_USER` repetition layer is meant for one-shot
  // commentary / reward lines and aggressively rejects common lesson
  // strings ("Alphabet & Sounds", "A", "apple", short sentences) once
  // they've been seen, which empties subsequent lessons for that user.
  const opts = { ageGroup: 'kid', userId: null, context: ctx };

  // Top-level optional strings.
  for (const k of ['title', 'instruction', 'story']) {
    if (typeof payload[k] === 'string' && payload[k]) {
      const safe = await guardText(payload[k], 'tutor', opts);
      payload[k] = safe || '';
    }
  }
  if (!Array.isArray(payload.items)) return payload;

  // Drop any item whose visible strings fail guardrail. Lessons use
  // `tutor` type uniformly — the strict `word` length-cap (3..9 chars)
  // would kill perfectly legitimate alphabet / phonics content like
  // single letters ("A") or short two-letter pairs ("OX"). `tutor`
  // still blocks offensive / non-age-appropriate / repeated content.
  const checked = [];
  for (const it of payload.items) {
    if (!it || typeof it !== 'object') continue;
    let ok = true;
    for (const [, val] of Object.entries(it)) {
      if (typeof val === 'string' && val) {
        const safe = await guardText(val, 'tutor', opts);
        if (safe === null) { ok = false; break; }
      } else if (Array.isArray(val) && val.every((x) => typeof x === 'string')) {
        const safeArr = await guardArray(val, 'tutor', opts);
        if (safeArr.length < val.length) { ok = false; break; }
      }
    }
    if (ok) checked.push(it);
  }
  payload.items = checked;
  return payload;
}

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

async function lessonAgent({
  unitId, lessonIndex = 0, type = 'flashcard', userId = null,
  difficulty = 'easy',          // 'easy' | 'medium' | 'hard' — chosen by learnMemory, hidden from frontend
  excludeWords = [],            // words seen in this user's last-10 lessons of THIS unit
  attemptNumber = 0,            // > 0 means retry after fail; widen vocabulary search
} = {}) {
  const unit = getUnit(unitId);
  if (!unit) return null;
  const t = SPEC[type] || SPEC.flashcard;

  if (!isConfigured()) return null;

  // Difficulty guidance — kept BACKEND-ONLY per spec. The mobile client
  // never receives this string in the response; it is consumed by the LLM
  // to scale word complexity, sentence length, and option subtlety.
  const DIFF_HINT = {
    easy:
      'Use the simplest, most common kid-vocabulary. Sentences 4-6 words. Distractors are obviously wrong.',
    medium:
      'Use medium-frequency words a 9-12 year-old would know. Sentences 6-8 words. Distractors are plausible but clearly distinguishable.',
    hard:
      'Use the richer end of kid-vocabulary (still under-13 safe). Sentences 7-10 words. Distractors are close synonyms or near-misses that require careful reading.',
  };
  const diffGuidance = DIFF_HINT[difficulty] || DIFF_HINT.easy;

  // Per-user repeat-avoidance: list the words this user has already seen
  // in this unit's last 10 lessons. AI is asked to AVOID them (up to ~10%
  // recurrence allowed when the pool is genuinely exhausted).
  const seenList = Array.isArray(excludeWords) && excludeWords.length
    ? excludeWords.slice(-60).join(', ')
    : '';
  const excludeBlock = seenList
    ? `\nALREADY-SEEN WORDS for this user in this unit (AVOID — pick fresh vocabulary; only repeat in <=10% of items if the pool is truly small): ${seenList}.`
    : '\n(No prior history in this unit — fresh start, easy words only.)';
  const retryNote = attemptNumber > 0
    ? `\nThis is a RETRY (attempt ${attemptNumber + 1}). Reword the task and use a different set of vocabulary than the previous attempt.`
    : '';

  const baseGuidance =
    `You are designing one lesson for the WordQuest Learning Academy.
Unit ${unit.id}: "${unit.title}" (${unit.stage} ${unit.tier} tier).
Concept: ${unit.concept}. Topic seed: ${unit.seed}.
Lesson index: ${lessonIndex} of 5. Vary content from earlier lessons of this unit.

Audience: international children aged 6 to 13 learning English. Words must be simple, kid-safe, never adult or scary.
Difficulty (internal — do NOT mention it to the child): ${difficulty}. ${diffGuidance}
${excludeBlock}${retryNote}

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
      agent: 'lessonAgent',
      // Higher temperature on retries + medium/hard to push fresh wording
      temperature: attemptNumber > 0 ? 0.95 : (difficulty === 'easy' ? 0.75 : 0.9),
      maxTokens: 900, timeoutMs: 22000, responseFormat: 'json',
    });
    const parsed = jsonExtract(text);
    parsed.type = parsed.type || type;
    parsed.unitId = unit.id;
    parsed.lessonIndex = lessonIndex;
    parsed.unitTitle = unit.title;
    parsed.unitEmoji = unit.emoji;
    // Internal difficulty marker — stripped from client response by learnApi.
    parsed._difficulty = difficulty;
    return await applyLessonGuardrail(parsed, userId);
  } catch (err) {
    return null;
  }
}

module.exports = { lessonAgent, shuffle };
