import { Audio } from 'expo-av';
import { getSettings } from './settings';

const SFX = {
  correct: require('../../assets/sounds/sfx_word_found.wav'),
  word_found: require('../../assets/sounds/sfx_word_found.wav'),
  wrong: require('../../assets/sounds/sfx_wrong.mp3'),
  tap: require('../../assets/sounds/sfx_tap.mp3'),
  streak: require('../../assets/sounds/sfx_streak.mp3'),
  victory: require('../../assets/sounds/sfx_win.wav'),
  win: require('../../assets/sounds/sfx_win.wav'),
  tierup: require('../../assets/sounds/sfx_tierup.mp3'),
  tick: require('../../assets/sounds/sfx_tick.mp3'),
  battle_match: require('../../assets/sounds/sfx_battle_match.mp3'),
  ding: require('../../assets/ding.wav'),
};

const BGM = {
  home: require('../../assets/sounds/bg-music.mp3'),
  game: require('../../assets/sounds/bg-music.mp3'),
  battle: require('../../assets/sounds/bgm_battle.mp3'),
};

let audioReady = false;
let bgmSound = null;
let bgmKey = null;

async function ensureAudioMode() {
  if (audioReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    audioReady = true;
  } catch (_) {}
}

function sfxAllowed() {
  const s = getSettings();
  return s?.sound !== false;
}
function bgmAllowed() {
  const s = getSettings();
  if (typeof s?.music === 'boolean') return s.music;
  return s?.sound !== false;
}

export async function playSfx(key, { volume = 0.9 } = {}) {
  if (!sfxAllowed()) return;
  const mod = SFX[key];
  if (!mod) return;
  await ensureAudioMode();
  try {
    const { sound } = await Audio.Sound.createAsync(mod, { volume, shouldPlay: true });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status?.didJustFinish) sound.unloadAsync().catch(() => {});
    });
  } catch (_) {}
}

export async function playBgm(key, { volume = 0.3 } = {}) {
  if (!bgmAllowed()) { await stopBgm(); return; }
  const mod = BGM[key];
  if (!mod) return;
  if (bgmKey === key && bgmSound) return;
  await ensureAudioMode();
  await stopBgm();
  try {
    const { sound } = await Audio.Sound.createAsync(mod, {
      volume, shouldPlay: true, isLooping: true,
    });
    bgmSound = sound;
    bgmKey = key;
  } catch (_) {}
}

export async function stopBgm() {
  if (bgmSound) {
    try { await bgmSound.stopAsync(); } catch (_) {}
    try { await bgmSound.unloadAsync(); } catch (_) {}
  }
  bgmSound = null;
  bgmKey = null;
}

// Backward-compatible alias used by older callers.
export async function playDing() { return playSfx('correct', { volume: 0.7 }); }
export async function initSound() { return ensureAudioMode(); }
export const tap = () => playSfx('tap', { volume: 0.5 });
