// WordQuest Learning Academy — 32-unit curriculum, A1 → B1.
// Each unit drives a sequence of AI-generated lessons. The curriculum order
// is fixed; player unlocks units linearly.

const UNITS = [
  // ===================== A1 Foundations (Bronze) =====================
  { id: 1,  stage: 'A1', tier: 'bronze',   title: 'Alphabet & Sounds',     concept: 'alphabet',        emoji: '🔤', seed: 'the 26 letters A to Z, uppercase and lowercase, simple letter sounds' },
  { id: 2,  stage: 'A1', tier: 'bronze',   title: 'Numbers 1 to 100',      concept: 'numbers',         emoji: '🔢', seed: 'cardinal numbers one through one hundred and their spelling' },
  { id: 3,  stage: 'A1', tier: 'bronze',   title: 'Colors & Shapes',       concept: 'colors_shapes',   emoji: '🎨', seed: 'basic colors (red, blue, green, yellow, black, white, orange, pink, purple, brown) and shapes (circle, square, triangle, rectangle, star)' },
  { id: 4,  stage: 'A1', tier: 'bronze',   title: 'Family Words',          concept: 'family',          emoji: '👨‍👩‍👧', seed: 'family vocabulary: mother, father, brother, sister, baby, son, daughter, uncle, aunt, cousin, grandfather, grandmother' },
  { id: 5,  stage: 'A1', tier: 'bronze',   title: 'Animals',               concept: 'animals',         emoji: '🐶', seed: 'common animals a child knows: cat, dog, cow, pig, horse, sheep, lion, tiger, bear, monkey, bird, fish' },
  { id: 6,  stage: 'A1', tier: 'bronze',   title: 'Food & Drinks',         concept: 'food',            emoji: '🍎', seed: 'everyday food and drink: apple, bread, rice, milk, water, egg, cheese, banana, cake, juice, tea' },
  { id: 7,  stage: 'A1', tier: 'bronze',   title: 'Pronouns',              concept: 'pronouns',        emoji: '🙋', seed: 'subject pronouns: I, you, he, she, it, we, they — when to use each' },
  { id: 8,  stage: 'A1', tier: 'bronze',   title: 'The verb "to be"',      concept: 'to_be',           emoji: '✨', seed: 'am, is, are — I am, you are, he/she/it is, we/they are' },
  { id: 9,  stage: 'A1', tier: 'bronze',   title: 'Articles a / an / the', concept: 'articles',        emoji: '🔠', seed: 'when to use a, an, the. a + consonant sound, an + vowel sound, the for specific things' },
  { id: 10, stage: 'A1', tier: 'bronze',   title: 'Simple Present Tense',  concept: 'simple_present',  emoji: '🌞', seed: 'simple present for habits and facts: I play, he plays, she eats, they go' },

  // ===================== A2 Building Blocks (Silver/Gold) =====================
  { id: 11, stage: 'A2', tier: 'silver',   title: 'Plurals',               concept: 'plurals',         emoji: '🔢', seed: 'making plurals: cat→cats, box→boxes, baby→babies, child→children, foot→feet' },
  { id: 12, stage: 'A2', tier: 'silver',   title: 'Possessives',           concept: 'possessives',     emoji: '🪪', seed: 'possessive pronouns and adjectives: my, your, his, her, our, their, mine, yours' },
  { id: 13, stage: 'A2', tier: 'silver',   title: 'Action Verbs',          concept: 'verbs_action',    emoji: '🏃', seed: 'common action verbs: run, jump, eat, drink, read, write, sleep, sing, dance, play, work' },
  { id: 14, stage: 'A2', tier: 'silver',   title: 'Simple Past Tense',     concept: 'simple_past',     emoji: '⏪', seed: 'simple past tense: played, ate, went, saw, did, made — regular and irregular' },
  { id: 15, stage: 'A2', tier: 'gold',     title: 'Question Words',        concept: 'questions',       emoji: '❓', seed: 'WH question words: what, where, when, why, who, how — when to use each' },
  { id: 16, stage: 'A2', tier: 'gold',     title: 'Adjectives',            concept: 'adjectives',      emoji: '🌈', seed: 'descriptive adjectives: big, small, hot, cold, tall, short, fast, slow, happy, sad, clean, dirty' },
  { id: 17, stage: 'A2', tier: 'gold',     title: 'Prepositions',          concept: 'prepositions',    emoji: '📍', seed: 'place prepositions: in, on, under, behind, in front of, next to, between, near' },
  { id: 18, stage: 'A2', tier: 'gold',     title: 'Adverbs of Time',       concept: 'adverbs_time',    emoji: '⏰', seed: 'time adverbs and expressions: today, tomorrow, yesterday, now, later, soon, always, never, often, sometimes' },

  // ===================== A2+ Vocabulary (Gold/Platinum) =====================
  { id: 19, stage: 'A2+', tier: 'gold',     title: 'Synonyms',              concept: 'synonyms',        emoji: '🤝', seed: 'words with the same meaning: happy=joyful, big=large, fast=quick, kind=nice, smart=clever' },
  { id: 20, stage: 'A2+', tier: 'platinum', title: 'Antonyms',              concept: 'antonyms',        emoji: '↔️', seed: 'words with opposite meanings: hot/cold, big/small, fast/slow, happy/sad, light/dark, full/empty' },
  { id: 21, stage: 'A2+', tier: 'platinum', title: 'Compound Words',        concept: 'compounds',       emoji: '🧩', seed: 'words made from two words: sunshine, classroom, toothbrush, basketball, rainbow, butterfly, newspaper' },
  { id: 22, stage: 'A2+', tier: 'platinum', title: 'Prefixes & Suffixes',   concept: 'affixes',         emoji: '🧪', seed: 'common prefixes (un-, re-, dis-) and suffixes (-ful, -less, -ly, -er): happy→unhappy, care→careful→careless' },
  { id: 23, stage: 'A2+', tier: 'platinum', title: 'Acronyms',              concept: 'acronyms',        emoji: '🔡', seed: 'common acronyms a child meets: USA, UK, UN, NASA, TV, OK, DIY, ID, DVD, ATM' },
  { id: 24, stage: 'A2+', tier: 'platinum', title: 'Common Idioms',         concept: 'idioms',          emoji: '💬', seed: 'kid-safe idioms: piece of cake, break a leg, hit the books, under the weather, cool as a cucumber' },

  // ===================== B1 Tenses (Platinum/Diamond) =====================
  { id: 25, stage: 'B1', tier: 'platinum', title: 'Present Continuous',    concept: 'present_continuous', emoji: '⏳', seed: 'present continuous (am/is/are + -ing): I am playing, she is reading, they are running' },
  { id: 26, stage: 'B1', tier: 'diamond',  title: 'Past Continuous',       concept: 'past_continuous',    emoji: '🕰️', seed: 'past continuous (was/were + -ing): I was sleeping when the phone rang' },
  { id: 27, stage: 'B1', tier: 'diamond',  title: 'Future Tense',          concept: 'future',             emoji: '🚀', seed: 'future tense: will + verb, going to + verb. I will help, she is going to study' },
  { id: 28, stage: 'B1', tier: 'diamond',  title: 'Present Perfect',       concept: 'present_perfect',    emoji: '✅', seed: 'present perfect (have/has + past participle): I have eaten, she has finished, they have gone' },
  { id: 29, stage: 'B1', tier: 'diamond',  title: 'Modal Verbs',           concept: 'modals',             emoji: '🧠', seed: 'modal verbs: can, could, should, must, may, might — ability, permission, advice, possibility' },

  // ===================== B1 Reading & Writing (Elite/Master) =====================
  { id: 30, stage: 'B1', tier: 'elite',    title: 'Sentence Structure',    concept: 'sentence_structure', emoji: '🏗️', seed: 'subject + verb + object. simple, compound, and complex sentence patterns' },
  { id: 31, stage: 'B1', tier: 'elite',    title: 'Punctuation & Conjunctions', concept: 'punctuation',  emoji: '✏️', seed: 'period, comma, question mark, exclamation. conjunctions: and, but, or, because, so' },
  { id: 32, stage: 'B1', tier: 'master',   title: 'Mini-Story Reading',    concept: 'reading',            emoji: '📖', seed: 'reading short 3-4 sentence stories and answering one comprehension question' },
];

const BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u]));

function getUnit(id) { return BY_ID[Number(id)] || null; }
function firstUnit() { return UNITS[0]; }
function nextUnitId(id) {
  const cur = UNITS.find((u) => u.id === Number(id));
  if (!cur) return null;
  const next = UNITS.find((u) => u.id === cur.id + 1);
  return next ? next.id : null;
}
function unitsByTier(tier) { return UNITS.filter((u) => u.tier === tier); }

// Allowed lesson types per concept. The first 5 are universal; certain
// concepts unlock specialized types.
const UNIVERSAL_TYPES = ['flashcard', 'match_pairs', 'fill_blank', 'listen_pick'];

function lessonTypesForUnit(unit) {
  if (!unit) return UNIVERSAL_TYPES;
  const c = unit.concept;
  const set = new Set(UNIVERSAL_TYPES);
  if (c === 'synonyms')   set.add('syn_ant_match');
  if (c === 'antonyms')   set.add('syn_ant_match');
  if (['simple_present','simple_past','present_continuous','past_continuous','future','present_perfect','modals','to_be'].includes(c)) {
    set.add('tense_pick');
  }
  if (['sentence_structure','punctuation','articles','prepositions'].includes(c)) {
    set.add('sentence_build');
  }
  if (c === 'reading') set.add('reading_qa');
  if (c === 'acronyms') set.add('acronym_expand');
  return Array.from(set);
}

// Lessons per unit. Kept small (5) so kids finish a unit in ~5 minutes.
const LESSONS_PER_UNIT = 5;

module.exports = { UNITS, getUnit, firstUnit, nextUnitId, unitsByTier, lessonTypesForUnit, LESSONS_PER_UNIT };
