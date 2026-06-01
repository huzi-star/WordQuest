// Tier ladder for WordQuest. Tier is derived from a player's cumulative
// total_score in user_stats. Each tier is also mapped to a CEFR level
// (Common European Framework of Reference) so the word style is internationally
// calibrated rather than country-specific.

const TIERS = [
  {
    key: 'bronze', name: 'Bronze', rank: 1, minScore: 0,
    cefr: 'A1', cefrLabel: 'Beginner',
    color: '#b45309', accent: '#fbbf24', emoji: '🥉',
    wordStyle: 'CEFR A1 — very simple 3 to 4 letter words: cat, dog, run, sun, big, hot, sad, fun, cup, hat, bed, eat',
    puzzle: { gridSize: 6, wordCount: 4, minLen: 3, maxLen: 4, timeLimit: 90,  pointsPerWord: 1 },
  },
  {
    key: 'silver', name: 'Silver', rank: 2, minScore: 300,
    cefr: 'A1', cefrLabel: 'Beginner+',
    color: '#64748b', accent: '#cbd5e1', emoji: '🥈',
    wordStyle: 'CEFR A1+ — simple 4 to 5 letter feeling and action words: jump, kind, cold, brave, quiet, happy, smile, sleep',
    puzzle: { gridSize: 7, wordCount: 5, minLen: 4, maxLen: 5, timeLimit: 80,  pointsPerWord: 1 },
  },
  {
    key: 'gold', name: 'Gold', rank: 3, minScore: 600,
    cefr: 'A2', cefrLabel: 'Elementary',
    color: '#ca8a04', accent: '#fde047', emoji: '🏅',
    wordStyle: 'CEFR A2 — 5 to 6 letter descriptive words: honest, clever, gentle, afraid, polite, friendly, curious',
    puzzle: { gridSize: 8, wordCount: 6, minLen: 5, maxLen: 6, timeLimit: 70,  pointsPerWord: 1 },
  },
  {
    key: 'platinum', name: 'Platinum', rank: 4, minScore: 900,
    cefr: 'A2', cefrLabel: 'Elementary+',
    color: '#0d9488', accent: '#5eead4', emoji: '💠',
    wordStyle: 'CEFR A2+ — 6 to 7 letter words: curious, patient, ancient, modern, enormous, careful, helpful',
    puzzle: { gridSize: 9, wordCount: 7, minLen: 6, maxLen: 7, timeLimit: 60,  pointsPerWord: 2 },
  },
  {
    key: 'diamond', name: 'Diamond', rank: 5, minScore: 1500,
    cefr: 'B1', cefrLabel: 'Intermediate',
    color: '#2563eb', accent: '#93c5fd', emoji: '💎',
    wordStyle: 'CEFR B1 — 7 to 8 letter words: cautious, generous, admire, fortunate, exhausted, creative, peaceful',
    puzzle: { gridSize: 10, wordCount: 8, minLen: 7, maxLen: 8, timeLimit: 50, pointsPerWord: 2 },
  },
  {
    key: 'elite', name: 'Elite', rank: 6, minScore: 2100,
    cefr: 'B1', cefrLabel: 'Intermediate+',
    color: '#7c3aed', accent: '#c4b5fd', emoji: '👑',
    wordStyle: 'CEFR B1+ — 8 to 9 letter words: determined, resilient, compassion, ambitious, confident, brilliant',
    puzzle: { gridSize: 11, wordCount: 9, minLen: 8, maxLen: 9, timeLimit: 45, pointsPerWord: 2 },
  },
  {
    key: 'master', name: 'Master', rank: 7, minScore: 2500,
    cefr: 'B1', cefrLabel: 'Advanced',
    color: '#dc2626', accent: '#fbbf24', emoji: '🔥',
    wordStyle: 'CEFR B1 ceiling — 9 to 10 letter words: perseverance, eloquent, tenacious, vivacious, kindhearted',
    puzzle: { gridSize: 12, wordCount: 10, minLen: 9, maxLen: 10, timeLimit: 40, pointsPerWord: 2 },
  },
];

// Country-neutral category pool. AI must pick from these only.
const CATEGORIES = [
  'Animals', 'Colors', 'Food', 'School', 'Sports', 'Nature', 'Family',
  'Body Parts', 'Weather', 'Clothes', 'House', 'Toys', 'Vehicles', 'Fruits',
  'Vegetables', 'Shapes', 'Numbers', 'Music', 'Jobs', 'Hobbies',
];

function tierForScore(score) {
  let pick = TIERS[0];
  for (const t of TIERS) if ((score || 0) >= t.minScore) pick = t;
  return pick;
}

function nextTier(key) {
  const cur = TIERS.find((t) => t.key === key) || TIERS[0];
  return TIERS[cur.rank] || null;
}

module.exports = { TIERS, CATEGORIES, tierForScore, nextTier };
