// Tier ladder mirrored from backend/config/tiers.js.
// Tier is derived from cumulative total score.

export const TIERS = [
  { key: 'bronze',   name: 'Bronze',   rank: 1, minScore: 0,    cefr: 'A1', cefrLabel: 'Beginner',     color: '#b45309', accent: '#fbbf24', bg: '#3b1d05', emoji: '🥉', puzzle: { gridSize: 6,  wordCount: 4,  timeLimit: 90, pointsPerWord: 1 } },
  { key: 'silver',   name: 'Silver',   rank: 2, minScore: 300,  cefr: 'A1', cefrLabel: 'Beginner+',    color: '#64748b', accent: '#cbd5e1', bg: '#1e293b', emoji: '🥈', puzzle: { gridSize: 7,  wordCount: 5,  timeLimit: 80, pointsPerWord: 1 } },
  { key: 'gold',     name: 'Gold',     rank: 3, minScore: 600,  cefr: 'A2', cefrLabel: 'Elementary',   color: '#ca8a04', accent: '#fde047', bg: '#3a2c05', emoji: '🏅', puzzle: { gridSize: 8,  wordCount: 6,  timeLimit: 70, pointsPerWord: 1 } },
  { key: 'platinum', name: 'Platinum', rank: 4, minScore: 900,  cefr: 'A2', cefrLabel: 'Elementary+',  color: '#0d9488', accent: '#5eead4', bg: '#053b35', emoji: '💠', puzzle: { gridSize: 9,  wordCount: 7,  timeLimit: 60, pointsPerWord: 2 } },
  { key: 'diamond',  name: 'Diamond',  rank: 5, minScore: 1500, cefr: 'B1', cefrLabel: 'Intermediate', color: '#2563eb', accent: '#93c5fd', bg: '#0a1f3b', emoji: '💎', puzzle: { gridSize: 10, wordCount: 8,  timeLimit: 50, pointsPerWord: 2 } },
  { key: 'elite',    name: 'Elite',    rank: 6, minScore: 2100, cefr: 'B1', cefrLabel: 'Intermediate+',color: '#7c3aed', accent: '#c4b5fd', bg: '#1f0b3a', emoji: '👑', puzzle: { gridSize: 11, wordCount: 9,  timeLimit: 45, pointsPerWord: 2 } },
  { key: 'master',   name: 'Master',   rank: 7, minScore: 2500, cefr: 'B1', cefrLabel: 'Advanced',     color: '#dc2626', accent: '#fbbf24', bg: '#3b0a0a', emoji: '🔥', puzzle: { gridSize: 12, wordCount: 10, timeLimit: 40, pointsPerWord: 2 } },
];

export function tierForScore(score = 0) {
  let pick = TIERS[0];
  for (const t of TIERS) if ((score || 0) >= t.minScore) pick = t;
  return pick;
}

export function nextTier(key) {
  const cur = TIERS.find((t) => t.key === key) || TIERS[0];
  return TIERS[cur.rank] || null;
}

// Has the player crossed a tier threshold? Returns { fromTier, toTier } if
// the new score puts them in a higher tier than `lastSeenTierKey` (the last
// tier the player has been celebrated for), else null. Use this to trigger
// the TierUp celebration screen.
export function tierUpDelta(lastSeenTierKey, totalScore = 0) {
  const last = TIERS.find((t) => t.key === lastSeenTierKey) || TIERS[0];
  const now = tierForScore(totalScore);
  if (now.rank > last.rank) return { fromTier: last.key, toTier: now.key };
  return null;
}

// Progress within the current tier (0..1) given total score.
export function tierProgress(score = 0) {
  const cur = tierForScore(score);
  const nxt = nextTier(cur.key);
  if (!nxt) return { tier: cur, next: null, pct: 1, into: 0, span: 0, remaining: 0 };
  const span = nxt.minScore - cur.minScore;
  const into = score - cur.minScore;
  return {
    tier: cur, next: nxt,
    pct: Math.max(0, Math.min(1, into / span)),
    into, span,
    remaining: Math.max(0, nxt.minScore - score),
  };
}
