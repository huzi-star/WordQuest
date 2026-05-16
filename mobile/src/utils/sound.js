import { Audio } from 'expo-av';

let cachedSound = null;
let isReady = false;

export async function initSound() {
  if (isReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    isReady = true;
  } catch (err) {
    // Non-fatal — sound just won't play.
    console.warn('initSound error:', err.message);
  }
}

export async function playDing() {
  try {
    await initSound();
    if (!cachedSound) {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/ding.wav'),
        { volume: 0.6 }
      );
      cachedSound = sound;
    }
    await cachedSound.setPositionAsync(0);
    await cachedSound.playAsync();
  } catch (err) {
    // Silently ignore — game must keep working even if audio fails.
  }
}
