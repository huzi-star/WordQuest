import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wordquest:stats:v1';

export async function loadStats() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { highScore: 0, bestStreak: 0 };
    const parsed = JSON.parse(raw);
    return {
      highScore: Number(parsed.highScore) || 0,
      bestStreak: Number(parsed.bestStreak) || 0,
    };
  } catch (err) {
    return { highScore: 0, bestStreak: 0 };
  }
}

export async function saveStats({ highScore, bestStreak }) {
  try {
    const current = await loadStats();
    const next = {
      highScore: Math.max(current.highScore, Number(highScore) || 0),
      bestStreak: Math.max(current.bestStreak, Number(bestStreak) || 0),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return { highScore: 0, bestStreak: 0 };
  }
}
