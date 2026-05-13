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

function placeWord(grid, word, size) {
  const horizontal = Math.random() < 0.5;
  const w = word.length;
  if (w > size) return false;
  for (let tries = 0; tries < 60; tries++) {
    const row = Math.floor(Math.random() * (horizontal ? size : size - w + 1));
    const col = Math.floor(Math.random() * (horizontal ? size - w + 1 : size));
    let ok = true;
    for (let i = 0; i < w; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      if (grid[r][c] && grid[r][c] !== word[i]) { ok = false; break; }
    }
    if (!ok) continue;
    for (let i = 0; i < w; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      grid[r][c] = word[i];
    }
    return {
      word,
      startRow: row,
      startCol: col,
      direction: horizontal ? 'horizontal' : 'vertical',
    };
  }
  return false;
}

function buildLocalPuzzle(difficulty, wordCount, lastCategory) {
  const pool = CATEGORIES.filter(c => c.name !== lastCategory);
  const cat = pool[Math.floor(Math.random() * pool.length)];
  const maxLen = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
  const unique = Array.from(new Set(cat.words.map(w => w.toUpperCase())));
  const filtered = unique.filter(w => w.length <= maxLen);
  const chosen = filtered.slice(0, wordCount);
  // If filter trimmed too much, top up with any remaining unique words.
  for (const w of unique) {
    if (chosen.length >= wordCount) break;
    if (!chosen.includes(w)) chosen.push(w);
  }

  const size = 8;
  const grid = emptyGrid(size);
  const positions = [];
  for (const w of chosen) {
    const p = placeWord(grid, w, size);
    if (p) positions.push(p);
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
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
  const { difficulty, wordCount } = difficultyData;
  const lastCategory = difficultyData.lastCategory || '';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_key_here') {
    return buildLocalPuzzle(difficulty, wordCount, lastCategory);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a game level generator for a Pakistan-themed word search puzzle game.

Difficulty: ${difficulty}
Word Count Needed: ${wordCount}

Generate a word search puzzle with these rules:
1. Choose ONE category from:
   Pakistani Cities, Pakistani Foods, Cricket Players,
   Urdu Words, Pakistan Districts, Pakistani Singers,
   PSL Teams, Pakistani Fruits, Pakistani Monuments,
   Pakistani Heroes
2. Do NOT repeat last category: ${lastCategory}
3. Generate exactly ${wordCount} words for that category
   - Easy: common well-known words, max 6 letters
   - Medium: moderate words, max 8 letters
   - Hard: longer/rare words, max 10 letters
4. Create an 8x8 letter grid with words hidden inside (horizontal and vertical only, no diagonal)
5. Fill remaining spaces with random capital letters

Return ONLY valid JSON with keys: category, categoryEmoji, words (array of UPPERCASE strings), grid (8 arrays of 8 single capital letters), wordPositions (array of {word,startRow,startCol,direction}), funFact (string).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

    if (!parsed.grid || !Array.isArray(parsed.grid) || parsed.grid.length !== 8) {
      throw new Error('Invalid grid from Gemini');
    }
    parsed.words = (parsed.words || []).map(w => String(w).toUpperCase());
    return parsed;
  } catch (err) {
    console.warn('[levelGeneratorAgent] Gemini failed, using fallback:', err.message);
    return buildLocalPuzzle(difficulty, wordCount, lastCategory);
  }
}

module.exports = levelGeneratorAgent;
