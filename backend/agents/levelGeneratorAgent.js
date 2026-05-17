// levelGeneratorAgent.js
// Uses Google Gemini to generate a themed word search puzzle.
// Falls back to a locally generated puzzle if Gemini is unavailable.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const CATEGORIES = [
  { name: 'Pakistani Cities', emoji: '🏙️', words: ['LAHORE', 'KARACHI', 'MULTAN', 'QUETTA', 'SIALKOT', 'PESHAWAR'] },
  { name: 'Pakistani Foods', emoji: '🍛', words: ['BIRYANI', 'NIHARI', 'HALEEM', 'KEBAB', 'PULAO', 'SAMOSA'] },
  { name: 'Cricket Players', emoji: '🏏', words: ['BABAR', 'SHAHEEN', 'RIZWAN', 'AFRIDI', 'IMAM', 'NASEEM'] },
  { name: 'Urdu Words', emoji: '📜', words: ['MOHABBAT', 'KHUSHI', 'SUKOON', 'YAARI', 'IZZAT', 'DOST'] },
  { name: 'Pakistan Districts', emoji: '🗺️', words: ['SWAT', 'GUJRAT', 'KASUR', 'BAHAWAL', 'CHITRAL', 'JHANG'] },
  { name: 'Pakistani Singers', emoji: '🎤', words: ['NUSRAT', 'ATIF', 'RAHAT', 'ABIDA', 'NOORI', 'MEESHA'] },
  { name: 'PSL Teams', emoji: '🏆', words: ['LAHORE', 'KARACHI', 'MULTAN', 'QUETTA', 'ISLAMABAD', 'PESHAWAR'] },
  { name: 'Pakistani Fruits', emoji: '🥭', words: ['MANGO', 'GUAVA', 'ORANGE', 'MELON', 'LYCHEE', 'PAPAYA'] },
  { name: 'Pakistani Monuments', emoji: '🕌', words: ['MINAR', 'BADSHAHI', 'FAISAL', 'SHALIMAR', 'TOMB', 'WAZIR'] },
  { name: 'Pakistani Heroes', emoji: '🦸', words: ['JINNAH', 'IQBAL', 'EDHI', 'MALALA', 'KHAN', 'LIAQAT'] },
];

const FUN_FACTS = {
  'Pakistani Cities': 'Karachi is the largest city in Pakistan with over 16 million people!',
  'Pakistani Foods': 'Biryani came to South Asia with the Mughals and has dozens of regional styles.',
  'Cricket Players': 'Babar Azam was once ranked #1 ODI batsman in the world.',
  'Urdu Words': 'Urdu is the national language of Pakistan and uses a Perso-Arabic script.',
  'Pakistan Districts': 'Pakistan has over 160 administrative districts.',
  'Pakistani Singers': 'Nusrat Fateh Ali Khan is one of the greatest Qawwali singers of all time.',
  'PSL Teams': 'The Pakistan Super League was founded in 2015.',
  'Pakistani Fruits': 'Pakistan is one of the largest mango producers in the world.',
  'Pakistani Monuments': 'Badshahi Mosque in Lahore was built in 1673 by Aurangzeb.',
  'Pakistani Heroes': 'Abdul Sattar Edhi ran the worlds largest volunteer ambulance service.',
};

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

// Directions: hv only for easy, add diagonal for medium+, plus reverses
// for hard. dr/dc give the row/col step per letter.
const DIRECTIONS = {
  horizontal: { dr: 0, dc: 1 },
  vertical:   { dr: 1, dc: 0 },
  diagonalDR: { dr: 1, dc: 1 },   // diagonal down-right
  diagonalDL: { dr: 1, dc: -1 },  // diagonal down-left
};

function pickDirections(difficulty) {
  if (difficulty === 'easy') return ['horizontal', 'vertical'];
  if (difficulty === 'medium') return ['horizontal', 'vertical', 'diagonalDR'];
  return ['horizontal', 'vertical', 'diagonalDR', 'diagonalDL'];
}

function placeWord(grid, word, size, allowedDirections) {
  const w = word.length;
  if (w > size) return false;
  for (let tries = 0; tries < 120; tries++) {
    const dirName = allowedDirections[Math.floor(Math.random() * allowedDirections.length)];
    const { dr, dc } = DIRECTIONS[dirName];

    // Pick a valid starting row/col so the word fits within bounds.
    const maxRow = dr > 0 ? size - w : size - 1;
    const maxCol = dc > 0 ? size - w : (dc < 0 ? size - 1 : size - 1);
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
      const r = row + dr * i;
      const c = col + dc * i;
      grid[r][c] = word[i];
    }
    return {
      word,
      startRow: row,
      startCol: col,
      direction: dirName, // 'horizontal' / 'vertical' / 'diagonalDR' / 'diagonalDL'
    };
  }
  return false;
}

function buildLocalPuzzle(difficulty, wordCount, lastCategory, gridSize = 8) {
  const pool = CATEGORIES.filter(c => c.name !== lastCategory);
  const cat = pool[Math.floor(Math.random() * pool.length)];
  const maxLen = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
  // Words must also fit inside the grid.
  const fitLen = Math.min(maxLen, gridSize);
  const unique = Array.from(new Set(cat.words.map(w => w.toUpperCase())));
  const filtered = unique.filter(w => w.length <= fitLen);
  const chosen = filtered.slice(0, wordCount);
  for (const w of unique) {
    if (chosen.length >= wordCount) break;
    if (!chosen.includes(w) && w.length <= gridSize) chosen.push(w);
  }

  const grid = emptyGrid(gridSize);
  const positions = [];
  const allowedDirs = pickDirections(difficulty);
  for (const w of chosen) {
    const p = placeWord(grid, w, gridSize, allowedDirs);
    if (p) positions.push(p);
  }
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!grid[r][c]) grid[r][c] = randLetter();
    }
  }
  return {
    category: cat.name,
    categoryEmoji: cat.emoji,
    words: positions.map(p => p.word),
    grid,
    wordPositions: positions,
    funFact: FUN_FACTS[cat.name] || 'Pakistan has a rich culture and history!',
  };
}

async function levelGeneratorAgent(difficultyData) {
  const { difficulty, wordCount, gridSize = 8 } = difficultyData;
  const lastCategory = difficultyData.lastCategory || '';
  const apiKey = process.env.GEMINI_API_KEY;

  // Always build a local puzzle so we have a guaranteed valid grid of the
  // requested size — Gemini's grid validation is unreliable for non-8x8.
  // Gemini is then asked to pick category + funFact, words come from local
  // pool. This guarantees a valid playable grid every time.
  const localPuzzle = buildLocalPuzzle(difficulty, wordCount, lastCategory, gridSize);

  if (!apiKey || apiKey === 'your_key_here') {
    return localPuzzle;
  }

  // Optional: ask Gemini ONLY for a richer fun fact about the chosen category.
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are writing a one-sentence interesting fun fact (Roman Urdu mix English) about the Pakistani category "${localPuzzle.category}". Max 25 words. Output ONLY the sentence.`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('funfact timeout')), 6000)),
    ]);
    const text = (result.response.text() || '').trim().replace(/^["']|["']$/g, '');
    if (text && text.length < 200) {
      localPuzzle.funFact = text;
    }
  } catch (err) {
    // keep static funFact
  }

  return localPuzzle;
}

module.exports = levelGeneratorAgent;
