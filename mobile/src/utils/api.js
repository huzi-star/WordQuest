// api.js — talks to the WordQuest backend.

import axios from 'axios';

export const BASE_URL = 'https://backend-liart-three-60.vercel.app';

export const client = axios.create({ baseURL: BASE_URL, timeout: 25000 });
// Long-running endpoints (quiz/coach) get a separate longer-timeout client.
const slowClient = axios.create({ baseURL: BASE_URL, timeout: 75000 });

// Global language injector. Set from SettingsProvider at app boot/change.
let globalLanguage = 'urdu';
export function setApiLanguage(lang) {
  globalLanguage = lang === 'english' ? 'english' : 'urdu';
}

function withLang(payload) {
  return { language: globalLanguage, ...(payload || {}) };
}

export async function generateLevel(playerStats, extra = {}) {
  try {
    const { data } = await client.post('/api/generate-level', withLang({ playerStats, ...extra }));
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function validateWord(payload) {
  try {
    const { data } = await client.post('/api/validate-word', withLang(payload));
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function roundComplete(payload) {
  try {
    const { data } = await client.post('/api/round-complete', withLang(payload));
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function explainWord(payload) {
  try {
    const { data } = await client.post('/api/explain-word', withLang(payload));
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getCommentary(payload) {
  try {
    const { data } = await client.post('/api/commentary', withLang(payload));
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getCoach(stats) {
  try {
    const { data } = await client.post('/api/coach', withLang(stats));
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function health() {
  try {
    const { data } = await client.get('/api/health');
    return data;
  } catch {
    return { status: 'down' };
  }
}

// ---- Tier system endpoints ----------------------------------------------
export async function fetchTierLeaderboard(tier, userId) {
  try {
    const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const { data } = await client.get(`/api/tier-leaderboard/${tier}${q}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function fetchWordDetail(word, tier = 'bronze', category = '', userId = null) {
  try {
    const { data } = await client.post('/api/word-detail', { word, tier, category, userId });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function fetchWordOfDay(tier = 'bronze') {
  try {
    const { data } = await client.get(`/api/word-of-day?tier=${encodeURIComponent(tier)}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function translateMeaning({ word, meaning, language }) {
  try {
    const { data } = await client.post('/api/translate-meaning', { word, meaning, language });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---- 1v1 battle endpoints ----------------------------------------------
export async function battleJoinQueue({ userId, tier, displayName, avatarColor, widen = false }) {
  try {
    const { data } = await slowClient.post('/api/battle/queue', { userId, tier, displayName, avatarColor, widen });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleCancelQueue(userId) {
  try {
    const { data } = await client.post('/api/battle/cancel', { userId });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleGetMatch(matchId) {
  try {
    const { data } = await client.get(`/api/battle/match/${matchId}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleSubmitResult({ matchId, userId, score, wordsFound }) {
  try {
    const { data } = await client.post(`/api/battle/match/${matchId}/result`, { userId, score, wordsFound });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleHeartbeat(userId) {
  try {
    const { data } = await client.post('/api/battle/heartbeat', { userId });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleProgress({ matchId, userId, score, wordsFound }) {
  try {
    const { data } = await client.post(`/api/battle/match/${matchId}/progress`, { userId, score, wordsFound });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleTimeoutMatch(matchId) {
  try {
    const { data } = await client.post(`/api/battle/match/${matchId}/timeout`, {});
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleClaimWord({ matchId, userId, word }) {
  try {
    const { data } = await client.post(`/api/battle/match/${matchId}/claim`, { userId, word });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleForfeitMatch({ matchId, userId }) {
  try {
    const { data } = await client.post(`/api/battle/match/${matchId}/forfeit`, { userId });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// (Personalized Learning Path Agent retired — exports removed.)

// Long-term-memory coach feedback (win = motivational, loss = full diagnosis
// + next-3-rounds prescription). Backed by wq_player_memory.coach_history.
export async function coachFeedback(payload) {
  try {
    const { data } = await slowClient.post('/api/coach-feedback', payload);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---- Pakistan Culture Quest Pack ----------------------------------------
export async function pkQuestCategories() {
  try {
    const { data } = await client.get('/api/pakistan-quest/categories');
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function pkQuestLevel({ category, difficulty, userId }) {
  try {
    const { data } = await slowClient.post('/api/pakistan-quest/level', { category, difficulty, userId });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function pkQuestNote(word, lang = 'en') {
  try {
    const { data } = await client.get(`/api/pakistan-quest/note/${encodeURIComponent(word)}?lang=${lang}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// Submit the finished round so the server can append it to this section's
// last-10 window and adjust the next difficulty accordingly.
export async function pkQuestResult({ userId, category, difficulty, passed, words, score }) {
  try {
    const { data } = await client.post('/api/pakistan-quest/result', {
      userId, category, difficulty, passed, words, score,
    });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---- Safety Guardrail Agent --------------------------------------------
export async function guardrailCheck({ content, type, ageGroup = 'kid', userId, context, allowList, useLLM }) {
  try {
    const { data } = await client.post('/api/guardrail/check', { content, type, ageGroup, userId, context, allowList, useLLM });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

export async function battleGetRanking(userId) {
  try {
    const { data } = await client.get(`/api/battle/ranking/${userId}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---- Learning Academy endpoints ----------------------------------------
export async function learnGetPath(userId) {
  try { const { data } = await client.get(`/api/learn/path/${userId}`); return data; }
  catch (err) { return { ok: false, error: err.message }; }
}

export async function learnGetUnit(unitId) {
  try { const { data } = await client.get(`/api/learn/unit/${unitId}`); return data; }
  catch (err) { return { ok: false, error: err.message }; }
}

export async function learnGetLesson({ unitId, i = 0, type, userId, attempt = 0 }) {
  try {
    const q = new URLSearchParams({ unitId: String(unitId), i: String(i) });
    if (type) q.set('type', type);
    if (userId) q.set('userId', String(userId));
    if (attempt) q.set('attempt', String(attempt));
    const { data } = await slowClient.get(`/api/learn/lesson?${q.toString()}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// Submit a FULL lesson result. Returns { passed, motivational } — fail
// gate keeps the player on this lesson until pass.
export async function learnLessonResult(payload) {
  try { const { data } = await slowClient.post('/api/learn/lesson-result', payload); return data; }
  catch (err) { return { ok: false, error: err.message }; }
}

export async function learnSubmitAnswer(payload) {
  try { const { data } = await client.post('/api/learn/submit', payload); return data; }
  catch (err) { return { ok: false, error: err.message }; }
}

export async function learnCompleteUnit({ userId, unitId, score }) {
  try { const { data } = await client.post('/api/learn/complete-unit', { userId, unitId, score }); return data; }
  catch (err) { return { ok: false, error: err.message }; }
}

export async function learnGetProgress(userId) {
  try { const { data } = await client.get(`/api/learn/progress/${userId}`); return data; }
  catch (err) { return { ok: false, error: err.message }; }
}

export async function leaderboardUpsert({ userId, displayName, avatarColor, avatarUrl, avatarEmoji, totalScore, highScore, totalGames }) {
  try {
    const { data } = await client.post('/api/leaderboard/upsert', {
      userId, displayName, avatarColor, avatarUrl, avatarEmoji, totalScore, highScore, totalGames,
    });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---------------------------------------------------------------- subscriptions
export async function fetchPlan(userId) {
  try {
    const { data } = await client.get(`/api/sub/me/${userId}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function startTrial(userId) {
  try {
    const { data } = await client.post(`/api/sub/start-trial/${userId}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function upgradePlan(userId, { plan, cycle = 'monthly', provider = 'mock', providerToken = null } = {}) {
  try {
    const { data } = await client.post(`/api/sub/upgrade/${userId}`, { plan, cycle, provider, providerToken });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function cancelPlan(userId) {
  try {
    const { data } = await client.post(`/api/sub/cancel/${userId}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function bumpUsage(userId, kind = 'quick_play') {
  try {
    const { data } = await client.post(`/api/sub/usage/${userId}`, { kind });
    return data;
  } catch (err) { return { ok: false }; }
}
export async function fetchUsage(userId) {
  try {
    const { data } = await client.get(`/api/sub/usage/${userId}`);
    return data;
  } catch (err) { return { ok: false }; }
}

export async function applyCoupon(userId, code) {
  try {
    const { data } = await client.post(`/api/sub/coupon/${userId}`, { code });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---------------------------------------------------------------- Pro Max
export async function tutorChat(messages, childAge = 10) {
  try {
    const { data } = await slowClient.post('/api/tutor/chat', { messages, childAge });
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function fetchParentSummary(userId) {
  try {
    const { data } = await client.get(`/api/parent/summary/${userId}`);
    return data;
  } catch (err) { return { ok: false, error: err.message }; }
}
