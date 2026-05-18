import AsyncStorage from '@react-native-async-storage/async-storage';

// Stats are stored per logged-in user so two accounts on the same phone
// never see each other's data. setStatsUserScope(uid) is called by the
// AuthProvider whenever the auth state changes.

const BASE = 'wordquest:stats:v2';
let currentUserId = null;

export function setStatsUserScope(uid) {
  currentUserId = uid || null;
}

function K() {
  return `${BASE}:${currentUserId || '_guest'}`;
}

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
  maxUnlockedLevel: 1,
  completedLevels: [],
  // Adaptive resume — picks up where the player left off.
  lastAdaptiveStats: null,
  // Last 6 quiz topics, so the next quiz doesn't repeat.
  recentQuizTopics: [],
  // Recently shown quiz question texts (last 40) to avoid duplicates.
  recentQuizQuestions: [],
  // When the user last attempted the daily challenge (ms epoch).
  // Daily challenge re-unlocks 12 hours after this timestamp.
  dailyChallengeLastAttemptAt: 0,
  // When the user last completed a quiz. Quiz mode re-unlocks 12 h later.
  quizLastAttemptAt: 0,
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadStats() {
  try {
    const raw = await AsyncStorage.getItem(K());
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveStats(patch) {
  try {
    const current = await loadStats();
    const next = { ...current, ...patch };
    if (typeof patch.highScore === 'number') next.highScore = Math.max(current.highScore, patch.highScore);
    if (typeof patch.bestStreak === 'number') next.bestStreak = Math.max(current.bestStreak, patch.bestStreak);
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch {
    return DEFAULTS;
  }
}

export async function logRound({
  category = '', wordsFound = 0, totalWords = 0,
  timeSpent = 0, roundScore = 0, perfect = false, hintsUsed = 0,
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
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
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
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

// Reset stats for the CURRENTLY active user scope only.
export async function resetStats() {
  try { await AsyncStorage.removeItem(K()); } catch {}
}

export async function setLastAdaptiveStats(stats) {
  try {
    const current = await loadStats();
    const next = { ...current, lastAdaptiveStats: stats };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function rememberQuizTopic(topic) {
  if (!topic) return;
  try {
    const current = await loadStats();
    const list = [topic, ...(current.recentQuizTopics || []).filter((t) => t !== topic)].slice(0, 6);
    const next = { ...current, recentQuizTopics: list };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function rememberQuizQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) return;
  try {
    const current = await loadStats();
    const incoming = questions.map((q) => String(q));
    const dedup = Array.from(new Set([...incoming, ...(current.recentQuizQuestions || [])])).slice(0, 40);
    const next = { ...current, recentQuizQuestions: dedup };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function markQuizAttempt() {
  try {
    const current = await loadStats();
    const next = { ...current, quizLastAttemptAt: Date.now() };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function markDailyAttempt() {
  try {
    const current = await loadStats();
    const next = { ...current, dailyChallengeLastAttemptAt: Date.now() };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function completeLevel(levelNumber) {
  try {
    const current = await loadStats();
    const next = { ...current };
    const set = new Set(current.completedLevels || []);
    set.add(levelNumber);
    next.completedLevels = Array.from(set);
    next.maxUnlockedLevel = Math.min(15, Math.max(current.maxUnlockedLevel || 1, levelNumber + 1));
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

// Overwrite the current user's stats with a snapshot (used by syncDown).
export async function replaceStats(snapshot) {
  try {
    const next = { ...DEFAULTS, ...(snapshot || {}) };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}
