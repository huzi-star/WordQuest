// levelGeneratorAgent.js
// AI-first level generator. Retries up to 3 times with progressively
// simpler prompts. Only as a last resort uses a tiny seed-word list so the
// app never hard-blocks on a single Gemini hiccup.

const { generate, isConfigured } = require('../utils/llm');

function emptyGrid(size) {
  const g = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) row.push('');
    g.push(row);
  }
  return g;
}
function randLetter() { return String.fromCharCode(65 + Math.floor(Math.random() * 26)); }

const DIRECTIONS = {
  horizontal: { dr: 0, dc: 1 },
  vertical:   { dr: 1, dc: 0 },
  diagonalDR: { dr: 1, dc: 1 },
  diagonalDL: { dr: 1, dc: -1 },
};
function pickDirections() {
  // Every difficulty offers all 4 placement directions (H, V, ↘, ↙) so
  // diagonal words show up regardless of level.
  return ['horizontal', 'vertical', 'diagonalDR', 'diagonalDL'];
}

function placeWord(grid, word, size, allowedDirections) {
  const w = word.length;
  if (w > size) return false;
  for (let tries = 0; tries < 200; tries++) {
    const dirName = allowedDirections[Math.floor(Math.random() * allowedDirections.length)];
    const { dr, dc } = DIRECTIONS[dirName];
    const maxRow = dr > 0 ? size - w : size - 1;
    const maxCol = dc > 0 ? size - w : size - 1;
    const minRow = dr < 0 ? w - 1 : 0;
    const minCol = dc < 0 ? w - 1 : 0;
    const row = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
    const col = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
    let ok = true;
    for (let i = 0; i < w; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || c < 0 || r >= size || c >= size) { ok = false; break; }
      if (grid[r][c] && grid[r][c] !== word[i]) { ok = false; break; }
    }
    if (!ok) continue;
    for (let i = 0; i < w; i++) grid[row + dr * i][col + dc * i] = word[i];
    return { word, startRow: row, startCol: col, direction: dirName };
  }
  return false;
}

function safeBuildGrid(words, size, allowedDirections) {
  const grid = emptyGrid(size);
  const positions = [];
  for (const w of words) {
    const p = placeWord(grid, w, size, allowedDirections);
    if (p) positions.push(p);
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) grid[r][c] = randLetter();
    }
  }
  return { grid, positions };
}

// Minimal emergency seed pool used ONLY if Gemini fails all retries.
// Tiny and universal so the app continues to work offline.
const SEED_POOLS = [
  {
    name: 'Tiny Words', emoji: '🔤',
    // 2-3 letter words for very small grids (Levels 1-2).
    words: ['CAT', 'DOG', 'SUN', 'MAP', 'CAR', 'PEN', 'BOX', 'KEY', 'CUP', 'FAN', 'BAT', 'OWL', 'BEE', 'FOX', 'PIG', 'COW', 'EGG', 'INK', 'JAR'],
  },
  {
    name: 'Short Words', emoji: '✏️',
    // 3-4 letter words for 4×4 / 5×5 grids.
    words: ['FISH', 'BIRD', 'TREE', 'STAR', 'MOON', 'RAIN', 'WIND', 'FIRE', 'GOLD', 'IRON', 'MILK', 'RICE', 'WALL', 'BOOK', 'ROAD', 'CITY', 'KING', 'SHIP'],
  },
  { name: 'Fruits',  emoji: '🍎', words: ['FIG', 'PEAR', 'PLUM', 'LIME', 'KIWI', 'APPLE', 'MANGO', 'GRAPE', 'PEACH', 'LEMON', 'BANANA', 'ORANGE', 'CHERRY'] },
  { name: 'Animals', emoji: '🐯', words: ['BAT', 'CAT', 'DOG', 'FOX', 'PIG', 'COW', 'OWL', 'BEE', 'LION', 'BEAR', 'WOLF', 'DEER', 'TIGER', 'EAGLE', 'HORSE', 'PANDA', 'WHALE', 'ZEBRA', 'CAMEL'] },
  { name: 'Colors',  emoji: '🎨', words: ['RED', 'TAN', 'BLUE', 'CYAN', 'GOLD', 'PINK', 'TEAL', 'GREEN', 'BLACK', 'WHITE', 'AMBER', 'CORAL', 'INDIGO', 'CRIMSON'] },
  { name: 'Cities',  emoji: '🏙️', words: ['ROME', 'LIMA', 'OSLO', 'BAKU', 'KIEV', 'TOKYO', 'PARIS', 'DUBAI', 'LAGOS', 'CAIRO', 'SEOUL', 'BERLIN', 'LONDON', 'BOSTON'] },
];

