// api.js
// Talks to the WordQuest backend.
// IMPORTANT: replace YOUR_IP with your computer's LAN IP so Expo Go on
// the phone can reach the backend (e.g. 192.168.1.42).

import axios from 'axios';

export const BASE_URL = 'http://192.168.10.7:5001';


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

export async function health() {
  try {
    const { data } = await client.get('/api/health');
    return data;
  } catch (err) {
    return { status: 'down' };
  }
}
