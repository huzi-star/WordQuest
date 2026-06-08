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
  // Pro Max AI Tutor daily message counter — local enforcement of the
  // per-day cap. Reset whenever the date string changes.
  aiTutorDateKey: '',
  aiTutorCountToday: 0,
  // Per-level cached word lists for Level Mode retry. Shape:
  //   { [levelNumber]: { words, category, emoji, funFact } }
  levelWordCache: {},
  // Per-user onboarding flag — only true after the user finishes the
  // first-launch walkthrough.
  hasSeenOnboarding: false,
  // Per-level personal best: { [levelNumber]: bestScore }. Shown on the
  // Levels screen so the player can chase their own record.
  levelHighScores: {},
  // The last tier the player has seen a celebration for. Whenever
  // tierForScore(totalScoreEver) is higher than this, the TierUp screen
  // should be shown once, and this gets updated.
  lastSeenTier: 'bronze',
  // Practice Mode (unranked) — completely separate from tier progression.
  // These never touch totalScoreEver, leaderboard, or tier.
  practiceHighScore: 0,
  practiceRoundsPlayed: 0,
  practiceRoundsWon: 0,
  practiceCurrentDifficulty: 'easy',
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

// Reset gameplay stats only — preserves daily/quiz lock state, onboarding,
// and the level word cache so retries still work.
export async function resetStats() {
  try {
    const current = await loadStats();
    const preserved = {
      // Daily challenge lock + countdown timer state — never touched.
      dailyChallengeLastAttemptAt: current.dailyChallengeLastAttemptAt || 0,
      // Quiz mode lock + history state — never touched.
      quizLastAttemptAt: current.quizLastAttemptAt || 0,
      recentQuizTopics: current.recentQuizTopics || [],
      recentQuizQuestions: current.recentQuizQuestions || [],
      // Level retry word cache — keep so retries still work.
      levelWordCache: current.levelWordCache || {},
      // Onboarding flag — never re-show the tutorial.
      hasSeenOnboarding: current.hasSeenOnboarding || false,
    };
    const reset = { ...DEFAULTS, ...preserved };
    await AsyncStorage.setItem(K(), JSON.stringify(reset));
    return reset;
  } catch { return DEFAULTS; }
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

// Increment totalScoreEver by `delta` and bump highScore if the new total
// exceeds it. Used by per-word / per-question scoring (Quiz + Daily) where
// we want the points to count immediately toward tier progression AND
// high-score AND ranking — without waiting for the round/game to end.
export async function addScorePoints(delta) {
  const inc = Math.max(0, Number(delta) || 0);
  if (!inc) return null;
  try {
    const current = await loadStats();
    const next = {
      ...current,
      totalScoreEver: (current.totalScoreEver || 0) + inc,
    };
    if (next.totalScoreEver > (current.highScore || 0)) {
      next.highScore = next.totalScoreEver;
    }
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

// Quick Play fail penalty — subtract `delta` from totalScoreEver,
// clamped at 0. High score is NEVER reduced. Returns the new stats blob
// or null on failure.
export async function deductScorePoints(delta) {
  const dec = Math.max(0, Number(delta) || 0);
  if (!dec) return null;
  try {
    const current = await loadStats();
    const newTotal = Math.max(0, (current.totalScoreEver || 0) - dec);
    const next = { ...current, totalScoreEver: newTotal };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

// Practice Mode — add per-word points to highScore ONLY. Tier
// totalScoreEver / leaderboard remain untouched. Also bumps a separate
// practiceHighScore counter so the unranked best is visible on the
// Practice screen.
export async function addPracticeScore(delta) {
  const inc = Math.max(0, Number(delta) || 0);
  if (!inc) return null;
  try {
    const current = await loadStats();
    const newHigh = (current.highScore || 0) + inc;
    const newPracticeHigh = (current.practiceHighScore || 0) + inc;
    const next = {
      ...current,
      highScore: newHigh,
      practiceHighScore: newPracticeHigh,
    };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function recordPracticeRound({ won = false } = {}) {
  try {
    const current = await loadStats();
    const next = {
      ...current,
      practiceRoundsPlayed: (current.practiceRoundsPlayed || 0) + 1,
      practiceRoundsWon: (current.practiceRoundsWon || 0) + (won ? 1 : 0),
    };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function setPracticeDifficulty(diff) {
  try {
    const current = await loadStats();
    const next = { ...current, practiceCurrentDifficulty: diff || 'easy' };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function markTierSeen(tierKey) {
  if (!tierKey) return null;
  try {
    const current = await loadStats();
    const next = { ...current, lastSeenTier: tierKey };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function markOnboardingSeen() {
  try {
    const current = await loadStats();
    const next = { ...current, hasSeenOnboarding: true };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function cacheLevelWords(levelNumber, { words, category, emoji, funFact }) {
  if (!levelNumber || !Array.isArray(words) || !words.length) return null;
  try {
    const current = await loadStats();
    const cache = { ...(current.levelWordCache || {}) };
    cache[levelNumber] = {
      words: words.map((w) => String(w).toUpperCase()),
      category: category || '',
      emoji: emoji || '',
      funFact: funFact || '',
    };
    const next = { ...current, levelWordCache: cache };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function getLevelWords(levelNumber) {
  if (!levelNumber) return null;
  try {
    const current = await loadStats();
    return (current.levelWordCache || {})[levelNumber] || null;
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

// AI Tutor — read today's message count. Resets at local midnight (i.e.
// whenever the YYYY-MM-DD key string changes from what we stored).
function _todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export async function getAiTutorToday() {
  try {
    const cur = await loadStats();
    if (cur.aiTutorDateKey !== _todayKey()) return 0;
    return Number(cur.aiTutorCountToday) || 0;
  } catch { return 0; }
}
export async function incAiTutorToday() {
  try {
    const cur = await loadStats();
    const today = _todayKey();
    const count = (cur.aiTutorDateKey === today ? Number(cur.aiTutorCountToday) || 0 : 0) + 1;
    const next = { ...cur, aiTutorDateKey: today, aiTutorCountToday: count };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return count;
  } catch { return 0; }
}

// Record a score against a specific level number, keeping the highest
// value seen for that level. Returns { previousBest, newBest, isNewBest }.
export async function recordLevelScore(levelNumber, score) {
  if (!levelNumber || !Number.isFinite(score)) return null;
  try {
    const current = await loadStats();
    const map = { ...(current.levelHighScores || {}) };
    const previousBest = Number(map[levelNumber]) || 0;
    const newBest = Math.max(previousBest, Number(score) || 0);
    map[levelNumber] = newBest;
    const next = { ...current, levelHighScores: map };
    await AsyncStorage.setItem(K(), JSON.stringify(next));
    return {
      previousBest,
      newBest,
      isNewBest: score > previousBest && score > 0,
    };
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

// Pro Max offline mode — cache last 3 generated Quick Play levels so they
// can be loaded when offline.
const OFFLINE_KEY = 'wq:offline:levels:v1';
const OFFLINE_MAX = 3;
export async function offlinePushLevel(payload) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(payload);
    while (arr.length > OFFLINE_MAX) arr.pop();
    await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(arr));
  } catch {}
}
export async function offlinePopLevel() {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr.length) return null;
    const head = arr.shift();
    await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(arr));
    return head;
  } catch { return null; }
}
export async function offlineCount() {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch { return 0; }
}