function emergencyPuzzle(wordCount, gridSize, lastCategory) {
  // Try each category in random order, only pick one that has enough words
  // that actually fit the requested grid size.
  const pool = SEED_POOLS
    .filter((p) => p.name !== lastCategory)
    .sort(() => Math.random() - 0.5);
  for (const cat of pool) {
    const candidates = cat.words.filter((w) => w.length <= gridSize && w.length >= 2);
    if (candidates.length >= wordCount) {
      const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, wordCount);
      return {
        category: cat.name,
        categoryEmoji: cat.emoji,
        words: shuffled,
        funFact: 'AI offline — playing with a fallback word pack. Try again for a richer category.',
      };
    }
  }
  // Last-ditch: take whatever fits from any pool, even if fewer than wordCount.
  const allFit = SEED_POOLS.flatMap((p) => p.words)
    .filter((w) => w.length <= gridSize && w.length >= 2);
  const unique = Array.from(new Set(allFit)).slice(0, Math.max(1, wordCount));
  return {
    category: 'Mixed',
    categoryEmoji: '🎯',
    words: unique,
    funFact: 'AI offline — short-word fallback active.',
  };
}

async function tryGenerate({ prompt, gridSize }) {
  const text = await generate(prompt, { agent: 'levelGeneratorAgent',
    timeoutMs: 18000,
    temperature: 0.85,
    maxTokens: 700,
    responseFormat: 'json',
  });
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON in response');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  const words = Array.from(new Set(
    (parsed.words || [])
      .map((w) => String(w).toUpperCase().replace(/[^A-Z]/g, ''))
      .filter((w) => w.length > 1 && w.length <= gridSize),
  ));
  if (!words.length) throw new Error('No usable words');
  return {
    category: String(parsed.category || 'Word Quest'),
    categoryEmoji: String(parsed.categoryEmoji || '🎯'),
    words,
    funFact: String(parsed.funFact || ''),
  };
}

