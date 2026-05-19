// api.js — talks to the WordQuest backend.

import axios from 'axios';

export const BASE_URL = 'https://backend-liart-three-60.vercel.app';

const client = axios.create({ baseURL: BASE_URL, timeout: 25000 });
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

export async function generateQuiz(payload) {
  try {
    // Quiz generation can take up to 50s on the backend (Gemini latency +
    // retries) — use the slow client so axios doesn't abort early.
    const { data } = await slowClient.post('/api/generate-quiz', withLang(payload || {}));
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
