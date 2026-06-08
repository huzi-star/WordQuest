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

// Verify a position actually traces the right word in the grid. Returns
// true if grid[startRow + dr*i][startCol + dc*i] === word[i] for every i.
// This is the SAME logic the mobile WordGrid uses to detect a found word,
// so passing this guarantees the kid can solve the puzzle.
function isPlacementTraceable(grid, size, word, pos) {
  if (!pos || !pos.direction) return false;
  const dir = DIRECTIONS[pos.direction];
  if (!dir) return false;
  const { dr, dc } = dir;
  for (let i = 0; i < word.length; i++) {
    const r = pos.startRow + dr * i;
    const c = pos.startCol + dc * i;
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    if (grid[r][c] !== word[i]) return false;
  }
  return true;
}

// Validate that EVERY requested word ended up traceable in the final grid.
// If even one word fails the trace, the puzzle is rejected so the caller
// can regenerate it instead of shipping an unsolvable round to the kid.
function validateAllPlacements(grid, size, words, positions) {
  if (!positions || positions.length !== words.length) {
    return { ok: false, reason: `placed=${positions ? positions.length : 0} of ${words.length}`, missing: words.filter((w) => !positions.find((p) => p.word === w)) };
  }
  const missing = [];
  for (const w of words) {
    const p = positions.find((x) => x.word === w);
    if (!p) { missing.push(w); continue; }
    if (!isPlacementTraceable(grid, size, w, p)) missing.push(w);
  }
  if (missing.length) return { ok: false, reason: 'trace-fail', missing };
  return { ok: true };
}

// Attempt to fill a single empty grid with ALL the words. Returns null
// if any word couldn't be placed — the caller retries with a fresh grid.
function attemptFullBuild(words, size, allowedDirections) {
  const grid = emptyGrid(size);
  const positions = [];
  // Longest-word-first improves placement success on tight grids.
  const ordered = [...words].sort((a, b) => b.length - a.length);
  for (const w of ordered) {
    if (w.length > size) return null; // can't fit at all
    const p = placeWord(grid, w, size, allowedDirections);
    if (!p) return null; // partial fill — caller retries
    positions.push(p);
  }
  return { grid, positions };
}

