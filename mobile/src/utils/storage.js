import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wordquest:stats:v2';

const DEFAULTS = {
  highScore: 0,
  bestStreak: 0,
  totalGamesPlayed: 0,
  totalRoundsPlayed: 0,
  totalWordsFound: 0,
  totalTimeSpent: 0,
  totalScoreEver: 0,
  perfectRounds: 0,
  hintsUsed: 0,
  categoryStats: {},
  recentScores: [],
  activeDays: {},
  achievements: [],
  // Levels progression: 15 levels, level 1 is unlocked by default.
  maxUnlockedLevel: 1,
  completedLevels: [],
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadStats() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

export async function saveStats(patch) {
  try {
    const current = await loadStats();
    const next = { ...current, ...patch };
    if (typeof patch.highScore === 'number') {
      next.highScore = Math.max(current.highScore, patch.highScore);
    }
    if (typeof patch.bestStreak === 'number') {
      next.bestStreak = Math.max(current.bestStreak, patch.bestStreak);
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return DEFAULTS;
  }
}

// Convenience: log one completed round's worth of stats.
export async function logRound({
  category = '',
  wordsFound = 0,
  totalWords = 0,
  timeSpent = 0,
  roundScore = 0,
  perfect = false,
  hintsUsed = 0,
}) {
  try {
    const current = await loadStats();
    const next = { ...current };

    next.totalRoundsPlayed += 1;
    next.totalWordsFound += wordsFound;
    next.totalTimeSpent += Math.max(0, timeSpent);
    next.totalScoreEver += Math.max(0, roundScore);
    next.hintsUsed += Math.max(0, hintsUsed);
    if (perfect) next.perfectRounds += 1;

    if (category) {
      const cat = next.categoryStats[category] || { played: 0, wordsFound: 0, totalWords: 0, perfectCount: 0 };
      cat.played += 1;
      cat.wordsFound += wordsFound;
      cat.totalWords += totalWords;
      if (perfect) cat.perfectCount += 1;
      next.categoryStats = { ...next.categoryStats, [category]: cat };
    }

    next.recentScores = [roundScore, ...current.recentScores].slice(0, 20);
    next.activeDays = { ...current.activeDays, [todayKey()]: true };

    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return null;
  }
}

export async function logGameOver({ finalScore = 0, finalStreak = 0 }) {
  try {
    const current = await loadStats();
    const next = {
      ...current,
      totalGamesPlayed: current.totalGamesPlayed + 1,
      highScore: Math.max(current.highScore, finalScore),
      bestStreak: Math.max(current.bestStreak, finalStreak),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return null;
  }
}

export async function resetStats() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

// Mark a level as completed and unlock the next one (up to 15).
export async function completeLevel(levelNumber) {
  try {
    const current = await loadStats();
    const next = { ...current };
    const set = new Set(current.completedLevels || []);
    set.add(levelNumber);
    next.completedLevels = Array.from(set);
    next.maxUnlockedLevel = Math.min(15, Math.max(current.maxUnlockedLevel || 1, levelNumber + 1));
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}
