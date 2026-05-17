// levelGeneratorAgent.js
// AI-only level generator. Gemini picks an interesting word-search category
// (Pakistani, Indian, world, sports, science, anything) and generates the
// full puzzle. No hardcoded word lists.

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

function randLetter() {
  return String.fromCharCode(65 + Math.floor(Math.random() * 26));
}

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
    for (let i = 0; i < w; i++) {
      grid[row + dr * i][col + dc * i] = word[i];
    }
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

async function levelGeneratorAgent({
  difficulty = 'easy',
  wordCount = 4,
  gridSize = 8,
  language = 'urdu',
  levelNumber = 0,
  dailySeed = null,
  lastCategory = '',
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('Gemini API key missing — AI level generation unavailable');
  }

  const maxLen = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
  const themeHint = levelNumber > 0
    ? `This is level ${levelNumber} of 15. Lower levels = more familiar categories, higher levels = exotic/rare.`
    : (dailySeed ? `Daily challenge for date ${dailySeed}. Make it culturally rich and surprising.` : 'Pick any interesting category.');

  const langInstruction = language === 'english'
    ? 'Write the funFact in clear English, max 25 words.'
    : 'Write the funFact in Roman Urdu mixed with English (Pakistani conversational style), max 25 words.';

  const prompt = `You are a creative word-search puzzle designer. Choose ANY thematic category — it can be Pakistani culture, Indian culture, world cities, world foods, famous athletes, science terms, classical literature, mythology, anything that fits a word-search game. Surprise the player.

Constraints:
- Category should NOT be: ${lastCategory || 'none'}
- Difficulty: ${difficulty} (${maxLen} letters max per word)
- ${themeHint}
- Generate exactly ${wordCount} words for the category, all UPPERCASE letters, no spaces or hyphens, all words must be unique.
- All words must be ${gridSize} letters or shorter (since grid is ${gridSize}x${gridSize}).
- ${langInstruction}

Return STRICTLY valid JSON only (no markdown, no commentary), with this exact shape:
{
  "category": "Display name of the category",
  "categoryEmoji": "single emoji that fits the category",
  "words": ["WORD1", "WORD2", ...],
  "funFact": "one sentence about this category"
}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('level gen timeout')), 18000)),
  ]);
  const text = result.response.text();
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

  // Sanitize & dedupe words.
  const words = Array.from(
    new Set(
      (parsed.words || [])
        .map((w) => String(w).toUpperCase().replace(/[^A-Z]/g, ''))
        .filter((w) => w.length > 1 && w.length <= gridSize),
    ),
  ).slice(0, wordCount);
  if (!words.length) throw new Error('AI returned no usable words');

  const allowedDirs = pickDirections(difficulty);
  const { grid, positions } = safeBuildGrid(words, gridSize, allowedDirs);

  return {
    category: String(parsed.category || 'Word Quest'),
    categoryEmoji: String(parsed.categoryEmoji || '🎯'),
    words: positions.map((p) => p.word),
    grid,
    wordPositions: positions,
    funFact: String(parsed.funFact || ''),
  };
}

module.exports = levelGeneratorAgent;
