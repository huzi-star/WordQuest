import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Animated, Easing, ScrollView } from 'react-native';
import * as Speech from 'expo-speech';
import { fetchWordDetail, translateMeaning, pkQuestNote } from '../utils/api';

const LANGS = [
  { key: 'urdu', label: 'اردو' },
  { key: 'hindi', label: 'हिंदी' },
  { key: 'arabic', label: 'العربية' },
  { key: 'spanish', label: 'Español' },
  { key: 'french', label: 'Français' },
];

const PALETTE = {
  bg: 'rgba(7, 11, 20, 0.86)',
  card: '#0f172a',
  border: 'rgba(255,255,255,0.12)',
  accent: '#34d399',
  text: '#f4f6fb',
  muted: '#94a3b8',
  syn: '#22c55e',
  ant: '#f97316',
};

// One-shot in-memory cache so repeat-finding the same word never re-hits the API.
const cache = new Map();

export default function WordDetailCard({ visible, word, tier = 'bronze', onClose, langs = null, category = '', userId = null }) {
  // Optional `langs` prop = array of language KEYS (matching LANGS[].key) to
  // restrict the translation toggles. Default = full set. Pakistan Quest
  // passes `['urdu']` so the player only sees the English meaning + a
  // single Urdu (Nastaliq) translation toggle.
  const availableLangs = Array.isArray(langs) && langs.length
    ? LANGS.filter((L) => langs.includes(L.key))
    : LANGS;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState(null);
  // Holds translated copies of EVERY visible field in the selected
  // language, so when the user taps the speaker the audio matches the
  // language they picked from top to bottom. Cleared whenever the
  // language changes or the card closes.
  const [translatedAll, setTranslatedAll] = useState(null);
  const [activeLang, setActiveLang] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const scale = useRef(new Animated.Value(0.8)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  function stopSpeech() {
    try { Speech.stop(); } catch (_) {}
    setSpeaking(false);
  }

  // Map a language toggle key → the BCP-47 / device-TTS locale to speak in.
  // The default tab (no active language) is English and uses en-US.
  const SPEAK_LOCALE = {
    urdu:    'ur-PK',
    hindi:   'hi-IN',
    arabic:  'ar-SA',
    spanish: 'es-ES',
    french:  'fr-FR',
  };

  function speakAll() {
    if (speaking) return;
    const w = String(word || '').trim();
    if (!w) return;

    // Decide WHAT to speak + WHICH voice to use based on the currently
    // active language tab. Urdu tab → speak the Urdu translation with
    // ur-PK voice. English tab (no active toggle) → read the full
    // English card.
    let textToSpeak = '';
    let locale = 'en-US';
    if (activeLang) {
      // Speak EVERY visible field in the selected language. If batch
      // translations have come back, use them; otherwise fall back to
      // just the translated meaning we already have.
      const t = translatedAll || {};
      const parts = [w + '.'];
      if (t.meaning || translation) parts.push(String(t.meaning || translation).trim() + '.');
      if (t.example) parts.push(String(t.example).replace(/[“”"]/g, '').trim() + '.');
      if (t.synonym) parts.push(String(t.synonym).trim() + '.');
      if (t.antonym) parts.push(String(t.antonym).trim() + '.');
      textToSpeak = parts.join(' ');
      locale = SPEAK_LOCALE[activeLang] || 'en-US';
    } else {
      const parts = [w + '.'];
      if (detail?.meaning) parts.push('Meaning. ' + String(detail.meaning).replace(/\s+/g, ' ').trim() + '.');
      if (detail?.example) parts.push('Example. ' + String(detail.example).replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim() + '.');
      if (detail?.synonym) parts.push('Synonym. ' + String(detail.synonym).trim() + '.');
      if (detail?.antonym) parts.push('Antonym. ' + String(detail.antonym).trim() + '.');
      textToSpeak = parts.join(' ');
      locale = 'en-US';
    }

    try {
      Speech.stop();
      setSpeaking(true);
      Speech.speak(textToSpeak, {
        language: locale,
        // Non-Latin scripts (Urdu / Arabic) sound clearer a touch slower.
        rate: (locale === 'ur-PK' || locale === 'ar-SA') ? 0.78 : 0.88,
        // Slightly raised pitch produces a warmer, more feminine timbre
        // on Android even when only one OEM voice is installed.
        pitch: 1.18,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    } catch (_) { setSpeaking(false); }
  }

  function handleContinue() {
    stopSpeech();
    onClose && onClose();
  }

  async function pickLang(langKey) {
    if (!detail?.meaning) return;
    // Always halt any in-flight TTS the moment the user changes language —
    // otherwise the speaker keeps reading the previous-language audio.
    stopSpeech();
    if (activeLang === langKey) {
      setActiveLang(null); setTranslation(null); setTranslatedAll(null); return;
    }
    setActiveLang(langKey);
    setTranslation(null);
    setTranslatedAll(null);
    setTranslating(true);
    // Translate EVERY visible field in parallel — so when the speaker is
    // tapped the audio matches the language for the whole card, not just
    // the meaning line. The headline "translation" state stays for the
    // visible meaning text; translatedAll backs the speaker.
    const tasks = [];
    if (detail.meaning) tasks.push(translateMeaning({ word, meaning: detail.meaning, language: langKey }).then((r) => ['meaning', r?.translation || '']));
    if (detail.example) tasks.push(translateMeaning({ word, meaning: detail.example, language: langKey }).then((r) => ['example', r?.translation || '']));
    if (detail.synonym) tasks.push(translateMeaning({ word, meaning: detail.synonym, language: langKey }).then((r) => ['synonym', r?.translation || '']));
    if (detail.antonym) tasks.push(translateMeaning({ word, meaning: detail.antonym, language: langKey }).then((r) => ['antonym', r?.translation || '']));
    try {
      const results = await Promise.all(tasks);
      const bundle = {};
      for (const [k, v] of results) bundle[k] = v;
      setTranslating(false);
      if (bundle.meaning) setTranslation(bundle.meaning);
      setTranslatedAll(bundle);
    } catch (_) {
      setTranslating(false);
    }
  }

  // Always halt any speech the moment the card hides or unmounts.
  useEffect(() => {
    if (!visible) stopSpeech();
  }, [visible]);
  useEffect(() => {
    return () => { try { Speech.stop(); } catch (_) {} };
  }, []);

  // Pulse the speaker button while TTS is playing.
  useEffect(() => {
    if (speaking) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.18, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      if (pulseLoop.current) pulseLoop.current.stop();
      pulse.setValue(1);
    }
  }, [speaking]); // eslint-disable-line

  useEffect(() => {
    if (!visible || !word) return;
    const key = `${tier}:${word.toLowerCase()}`;
    setActiveLang(null);
    setTranslation(null);
    if (cache.has(key)) {
      setDetail(cache.get(key));
      setLoading(false);
    } else {
      setDetail(null);
      setLoading(true);
      (async () => {
        const r = await fetchWordDetail(word, tier, category, userId);
        const d = r?.detail || null;
        if (d) cache.set(key, d);
        setDetail(d);
        setLoading(false);
      })();
    }
    // Pakistan Quest path — when the card opens in PK Quest mode the
    // pakistanTutorAgent fires for a curated bilingual note. Fire-and-
    // forget so the card never blocks on it; the result is logged into
    // the admin pipeline regardless of whether the UI consumes it.
    if (Array.isArray(langs) && langs.includes('urdu') && word) {
      try {
        pkQuestNote(String(word).toLowerCase(), 'en').catch(() => {});
      } catch (_) {}
    }
    scale.setValue(0.85);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [visible, word, tier]);  // eslint-disable-line

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      // The learning card must stay open until the user explicitly taps
      // "Continue". Swallow the Android hardware-back press so it can't
      // dismiss the card behind the user's back.
      onRequestClose={() => {}}
    >
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.headerBar}>
            <Text style={styles.headerIcon}>✨</Text>
            <Text style={styles.headerText}>Word Found!</Text>
          </View>
          <View style={styles.wordRow}>
            <Text style={styles.word}>{String(word || '').toUpperCase()}</Text>
            <TouchableOpacity
              onPress={speakAll}
              disabled={speaking || loading}
              style={[styles.speakBtn, speaking && styles.speakBtnActive]}
              activeOpacity={0.75}
            >
              <Animated.Text style={[styles.speakIcon, { transform: [{ scale: pulse }] }]}>
                {speaking ? '📢' : '🔊'}
              </Animated.Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <ActivityIndicator color={PALETTE.accent} />
              <Text style={styles.loadingText}>Loading meaning…</Text>
            </View>
          ) : detail ? (
            <View style={{ marginTop: 8 }}>
              {detail.meaning ? (
                <Row icon="📖" label="Meaning" value={detail.meaning} />
              ) : null}
              {detail.example ? (
                <Row icon="💬" label="Example" value={`“${detail.example}”`} italic />
              ) : null}
              <View style={styles.dualRow}>
                {detail.synonym ? (
                  <View style={[styles.dualBox, { borderColor: PALETTE.syn + '55' }]}>
                    <Text style={[styles.dualLabel, { color: PALETTE.syn }]}>SAME (synonym)</Text>
                    <Text style={styles.dualValue}>{detail.synonym}</Text>
                  </View>
                ) : null}
                {detail.antonym ? (
                  <View style={[styles.dualBox, { borderColor: PALETTE.ant + '55' }]}>
                    <Text style={[styles.dualLabel, { color: PALETTE.ant }]}>OPPOSITE (antonym)</Text>
                    <Text style={styles.dualValue}>{detail.antonym}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <Text style={styles.fallback}>Could not load details. Tap Continue to keep playing.</Text>
          )}
          {detail?.meaning ? (
            <View style={styles.translateBlock}>
              <Text style={styles.translateLabel}>SEE MEANING IN YOUR LANGUAGE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {/* Explicit English pill — lets the player flip back to the
                    English meaning at any time. Active when no language
                    toggle is selected. */}
                <TouchableOpacity
                  onPress={() => {
                    stopSpeech();
                    setActiveLang(null);
                    setTranslation(null);
                  }}
                  style={[
                    styles.langPill,
                    !activeLang && { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
                  ]}
                >
                  <Text style={[styles.langText, !activeLang && { color: '#0b1424' }]}>English</Text>
                </TouchableOpacity>
                {availableLangs.map((L) => (
                  <TouchableOpacity
                    key={L.key}
                    onPress={() => pickLang(L.key)}
                    style={[
                      styles.langPill,
                      activeLang === L.key && { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
                    ]}
                  >
                    <Text style={[styles.langText, activeLang === L.key && { color: '#0b1424' }]}>{L.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {translating ? (
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator color={PALETTE.accent} size="small" />
                  <Text style={styles.translatingText}>Translating…</Text>
                </View>
              ) : translation ? (
                <Text style={styles.translationText}>{translation}</Text>
              ) : null}
            </View>
          ) : null}
          <TouchableOpacity style={styles.continue} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={styles.continueText}>Continue →</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Row({ icon, label, value, italic }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, italic && { fontStyle: 'italic' }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,80,80,0.7)', alignItems: 'center', justifyContent: 'center', padding: 14 },
  card: {
    width: '100%', maxWidth: 420, alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: 24, padding: 20,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#0f172a',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 16,
  },
  headerBar: {
    alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 8,
    backgroundColor: '#92400e',
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    marginBottom: 10,
    marginTop: -4,
  },
  headerIcon: { fontSize: 18 },
  headerText: {
    color: '#fde68a', fontWeight: '900', letterSpacing: 1.6, fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 },
  word: {
    color: PALETTE.text, fontSize: 34, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 3,
  },
  speakBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: '#14532d',
  },
  speakBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#fde68a',
    borderBottomColor: '#78350f',
    shadowColor: '#f59e0b', shadowOpacity: 0.85, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  speakIcon: { fontSize: 16 },

  translateBlock: {
    marginTop: 14, padding: 12, borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 2, borderColor: '#fbbf24',
  },
  translateLabel: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  langPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#0f172a',
  },
  langText: { color: PALETTE.text, fontWeight: '900', fontSize: 13 },
  translationText: { color: PALETTE.text, marginTop: 10, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  translatingText: { color: '#fde68a', fontSize: 12, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  rowIcon: { fontSize: 22, width: 26 },
  rowLabel: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  rowValue: { color: PALETTE.text, fontSize: 15, lineHeight: 21, marginTop: 2, fontWeight: '600' },

  dualRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  dualBox: {
    flex: 1, borderRadius: 16, padding: 12,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 3,
    borderBottomWidth: 6, borderBottomColor: 'rgba(0,0,0,0.55)',
  },
  dualLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  dualValue: { color: PALETTE.text, fontSize: 17, fontWeight: '900', marginTop: 4, textTransform: 'lowercase' },

  loadingText: { color: '#fde68a', marginTop: 8, fontSize: 12, fontWeight: '700' },
  fallback: { color: PALETTE.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  continue: {
    marginTop: 18, paddingVertical: 16, borderRadius: 999,
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#14532d',
    alignItems: 'center',
  },
  continueText: {
    color: '#fff', fontWeight: '900', letterSpacing: 1.5, fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
});
