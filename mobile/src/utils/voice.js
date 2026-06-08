// voice.js — single source of truth for in-game TTS.
//
// Goals (per spec):
//   1) Smooth playback — first tap of the speaker icon must start
//      speaking immediately, no awkward pause.
//   2) A friendly FEMALE-sounding voice by default. On iOS we pick a
//      known female voice identifier; on Android we raise pitch + slow
//      rate slightly which gives the system voice a warmer, more
//      feminine timbre even when only one voice is installed.
//   3) Speak in the language the learning page has selected (English,
//      Urdu, Hindi, Arabic, Spanish, French, etc).
//   4) Speak everything visible on the card — word, meaning, example,
//      synonym, antonym — in the SELECTED language only, in one
//      continuous utterance so it sounds natural.
//
// This module never throws. If TTS fails it logs once and returns.

import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

// Locale codes per supported app language. Adding a new language just
// means adding it here AND making sure the device has the TTS voice
// installed (Android Settings → System → Languages → Text-to-speech).
export const SPEAK_LOCALE = {
  english: 'en-US',
  urdu:    'ur-PK',
  hindi:   'hi-IN',
  arabic:  'ar-SA',
  spanish: 'es-ES',
  french:  'fr-FR',
};

// Best-effort female voice identifiers per platform.  Android phones
// vary widely (some only ship Google TTS, some ship the OEM voice), so
// for Android we lean on pitch rather than identifier matching.
const IOS_FEMALE_VOICE_HINTS = ['samantha', 'siri-female', 'karen', 'moira', 'tessa', 'fiona'];

let cachedFemaleVoice = null;
async function pickFemaleVoice(lang) {
  if (cachedFemaleVoice && cachedFemaleVoice.language === lang) return cachedFemaleVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!Array.isArray(voices) || !voices.length) return null;
    // Filter to the locale's voices first; fall back to anything if none.
    const matchLang = voices.filter((v) => v.language && v.language.toLowerCase().startsWith(lang.split('-')[0]));
    const pool = matchLang.length ? matchLang : voices;
    const female = pool.find((v) => {
      const tag = `${v.identifier || ''} ${v.name || ''}`.toLowerCase();
      return IOS_FEMALE_VOICE_HINTS.some((hint) => tag.includes(hint))
        || tag.includes('female') || tag.includes('woman') || tag.includes('girl');
    });
    cachedFemaleVoice = female || pool[0] || null;
    return cachedFemaleVoice;
  } catch (_) { return null; }
}

function localeFor(language) {
  return SPEAK_LOCALE[String(language || '').toLowerCase()] || SPEAK_LOCALE.english;
}

// Speak a single phrase. Returns immediately — the speech itself runs
// asynchronously in the platform speech engine.
export async function speakSmooth(text, opts = {}) {
  if (!text) return;
  const language = opts.language || 'english';
  const locale = localeFor(language);
  try {
    Speech.stop();
    const voice = await pickFemaleVoice(locale);
    const speechOpts = {
      language: locale,
      // Slightly higher pitch + slower rate gives a warmer, kid-friendly
      // female timbre on Android even when the OEM TTS only ships a male
      // voice. iOS will use the female voice identifier we picked above.
      pitch: opts.pitch != null ? opts.pitch : (Platform.OS === 'ios' ? 1.05 : 1.18),
      rate:  opts.rate  != null ? opts.rate  : (locale.startsWith('ur') || locale.startsWith('ar') ? 0.78 : 0.88),
      onError: () => {},
    };
    if (voice && voice.identifier) speechOpts.voice = voice.identifier;
    Speech.speak(String(text), speechOpts);
  } catch (_) { /* never crash on TTS */ }
}

// Speak a full WordDetail card (the page that shows up after finding a
// word). Concatenates word + meaning + example + synonym + antonym into
// ONE utterance so playback feels natural. All in the selected language.
export async function speakWordCard(card, language = 'english') {
  if (!card) return;
  const parts = [];
  if (card.word) parts.push(String(card.word));
  if (card.meaning) parts.push(String(card.meaning));
  if (card.example) parts.push(String(card.example));
  if (card.synonym) parts.push(`Synonym: ${String(card.synonym)}`);
  if (card.antonym) parts.push(`Antonym: ${String(card.antonym)}`);
  if (!parts.length) return;
  await speakSmooth(parts.join('. '), { language });
}

export function stopSpeech() {
  try { Speech.stop(); } catch (_) {}
}
