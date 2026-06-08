// Practice Mode — unranked, AI-adaptive word search.
//
// Each request picks ONE random category from the difficulty's category
// pool, hands it to the existing levelGeneratorAgent with the difficulty's
// grid/word count, and returns a fully built level. The mobile client
// decides the next difficulty based on whether the player passed.
//
// Practice never touches tier_points / leaderboard. The backend is
// stateless here — caller passes `difficulty` per request.

const express = require('express');
const router = express.Router();
const levelGeneratorAgent = require('../agents/levelGeneratorAgent');
const chaalbaazAgent = require('../agents/chaalbaazAgent');

const DIFFICULTIES = {
  easy:   { gridSize: 6,  wordCount: 5, timeLimit: 75 },
  medium: { gridSize: 8,  wordCount: 7, timeLimit: 65 },
  hard:   { gridSize: 10, wordCount: 8, timeLimit: 65 },
};

// Category pools tuned for KID-FRIENDLY play. "Hard" used to include
// "Science Terms", "Math Terms", "Health & Medicine" which kept emitting
// words like PHOTOSYNTHESIS / MITOCHONDRIA / ANATOMY — way too tough
// for the under-13 audience. The replacement set keeps the feeling of
// progression (more themed, more vocab-rich) without ever leaving the
// kid-safe vocabulary band.
const CATEGORY_POOLS = {
  easy: [
    { name: 'Animals',         emoji: '🐯' },
    { name: 'Colors',          emoji: '🎨' },
    { name: 'Body Parts',      emoji: '🦷' },
    { name: 'Food & Drinks',   emoji: '🍎' },
    { name: 'Numbers',         emoji: '🔢' },
    { name: 'Family Members',  emoji: '👨‍👩‍👧' },
    { name: 'Home Objects',    emoji: '🏠' },
    { name: 'Nature',          emoji: '🌳' },
    { name: 'Fruits',          emoji: '🍇' },
    { name: 'Vegetables',      emoji: '🥕' },
    { name: 'Clothes',         emoji: '👕' },
    { name: 'Transport',       emoji: '🚗' },
  ],
  medium: [
    { name: 'School Supplies', emoji: '✏️' },
    { name: 'Sports',          emoji: '⚽' },
    { name: 'Weather',         emoji: '🌧' },
    { name: 'Emotions',        emoji: '😊' },
    { name: 'Sea Creatures',   emoji: '🐠' },
    { name: 'Garden & Plants', emoji: '🌷' },
    { name: 'Jobs',            emoji: '👩‍⚕️' },
    { name: 'Days & Months',   emoji: '📅' },
    { name: 'Cooking Things',  emoji: '🍳' },
    { name: 'Toys & Games',    emoji: '🧸' },
  ],
  hard: [
    { name: 'Character Traits',    emoji: '🧠' },
    { name: 'Animals at the Zoo',  emoji: '🦁' },
    { name: 'Space & Planets',     emoji: '🪐' },
    { name: 'Country Names',       emoji: '🌍' },
    { name: 'Art & Music',         emoji: '🎨' },
    { name: 'Nature & Weather',    emoji: '🌱' },
    { name: 'World Cultures',      emoji: '🪔' },
    { name: 'Action Words',        emoji: '🏃' },
    { name: 'Travel Words',        emoji: '✈️' },
    { name: 'House Rooms',         emoji: '🛋' },
  ],
};

const PER_DIFFICULTY_HINT = {
  easy:   'KID-SAFE words ONLY for a 6-7 year old. Words 3-5 letters. No abstract concepts. No scientific terms. No medical terms.',
  medium: 'KID-SAFE words for an 8-10 year old. Words 4-6 letters. Familiar everyday vocabulary, no jargon, no scientific names.',
  hard:   'KID-SAFE words for an 11-13 year old. Words 5-8 letters MAX. Concrete nouns or simple emotion/trait words only. NEVER use scientific terms, medical jargon, chemistry/biology vocabulary, or any word a 12-year-old would not see in regular school speech. Forbidden examples: PHOTOSYNTHESIS, MITOCHONDRIA, RESPIRATION, ANATOMY, MOLECULE.',
};

function pickCategory(diff, lastCategory) {
  const pool = CATEGORY_POOLS[diff] || CATEGORY_POOLS.easy;
  const filtered = pool.filter((c) => c.name !== lastCategory);
  const arr = filtered.length ? filtered : pool;
  return arr[Math.floor(Math.random() * arr.length)];
}

router.post('/api/practice/round', async (req, res) => {
  try {
    const { difficulty = 'easy', lastCategory = '', language = 'english', playerStats = {}, userId = null } = req.body || {};
    const diff = DIFFICULTIES[difficulty] ? difficulty : 'easy';
    let cfg = { ...DIFFICULTIES[diff] };
    const cat = pickCategory(diff, lastCategory);

    // Hybrid escalation: difficulty selector is the base, Chaalbaaz bumps
    // grid/words/time if the player is dominating their current setting.
    let chaalbaazActive = false;
    let chaalbaazReason = '';
    const bump = await chaalbaazAgent({
      mode: 'tune',
      playerStats,
      baseDifficulty: { ...cfg, difficulty: diff },
    });
    if (bump) {
      cfg = {
        gridSize:  bump.gridSize  ?? cfg.gridSize,
        wordCount: bump.wordCount ?? cfg.wordCount,
        timeLimit: bump.timeLimit ?? cfg.timeLimit,
      };
      chaalbaazActive = true;
      chaalbaazReason = bump.reason || '';
    }

    // The level generator picks the category itself by prompt — we steer
    // it by overriding lastCategory to "block" every category except ours
    // is not feasible. Instead, generate then override category metadata
    // with our chosen one; the AI words still scale per difficulty via the
    // levelNumber + difficulty fields we feed in.
    const level = await levelGeneratorAgent({
      difficulty: diff,
      wordCount: cfg.wordCount,
      gridSize: cfg.gridSize,
      language,
      // Encode our chosen category + per-difficulty hint into the prompt by
      // piggybacking on lastCategory (so the agent avoids the OPPOSITE of
      // what we want — that's actually wrong). Instead, force category by
      // bypassing the agent's own category pick:
      forceCategory: cat.name,
      forceCategoryEmoji: cat.emoji,
      practiceHint: PER_DIFFICULTY_HINT[diff],
      userId,
    });

    return res.json({
      ok: true,
      result: {
        difficulty: diff,
        category: cat.name,
        categoryEmoji: cat.emoji,
        gridSize: cfg.gridSize,
        wordCount: cfg.wordCount,
        timeLimit: cfg.timeLimit,
        words: level.words,
        grid: level.grid,
        wordPositions: level.wordPositions,
        funFact: level.funFact || '',
        chaalbaazActive,
        chaalbaazReason,
      },
    });
  } catch (err) {
    console.error('practice/round error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
