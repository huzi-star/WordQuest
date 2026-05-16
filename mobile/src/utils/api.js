// api.js
// Talks to the WordQuest backend.
// IMPORTANT: replace YOUR_IP with your computer's LAN IP so Expo Go on
// the phone can reach the backend (e.g. 192.168.1.42).

import axios from 'axios';

export const BASE_URL = 'https://backend-liart-three-60.vercel.app';


const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

export async function generateLevel(playerStats) {
  try {
    const { data } = await client.post('/api/generate-level', { playerStats });
    return data;
  } catch (err) {
    console.warn('generateLevel error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function validateWord(payload) {
  try {
    const { data } = await client.post('/api/validate-word', payload);
    return data;
  } catch (err) {
    console.warn('validateWord error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function roundComplete(payload) {
  try {
    const { data } = await client.post('/api/round-complete', payload);
    return data;
  } catch (err) {
    console.warn('roundComplete error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function explainWord(payload) {
  try {
    const { data } = await client.post('/api/explain-word', payload);
    return data;
  } catch (err) {
    console.warn('explainWord error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function getCommentary(payload) {
  try {
    const { data } = await client.post('/api/commentary', payload);
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getCoach(stats) {
  try {
    const { data } = await client.post('/api/coach', stats);
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function chatChaalbaaz(payload) {
  try {
    const { data } = await client.post('/api/chat-chaalbaaz', payload);
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function health() {
  try {
    const { data } = await client.get('/api/health');
    return data;
  } catch (err) {
    return { status: 'down' };
  }
}
