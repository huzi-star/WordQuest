// levelGeneratorAgent.js
// AI-first level generator. Retries up to 3 times with progressively
// simpler prompts. Only as a last resort uses a tiny seed-word list so the
// app never hard-blocks on a single Gemini hiccup.

const { GoogleGenerativeAI } = require('@google/generative-ai');

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
function pickDirections(difficulty) {
  if (difficulty === 'easy') return ['horizontal', 'vertical'];
  if (difficulty === 'medium') return ['horizontal', 'vertical', 'diagonalDR'];
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
  { name: 'Fruits', emoji: '🍎', words: ['APPLE', 'MANGO', 'GRAPE', 'PEACH', 'LEMON', 'BANANA', 'ORANGE', 'CHERRY'] },
  { name: 'Animals', emoji: '🐯', words: ['TIGER', 'LION', 'EAGLE', 'HORSE', 'PANDA', 'WHALE', 'ZEBRA', 'CAMEL'] },
  { name: 'Colors', emoji: '🎨', words: ['BLUE', 'GREEN', 'BLACK', 'WHITE', 'AMBER', 'CORAL', 'INDIGO', 'CRIMSON'] },
  { name: 'Cities', emoji: '🏙️', words: ['TOKYO', 'PARIS', 'DUBAI', 'LAGOS', 'CAIRO', 'BERLIN', 'LONDON', 'BOSTON'] },
];

function emergencyPuzzle(wordCount, gridSize, lastCategory) {
  const pool = SEED_POOLS.filter((p) => p.name !== lastCategory);
  const cat = pool[Math.floor(Math.random() * pool.length)] || SEED_POOLS[0];
  const candidates = cat.words.filter((w) => w.length <= gridSize);
  return {
    category: cat.name,
    categoryEmoji: cat.emoji,
    words: candidates.slice(0, wordCount),
    funFact: 'AI offline — emergency mode. Try again for a richer category.',
  };
}

async function tryGenerate({ apiKey, prompt, gridSize }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 18000)),
  ]);
  const text = result.response.text() || '';
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
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const maxLen = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
  const langInstruction = language === 'urdu'
    ? 'Write the funFact in Roman Urdu mixed with English (Pakistani conversational style), max 25 words.'
    : 'Write the funFact in clear, friendly English, max 25 words.';

  const themeHint = levelNumber > 0
    ? `Level ${levelNumber} of 15. Lower numbers = familiar/common categories, higher numbers = exotic/rare.`
    : (dailySeed ? `Daily challenge for ${dailySeed}. Make it culturally rich and surprising.` : 'Pick any interesting world-wide category.');

  let aiResult = null;

  if (apiKey && apiKey !== 'your_key_here') {
    const prompts = [
      // Attempt 1: full instructions
      `You are a creative word-search puzzle designer. Pick any thematic category — Pakistani, Indian, world, sport, science, history, mythology, food, art — anything that suits a fun word-search game.

Constraints:
- Avoid category: ${lastCategory || 'none'}
- Difficulty: ${difficulty} (max ${maxLen} letters per word)
- ${themeHint}
- Exactly ${wordCount} words, all UPPERCASE A-Z only, no spaces or punctuation, all unique.
- Each word must be at most ${gridSize} letters.
- ${langInstruction}

Return ONLY this JSON (no markdown, no commentary):
{"category":"...","categoryEmoji":"...","words":["...","..."],"funFact":"..."}`,
      // Attempt 2: simplified
      `Give me ${wordCount} themed UPPERCASE English words (max ${maxLen} letters each) for a word-search puzzle. Pick any category. Return strict JSON: {"category":"...","categoryEmoji":"...","words":[...],"funFact":"..."}`,
      // Attempt 3: minimal
      `Return JSON: {"category":"Animals","categoryEmoji":"🐯","words":["TIGER","LION","ZEBRA","PANDA"],"funFact":"Animals fact."} — but pick a different category and ${wordCount} fitting words (max ${maxLen} letters, uppercase A-Z only).`,
    ];
    for (const prompt of prompts) {
      try {
        aiResult = await tryGenerate({ apiKey, prompt, gridSize });
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

  const allowedDirs = pickDirections(difficulty);
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
