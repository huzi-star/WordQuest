import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateLevel } from '../utils/api';

const diffColor = (d) => (d === 'easy' ? '#22c55e' : d === 'medium' ? '#eab308' : '#ef4444');
const diffEmoji = (d) => (d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴');

// Animated progress steps that cycle while loading.
const STEPS = [
  { icon: '🧠', text: 'Difficulty agent analyzing player stats...' },
  { icon: '🎨', text: 'Level generator creating Pakistan-themed grid...' },
  { icon: '📚', text: 'Tutor agent preparing cultural facts...' },
  { icon: '✨', text: 'Final touches by the AI...' },
];

function LoadingState() {
  const [stepIdx, setStepIdx] = useState(0);
  const rotate = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
    const id = setInterval(() => {
      setStepIdx((i) => (i + 1) % STEPS.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.loadWrap}>
      <View style={styles.loadBlob1} />
      <View style={styles.loadBlob2} />

      <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
        <View style={styles.spinnerDotTop} />
        <View style={styles.spinnerDotRight} />
      </Animated.View>

      <Text style={styles.loadTitle}>AI agents at work</Text>
      <Animated.View
        style={[
          styles.loadStep,
          {
            opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
          },
        ]}
      >
        <Text style={styles.loadIcon}>{STEPS[stepIdx].icon}</Text>
        <Text style={styles.loadText}>{STEPS[stepIdx].text}</Text>
      </Animated.View>

      <View style={styles.stepDots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.stepDot, i === stepIdx && styles.stepDotActive]} />
        ))}
      </View>
    </View>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.loadWrap}>
      <Text style={styles.errEmoji}>⚠️</Text>
      <Text style={styles.errTitle}>Connection nahi hua</Text>
      <Text style={styles.errSub}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Dobara try karo</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CategoryScreen({ navigation, route }) {
  const { playerStats, sessionStats } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await generateLevel(playerStats);
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
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <LoadingState />
    </SafeAreaView>
  );

  if (error) return (
    <SafeAreaView style={styles.container}>
      <ErrorState message={error} onRetry={() => navigation.replace('Category', route.params)} />
    </SafeAreaView>
  );

  const { difficulty, level, chaalbaazActive } = data;
  const dColor = diffColor(difficulty.difficulty);

  return (
    <View style={styles.container}>
      <View style={[styles.bgBlob, { backgroundColor: dColor, top: -100, right: -80 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {chaalbaazActive ? (
            <Animated.View style={[styles.chaalbaazBanner, { opacity: fadeIn }]}>
              <Text style={styles.chaalbaazTitle}>😏 ADVERSARY ACTIVATED</Text>
              <Text style={styles.chaalbaazSub}>Tum bohot acha kar rahe ho — Chaalbaaz agent ne difficulty barha di!</Text>
            </Animated.View>
          ) : null}

          <Animated.View style={[styles.heroWrap, { opacity: fadeIn, transform: [{ scale: heroScale }] }]}>
            <Text style={styles.aiHint}>🤖 AI ne choose kiya</Text>
            <View style={[styles.heroCircle, { borderColor: dColor, shadowColor: dColor }]}>
              <Text style={styles.heroEmoji}>{level.categoryEmoji || '🎯'}</Text>
            </View>
            <Text style={styles.heroCategory}>{level.category}</Text>

            <View style={[styles.diffPill, { backgroundColor: dColor }]}>
              <Text style={styles.diffPillText}>{diffEmoji(difficulty.difficulty)} {(difficulty.difficulty || '').toUpperCase()}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.metaRow, { opacity: fadeIn }]}>
            <View style={styles.metaTile}>
              <Text style={styles.metaIcon}>⏱</Text>
              <Text style={styles.metaValue}>{difficulty.timeLimit}s</Text>
              <Text style={styles.metaLabel}>TIME</Text>
            </View>
            <View style={styles.metaTile}>
              <Text style={styles.metaIcon}>🔤</Text>
              <Text style={styles.metaValue}>{difficulty.wordCount}</Text>
              <Text style={styles.metaLabel}>WORDS</Text>
            </View>
            <View style={styles.metaTile}>
              <Text style={styles.metaIcon}>🎮</Text>
              <Text style={styles.metaValue}>{difficulty.gridSize}×{difficulty.gridSize}</Text>
              <Text style={styles.metaLabel}>GRID</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.reasonCard, { opacity: fadeIn }]}>
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonHeaderIcon}>💭</Text>
              <Text style={styles.reasonHeaderText}>AI ka sochna</Text>
            </View>
            <Text style={styles.reasonText}>{difficulty.reason}</Text>
          </Animated.View>

          <Animated.View style={[styles.funFactCard, { opacity: fadeIn }]}>
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonHeaderIcon}>💡</Text>
              <Text style={[styles.reasonHeaderText, { color: '#22c55e' }]}>Fun Fact</Text>
            </View>
            <Text style={styles.funFactText}>{level.funFact}</Text>
          </Animated.View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.startBtn, { shadowColor: dColor }]}
            onPress={() =>
              navigation.replace('Game', {
                playerStats, sessionStats, difficulty, level,
              })
            }
          >
            <Text style={styles.startBtnText}>TAYAAR HUN! →</Text>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14', overflow: 'hidden' },
  bgBlob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.15 },
  scroll: { padding: 18, gap: 12 },

  // Loading state
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  loadBlob1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#22c55e', opacity: 0.12, top: 60, left: -80 },
  loadBlob2: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: '#a78bfa', opacity: 0.1, bottom: 80, right: -60 },
  spinnerRing: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  spinnerDotTop: {
    position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e', shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  spinnerDotRight: {
    position: 'absolute', right: -4, top: 43, width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#a78bfa', opacity: 0.7,
  },
  loadTitle: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  loadStep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  loadIcon: { fontSize: 24 },
  loadText: { color: '#cbd5e1', fontSize: 14, flex: 1 },
  stepDots: { flexDirection: 'row', gap: 6, marginTop: 6 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },
  stepDotActive: { backgroundColor: '#22c55e', width: 18 },

  // Error
  errEmoji: { fontSize: 64 },
  errTitle: { color: '#ef4444', fontSize: 22, fontWeight: '900' },
  errSub: { color: '#94a3b8', textAlign: 'center', marginTop: 4 },
  retryBtn: { backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 14 },
  retryText: { color: '#0f172a', fontWeight: '900' },

  // Chaalbaaz banner
  chaalbaazBanner: {
    backgroundColor: 'rgba(127, 29, 29, 0.5)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f97316',
  },
  chaalbaazTitle: { color: '#fcd34d', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  chaalbaazSub: { color: '#fed7aa', marginTop: 4, fontSize: 13 },

  // Hero
  heroWrap: { alignItems: 'center', paddingVertical: 8 },
  aiHint: { color: '#64748b', fontSize: 11, letterSpacing: 1.5, fontWeight: '700', marginBottom: 8 },
  heroCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  heroEmoji: { fontSize: 64 },
  heroCategory: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 12 },
  diffPill: {
    marginTop: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
  },
  diffPillText: { color: '#0f172a', fontWeight: '900', letterSpacing: 1 },

  // Meta tiles
  metaRow: { flexDirection: 'row', gap: 10 },
  metaTile: {
    flex: 1, backgroundColor: '#0e1726', borderRadius: 14, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#1f2937',
  },
  metaIcon: { fontSize: 18 },
  metaValue: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 },
  metaLabel: { color: '#64748b', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 2 },

  // Cards
  reasonCard: {
    backgroundColor: '#0e1726', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#334155',
  },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reasonHeaderIcon: { fontSize: 16 },
  reasonHeaderText: { color: '#94a3b8', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  reasonText: { color: '#fff', fontSize: 14, lineHeight: 20 },

  funFactCard: {
    backgroundColor: 'rgba(34,197,94,0.06)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#22c55e',
  },
  funFactText: { color: '#bbf7d0', fontSize: 14, lineHeight: 20 },

  // Primary CTA
  startBtn: {
    backgroundColor: '#22c55e', borderRadius: 20, paddingVertical: 16, alignItems: 'center',
    marginTop: 8,
    shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  startBtnText: { color: '#0f172a', fontSize: 17, fontWeight: '900', letterSpacing: 1.5 },
});