// Build a grid that guarantees ALL words are placed AND every placement
// is traceable. Retries up to 8 times (different RNG / order each time)
// before giving up. Only after success do we fill empty cells with noise
// so a placement gap never survives into the response.
function safeBuildGrid(words, size, allowedDirections) {
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = attemptFullBuild(words, size, allowedDirections);
    if (!built) continue;
    // Validate against the partially-filled grid (no noise letters yet) so
    // any latent bug — word-letter mismatch, out-of-bounds direction —
    // is caught before noise overwrites a missing cell.
    const v = validateAllPlacements(built.grid, size, words, built.positions);
    if (!v.ok) continue;
    // Fill noise letters last.
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!built.grid[r][c]) built.grid[r][c] = randLetter();
      }
    }
    // Re-validate after noise fill — noise must not corrupt a placement
    // (this can't happen logically since we only fill empties, but the
    // assertion makes the contract explicit and adds a safety check).
    const v2 = validateAllPlacements(built.grid, size, words, built.positions);
    if (!v2.ok) continue;
    return { grid: built.grid, positions: built.positions, attempts: attempt + 1 };
  }
  // Couldn't build a fully-placed grid after MAX_ATTEMPTS — return null
  // so the caller knows to drop / regenerate the word list.
  return null;
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
  tier = null, // bronze/silver/gold/platinum/diamond/elite/master — shapes word style
  // Practice Mode: caller passes a specific category to use. The agent
  // generates words FOR that category and we return its metadata as-is.
  forceCategory = '',
  forceCategoryEmoji = '',
  practiceHint = '',
  // Optional — passed so the guardrail can apply per-user repeat
  // detection across this player's last ~80 puzzles.
  userId = null,
}) {
  const TIERS = require('../config/tiers');
  const tierObj = tier ? TIERS.TIERS.find((t) => t.key === tier) : null;
  // When a tier is set, OVERRIDE caller-supplied grid/word count/length with
  // the tier's mandated puzzle configuration. The tier is the source of truth.
  if (tierObj?.puzzle) {
    gridSize = tierObj.puzzle.gridSize;
    wordCount = tierObj.puzzle.wordCount;
  }
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
  // Per-word length window. Tier puzzle config wins if present, else fall
  // back to legacy difficulty-based bounds.
  let maxLen, minLen;
  if (tierObj?.puzzle) {
    maxLen = Math.min(tierObj.puzzle.maxLen, gridSize);
    minLen = Math.min(tierObj.puzzle.minLen, maxLen);
  } else {
    const tierMax = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
    maxLen = Math.min(tierMax, gridSize);
    minLen = gridSize <= 3 ? 2 : gridSize <= 4 ? 2 : 3;
  }
  const langInstruction = language === 'urdu'
    ? 'Write the funFact in Roman Urdu mixed with English (Pakistani conversational style), max 25 words.'
    : 'Write the funFact in clear, friendly English, max 25 words.';

  const themeHint = levelNumber > 0
    ? `Level ${levelNumber} of 15. Lower numbers = familiar/common categories, higher numbers = exotic/rare.`
    : (dailySeed ? `Daily challenge for ${dailySeed}. Make it culturally rich and surprising.` : 'Pick any interesting world-wide category.');

  // When a tier is provided, prefer words matching that tier's difficulty
  // so the puzzle vocabulary scales with the player's progress.
  const tierHint = tierObj
    ? `Player tier: ${tierObj.name}. Word style for this tier: ${tierObj.wordStyle}. Keep words age-appropriate for children under 13.`
    : '';

  let aiResult = null;

  if (aiReady) {
    const NEUTRAL_CATS = TIERS.CATEGORIES.join(', ');
    const categoryDirective = forceCategory
      ? `Category is FIXED: "${forceCategory}". Generate words that fit that category.`
      : `Pick ONE category from this country-neutral list ONLY (no Pakistan/India/region specific themes):
${NEUTRAL_CATS}.`;
    const prompts = [
      // Attempt 1: full instructions
      `You are a creative word-search puzzle designer for an international English learning game for children aged 6 to 13.

${categoryDirective}
${practiceHint ? `Word style: ${practiceHint}` : ''}

Constraints:
- Avoid category: ${lastCategory || 'none'}
- Difficulty: ${difficulty}
- ${themeHint}
${tierHint ? `- ${tierHint}` : ''}
- Exactly ${wordCount} words, all UPPERCASE A-Z only, no spaces or punctuation, all unique.
- Every word must be simple enough for a class 5 student (age 10) to read.
- Each word must be between ${minLen} and ${maxLen} letters (HARD LIMIT — every word must fit in a ${gridSize}×${gridSize} grid).
- Write the funFact in clear simple English (max 25 words). NEVER use Urdu, Hindi, or any non-English language.

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

  let chosenWords = aiResult.words.slice(0, wordCount);
  if (!chosenWords.length) {
    throw new Error('No words available even with emergency fallback');
  }

  // SAFETY GUARDRAIL — strip any word the guardrail agent rejects. Words
  // get the 'kid' age group + 'word' type → blocklist + length cap apply.
  try {
    const guardrailAgent = require('./guardrailAgent');
    const gr = await guardrailAgent({
      content: chosenWords, type: 'word', ageGroup: 'kid', userId,
    });
    if (gr && Array.isArray(gr.allowed)) {
      chosenWords = gr.allowed;
    }
  } catch (_) { /* never block puzzle gen on guardrail failure */ }
  if (!chosenWords.length) {
    throw new Error('All words blocked by safety guardrail');
  }

  // SAFETY GUARDRAIL — also guard category name, emoji, and fun fact so
  // the puzzle metadata visible on the GameScreen is never offensive /
  // age-inappropriate. If any field is flagged, fall back to a safe value.
  let safeCategory = aiResult.category;
  let safeEmoji = aiResult.categoryEmoji;
  let safeFunFact = aiResult.funFact || '';
  try {
    const { guardText } = require('../utils/guardrailRunner');
    const c1 = await guardText(String(safeCategory || ''), 'tutor', { ageGroup: 'kid', userId });
    if (c1 === null) safeCategory = lastCategory || 'Mix';
    const c2 = await guardText(String(safeFunFact || ''), 'tutor', { ageGroup: 'kid', userId });
    if (c2 === null) safeFunFact = '';
    // Emoji guardrail — emojis are visual; we accept anything that isn't
    // a slur (rare). guardText handles emojis fine.
    const c3 = await guardText(String(safeEmoji || ''), 'tutor', { ageGroup: 'kid', userId });
    if (c3 === null) safeEmoji = '✨';
  } catch (_) { /* never block puzzle gen on guardrail failure */ }

  const allowedDirs = pickDirections();
  // safeBuildGrid now retries 8x and validates EVERY word is traceable
  // along its recorded direction. Returns null only when even an aggressive
  // retry can't fit the given words — in that case drop the longest word
  // and retry, repeating until we have a fully-placed traceable grid OR
  // the list shrinks to the bare minimum playable size (2 words).
  let built = null;
  let attempt = 0;
  let drops = 0;
  while (!built && chosenWords.length >= 2 && attempt < 6) {
    attempt++;
    built = safeBuildGrid(chosenWords, gridSize, allowedDirs);
    if (!built) {
      // Drop the longest word (most likely the blocker) and try again.
      const longestIdx = chosenWords.reduce((best, w, i) => w.length > chosenWords[best].length ? i : best, 0);
      const dropped = chosenWords[longestIdx];
      chosenWords = chosenWords.filter((_, i) => i !== longestIdx);
      drops += 1;
      console.warn(`[levelGenerator] grid build failed (attempt ${attempt}), dropping "${dropped}" (was too tight). Remaining: ${chosenWords.length}`);
    }
  }
  if (!built) {
    throw new Error('levelGenerator: could not build a fully-placed traceable grid even after dropping long words');
  }
  const { grid, positions } = built;
  // Final assertion — paranoia check that what we are about to return is
  // actually solvable. validateAllPlacements is pure and runs in <1ms.
  const finalCheck = validateAllPlacements(grid, gridSize, positions.map((p) => p.word), positions);
  if (!finalCheck.ok) {
    throw new Error(`levelGenerator: post-build validation failed (${finalCheck.reason}) missing=${(finalCheck.missing || []).join(',')}`);
  }
  if (drops > 0) {
    console.warn(`[levelGenerator] succeeded after dropping ${drops} unplaceable word(s); final word count = ${positions.length}`);
  }

  return {
    category: safeCategory,
    categoryEmoji: safeEmoji,
    words: positions.map((p) => p.word),
    grid,
    wordPositions: positions,
    funFact: safeFunFact,
  };
}

module.exports = levelGeneratorAgent;
