import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateLevel } from '../utils/api';
import { useTheme } from '../utils/theme';
import { useSettings } from '../utils/settings';

const STEPS = {
  english: [
    { icon: '🧠', text: 'Difficulty agent analyzing player stats...' },
    { icon: '🎨', text: 'Level generator creating themed grid...' },
    { icon: '📚', text: 'Tutor agent preparing cultural facts...' },
    { icon: '✨', text: 'Final touches by the AI...' },
  ],
  urdu: [
    { icon: '🧠', text: 'Difficulty agent stats analyse kar raha...' },
    { icon: '🎨', text: 'Level generator grid bana raha...' },
    { icon: '📚', text: 'Tutor agent facts taiyaar kar raha...' },
    { icon: '✨', text: 'AI final touches laga raha...' },
  ],
};

function LoadingState({ theme, language }) {
  const [stepIdx, setStepIdx] = useState(0);
  const rotate = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const stepList = language === 'urdu' ? STEPS.urdu : STEPS.english;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    ).start();
    const id = setInterval(() => setStepIdx((i) => (i + 1) % stepList.length), 1400);
    return () => clearInterval(id);
  }, [stepList.length]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.loadWrap}>
      <View style={[styles.loadBlob, { backgroundColor: theme.accent, top: 60, left: -80, opacity: 0.18 }]} />
      <View style={[styles.loadBlob, { backgroundColor: theme.accent2, bottom: 80, right: -60, opacity: 0.14 }]} />

      <Animated.View style={[styles.spinnerOuter, { borderColor: `${theme.accent}33`, transform: [{ scale: breathe }] }]}>
        <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
          <View style={[styles.spinnerDotTop, { backgroundColor: theme.accent, shadowColor: theme.accent }]} />
          <View style={[styles.spinnerDotRight, { backgroundColor: theme.accent2 }]} />
        </Animated.View>
        <View style={styles.spinnerCore}>
          <Text style={styles.spinnerCoreIcon}>🤖</Text>
        </View>
      </Animated.View>

      <Text style={styles.loadTitle}>AI agents at work</Text>
      <Animated.View
        style={[
          styles.loadStep,
          { opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
        ]}
      >
        <Text style={styles.loadIcon}>{stepList[stepIdx].icon}</Text>
        <Text style={styles.loadText}>{stepList[stepIdx].text}</Text>
      </Animated.View>

      <View style={styles.stepDots}>
        {stepList.map((_, i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              i === stepIdx && [styles.stepDotActive, { backgroundColor: theme.accent }],
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function ErrorState({ message, onRetry, theme }) {
  return (
    <View style={styles.loadWrap}>
      <Text style={styles.errEmoji}>⚠️</Text>
      <Text style={styles.errTitle}>Connection nahi hua</Text>
      <Text style={styles.errSub}>{message}</Text>
      <TouchableOpacity
        style={[styles.retryBtn, { backgroundColor: theme.accent }]}
        onPress={onRetry}
      >
        <Text style={[styles.retryText, { color: theme.bg }]}>Dobara try karo</Text>
      </TouchableOpacity>
    </View>
  );
}

const diffEmoji = (d) => (d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴');

export default function CategoryScreen({ navigation, route }) {
  const theme = useTheme();
  const { settings } = useSettings();
  const { playerStats, sessionStats, levelNumber = 0 } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.7)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await generateLevel(playerStats, { levelNumber });
      if (cancelled) return;
      if (!res || !res.ok) {
        setError(res?.error || 'AI ne response nahi diya. Backend check karo.');
        setLoading(false);
        return;
      }
      setData(res);
      setLoading(false);
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      ]).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(ctaPulse, { toValue: 1.03, duration: 900, useNativeDriver: true }),
          Animated.timing(ctaPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
      ).start();
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <LoadingState theme={theme} language={settings.language} />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ErrorState message={error} onRetry={() => navigation.replace('Category', route.params)} theme={theme} />
      </SafeAreaView>
    );
  }

  const { difficulty, level, chaalbaazActive } = data;
  const dColor = difficulty.difficulty === 'easy' ? theme.accent : difficulty.difficulty === 'medium' ? theme.gold : '#ef4444';

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.bgBlob, { backgroundColor: dColor, top: -120, right: -100 }]} />
      <View style={[styles.bgBlob, { backgroundColor: theme.accent2, bottom: -140, left: -100, opacity: 0.14 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* HEADER with back button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.back, { borderColor: theme.border }]}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          {levelNumber > 0 ? (
            <View style={[styles.levelPill, { borderColor: theme.accent, backgroundColor: `${theme.accent}1a` }]}>
              <Text style={[styles.levelPillText, { color: theme.accent }]}>LEVEL {levelNumber}</Text>
            </View>
          ) : (
            <View style={[styles.levelPill, { borderColor: theme.accent2, backgroundColor: `${theme.accent2}1a` }]}>
              <Text style={[styles.levelPillText, { color: theme.accent2 }]}>QUICK PLAY</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {chaalbaazActive ? (
            <Animated.View style={[styles.chaalbaazBanner, { opacity: fadeIn }]}>
              <Text style={styles.chaalbaazTitle}>😏 ADVERSARY ACTIVATED</Text>
              <Text style={styles.chaalbaazSub}>Tum acha kar rahe ho — Chaalbaaz ne difficulty barha di!</Text>
            </Animated.View>
          ) : null}

          {/* HERO */}
          <Animated.View style={[styles.heroWrap, { opacity: fadeIn, transform: [{ scale: heroScale }] }]}>
            <Text style={[styles.aiHint, { color: theme.accent }]}>🤖 AI ne choose kiya</Text>
            <View style={[styles.heroCircle, { borderColor: dColor, shadowColor: dColor, backgroundColor: theme.card }]}>
              <Text style={styles.heroEmoji}>{level.categoryEmoji || '🎯'}</Text>
            </View>
            <Text style={styles.heroCategory}>{level.category}</Text>

            <View style={[styles.diffPill, { backgroundColor: dColor }]}>
              <Text style={[styles.diffPillText, { color: theme.bg }]}>
                {diffEmoji(difficulty.difficulty)} {(difficulty.difficulty || '').toUpperCase()}
              </Text>
            </View>
          </Animated.View>

          {/* META TILES */}
          <Animated.View style={[styles.metaRow, { opacity: fadeIn }]}>
            <View style={[styles.metaTile, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.metaIconWrap, { backgroundColor: `${theme.accent}22`, borderColor: theme.accent }]}>
                <Text style={styles.metaIcon}>⏱</Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.accent }]}>{difficulty.timeLimit}s</Text>
              <Text style={styles.metaLabel}>TIME</Text>
            </View>
            <View style={[styles.metaTile, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.metaIconWrap, { backgroundColor: `${theme.gold}22`, borderColor: theme.gold }]}>
                <Text style={styles.metaIcon}>🔤</Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.gold }]}>{difficulty.wordCount}</Text>
              <Text style={styles.metaLabel}>WORDS</Text>
            </View>
            <View style={[styles.metaTile, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.metaIconWrap, { backgroundColor: `${theme.accent2}22`, borderColor: theme.accent2 }]}>
                <Text style={styles.metaIcon}>🎮</Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.accent2 }]}>{difficulty.gridSize}×{difficulty.gridSize}</Text>
              <Text style={styles.metaLabel}>GRID</Text>
            </View>
          </Animated.View>

          {/* AI REASONING CARD */}
          <Animated.View style={[styles.reasonCard, { backgroundColor: theme.card, borderColor: theme.border, opacity: fadeIn }]}>
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonHeaderIcon}>💭</Text>
              <Text style={[styles.reasonHeaderText, { color: theme.accent }]}>AI ka sochna</Text>
            </View>
            <Text style={styles.reasonText}>{difficulty.reason}</Text>
          </Animated.View>

          {/* FUN FACT CARD */}
          <Animated.View
            style={[
              styles.funFactCard,
              { backgroundColor: `${theme.accent}0d`, borderColor: theme.accent, opacity: fadeIn },
            ]}
          >
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonHeaderIcon}>💡</Text>
              <Text style={[styles.reasonHeaderText, { color: theme.accent }]}>Fun Fact</Text>
            </View>
            <Text style={[styles.funFactText, { color: '#e2e8f0' }]}>{level.funFact}</Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.startBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
              onPress={() =>
                navigation.replace('Game', {
                  playerStats, sessionStats, difficulty, level, levelNumber,
                })
              }
            >
              <Text style={[styles.startBtnText, { color: theme.bg }]}>TAYAAR HUN! →</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ height: 18 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  bgBlob: { position: 'absolute', width: 340, height: 340, borderRadius: 170, opacity: 0.16 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backIcon: { color: '#fff', fontSize: 22 },
  levelPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  levelPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  // Loading state
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loadBlob: { position: 'absolute', width: 280, height: 280, borderRadius: 140 },
  spinnerOuter: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  spinnerRing: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  spinnerDotTop: { position: 'absolute', top: -4, width: 16, height: 16, borderRadius: 8, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  spinnerDotRight: { position: 'absolute', right: -4, top: 52, width: 10, height: 10, borderRadius: 5, opacity: 0.7 },
  spinnerCore: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  spinnerCoreIcon: { fontSize: 28 },
  loadTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  loadStep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  loadIcon: { fontSize: 24 },
  loadText: { color: '#cbd5e1', fontSize: 14, flex: 1 },
  stepDots: { flexDirection: 'row', gap: 6 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },
  stepDotActive: { width: 22 },

  // Error
  errEmoji: { fontSize: 64 },
  errTitle: { color: '#ef4444', fontSize: 22, fontWeight: '900' },
  errSub: { color: '#94a3b8', textAlign: 'center', marginTop: 4 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 14 },
  retryText: { fontWeight: '900' },

  // Chaalbaaz banner
  chaalbaazBanner: {
    backgroundColor: 'rgba(127, 29, 29, 0.5)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f97316',
  },
  chaalbaazTitle: { color: '#fcd34d', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  chaalbaazSub: { color: '#fed7aa', marginTop: 4, fontSize: 13 },

  // Hero
  heroWrap: { alignItems: 'center', paddingVertical: 6 },
  aiHint: { fontSize: 10, letterSpacing: 1.5, fontWeight: '900', marginBottom: 10 },
  heroCircle: {
    width: 130, height: 130, borderRadius: 65,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  heroEmoji: { fontSize: 70 },
  heroCategory: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 14, textAlign: 'center', letterSpacing: 0.5 },
  diffPill: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14 },
  diffPillText: { fontWeight: '900', letterSpacing: 1 },

  // Meta tiles
  metaRow: { flexDirection: 'row', gap: 10 },
  metaTile: {
    flex: 1, borderRadius: 16, padding: 12,
    alignItems: 'center', borderWidth: 1,
  },
  metaIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 6,
  },
  metaIcon: { fontSize: 18 },
  metaValue: { fontSize: 18, fontWeight: '900' },
  metaLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },

  // Reason / fun-fact cards
  reasonCard: { borderRadius: 16, padding: 14, borderWidth: 1 },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reasonHeaderIcon: { fontSize: 16 },
  reasonHeaderText: { fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  reasonText: { color: '#fff', fontSize: 14, lineHeight: 20 },

  funFactCard: { borderRadius: 16, padding: 14, borderWidth: 1 },
  funFactText: { fontSize: 14, lineHeight: 20 },

  // Primary CTA
  startBtn: {
    borderRadius: 22, paddingVertical: 17, alignItems: 'center', marginTop: 8,
    shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  startBtnText: { fontSize: 17, fontWeight: '900', letterSpacing: 1.5 },
});