async function levelGeneratorAgent({
  difficulty = 'easy',
  wordCount = 4,
  gridSize = 8,
  language = 'english',
  levelNumber = 0,
  dailySeed = null,
  lastCategory = '',
  // Level-Mode retry: caller passes the existing word list, we just reshuffle
  // them onto a fresh grid (no Gemini call, no new category).
  reshuffleWords = null,
  reshuffleCategory = '',
  reshuffleEmoji = '',
  reshuffleFunFact = '',
}) {
  const aiReady = isConfigured();

  // RESHUFFLE FAST-PATH — used by Level Mode retries.
  if (Array.isArray(reshuffleWords) && reshuffleWords.length) {
    const cleaned = Array.from(new Set(
      reshuffleWords
        .map((w) => String(w).toUpperCase().replace(/[^A-Z]/g, ''))
        .filter((w) => w.length > 1 && w.length <= gridSize),
    )).slice(0, wordCount);
    const allowedDirs = pickDirections();
    const { grid, positions } = safeBuildGrid(cleaned, gridSize, allowedDirs);
    return {
      category: reshuffleCategory || 'Word Quest',
      categoryEmoji: reshuffleEmoji || '🔁',
      words: positions.map((p) => p.word),
      grid,
      wordPositions: positions,
      funFact: reshuffleFunFact || 'Same words, brand-new layout. Find them again!',
      reshuffled: true,
    };
  }
  // Per-word length window. Critically — capped by grid size so small grids
  // (Level 1 = 3×3) get short words, not 6-letter words that all get filtered.
  const tierMax = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
  const maxLen = Math.min(tierMax, gridSize);
  const minLen = gridSize <= 3 ? 2 : gridSize <= 4 ? 2 : 3;
  const langInstruction = language === 'urdu'
    ? 'Write the funFact in Roman Urdu mixed with English (Pakistani conversational style), max 25 words.'
    : 'Write the funFact in clear, friendly English, max 25 words.';

  const themeHint = levelNumber > 0
    ? `Level ${levelNumber} of 15. Lower numbers = familiar/common categories, higher numbers = exotic/rare.`
    : (dailySeed ? `Daily challenge for ${dailySeed}. Make it culturally rich and surprising.` : 'Pick any interesting world-wide category.');

  let aiResult = null;

  if (aiReady) {
    const prompts = [
      // Attempt 1: full instructions
      `You are a creative word-search puzzle designer. Pick any thematic category — Pakistani, Indian, world, sport, science, history, mythology, food, art — anything that suits a fun word-search game.

Constraints:
- Avoid category: ${lastCategory || 'none'}
- Difficulty: ${difficulty}
- ${themeHint}
- Exactly ${wordCount} words, all UPPERCASE A-Z only, no spaces or punctuation, all unique.
- Each word must be between ${minLen} and ${maxLen} letters (HARD LIMIT — every word must fit in a ${gridSize}×${gridSize} grid).
- ${langInstruction}

Return ONLY this JSON (no markdown, no commentary):
{"category":"...","categoryEmoji":"...","words":["...","..."],"funFact":"..."}`,
      // Attempt 2: simplified
      `Give me ${wordCount} themed UPPERCASE English words, each ${minLen}-${maxLen} letters long, for a ${gridSize}×${gridSize} word-search puzzle. Pick any category. Return strict JSON: {"category":"...","categoryEmoji":"...","words":[...],"funFact":"..."}`,
      // Attempt 3: minimal — for very small grids, use 2-3 letter examples.
      gridSize <= 3
        ? `Return JSON: {"category":"Tiny","categoryEmoji":"🔤","words":["CAT","DOG","SUN"],"funFact":"Short words."} — but pick ${wordCount} different ${minLen}-${maxLen} letter words.`
        : `Return JSON: {"category":"Animals","categoryEmoji":"🐯","words":["LION","BEAR","WOLF","DEER"],"funFact":"Animals fact."} — but pick a different category and ${wordCount} fitting words (${minLen}-${maxLen} letters, uppercase A-Z only).`,
    ];
    for (const prompt of prompts) {
      try {
        aiResult = await tryGenerate({ prompt, gridSize });
        break;
      } catch (err) {
        console.warn('[levelGenerator] attempt failed:', err.message);
      }
    }
  }

  // Last-resort emergency seed pool. Keeps the app playable when AI is down.
  if (!aiResult) {
    aiResult = emergencyPuzzle(wordCount, gridSize, lastCategory);
  }

  const chosenWords = aiResult.words.slice(0, wordCount);
  if (!chosenWords.length) {
    throw new Error('No words available even with emergency fallback');
  }

  const allowedDirs = pickDirections();
  const { grid, positions } = safeBuildGrid(chosenWords, gridSize, allowedDirs);

  return {
    category: aiResult.category,
    categoryEmoji: aiResult.categoryEmoji,
    words: positions.map((p) => p.word),
    grid,
    wordPositions: positions,
    funFact: aiResult.funFact || '',
  };
}

module.exports = levelGeneratorAgent;
