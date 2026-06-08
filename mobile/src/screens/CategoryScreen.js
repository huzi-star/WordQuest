import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Easing, ImageBackground, Modal,
} from 'react-native';

const BG = require('../../home_design/home_bg.jpeg');
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateLevel } from '../utils/api';
import { useTheme } from '../utils/theme';
import { useSettings } from '../utils/settings';
import { loadStats } from '../utils/storage';
import { tierForScore } from '../utils/tiers';
import { stopBgm } from '../utils/sound';
import { offlinePushLevel, offlinePopLevel } from '../utils/storage';

const STEPS = {
  english: [
    { icon: '🧠', text: 'Difficulty agent analyzing player stats...' },
    { icon: '🎨', text: 'Level generator creating themed grid...' },
    { icon: '📚', text: 'Tutor agent preparing cultural facts...' },
    { icon: '✨', text: 'Final touches by the AI...' },
  ],
  urdu: [
    { icon: '🧠', text: 'Difficulty agent analyzing your stats...' },
    { icon: '🎨', text: 'Level generator building the grid...' },
    { icon: '📚', text: 'Tutor agent preparing facts...' },
    { icon: '✨', text: 'AI adding final touches...' },
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
    <ImageBackground source={BG} style={styles.bgFull} resizeMode="cover">
      <View style={styles.tealTint} />
      <View style={styles.loadWrap}>
        <Animated.View style={[styles.spinnerOuter, { transform: [{ scale: breathe }] }]}>
          <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
            <View style={styles.spinnerDotTop} />
            <View style={styles.spinnerDotRight} />
            <View style={styles.spinnerDotBottom} />
          </Animated.View>
          <View style={styles.spinnerCore}>
            <Text style={styles.spinnerCoreIcon}>🤖</Text>
          </View>
        </Animated.View>

        <View style={styles.titlePlate}>
          <Text style={styles.titlePlateBig}>AI Agents at Work</Text>
          <Text style={styles.titlePlateSub}>BUILDING YOUR LEVEL</Text>
        </View>

        <Animated.View
          style={[
            styles.stepCard,
            { opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
          ]}
        >
          <Text style={styles.stepIcon}>{stepList[stepIdx].icon}</Text>
          <Text style={styles.stepText}>{stepList[stepIdx].text}</Text>
        </Animated.View>

        <View style={styles.stepDots}>
          {stepList.map((_, i) => (
            <View
              key={i}
              style={[styles.stepDot, i === stepIdx && styles.stepDotActive]}
            />
          ))}
        </View>
      </View>
    </ImageBackground>
  );
}

function ErrorState({ message, onRetry, theme }) {
  return (
    <View style={styles.loadWrap}>
      <Text style={styles.errEmoji}>⚠️</Text>
      <Text style={styles.errTitle}>Could not connect</Text>
      <Text style={styles.errSub}>{message}</Text>
      <TouchableOpacity
        style={[styles.retryBtn, { backgroundColor: theme.accent }]}
        onPress={onRetry}
      >
        <Text style={[styles.retryText, { color: theme.bg }]}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const diffEmoji = (d) => (d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴');

export default function CategoryScreen({ navigation, route }) {
  const theme = useTheme();
  const { settings } = useSettings();
  const {
    playerStats, sessionStats, levelNumber = 0,
    reshuffleWords = null, reshuffleCategory = '', reshuffleEmoji = '', reshuffleFunFact = '',
  } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tierObj, setTierObj] = useState(null);
  const [showChaalbaaz, setShowChaalbaaz] = useState(false);
  const chaalbaazScale = useRef(new Animated.Value(0.6)).current;
  const chaalbaazWag = useRef(new Animated.Value(0)).current;

  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.7)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    stopBgm();
    let cancelled = false;
    (async () => {
      setLoading(true);
      const s = await loadStats();
      const myTier = tierForScore(s?.totalScoreEver || 0);
      setTierObj(myTier);
      const tier = myTier.key;
      let res = await generateLevel(playerStats, {
        levelNumber,
        tier,
        reshuffleWords, reshuffleCategory, reshuffleEmoji, reshuffleFunFact,
      });
      if (cancelled) return;
      // Offline fallback — if the request failed, try a cached level.
      if (!res || !res.ok) {
        const cached = await offlinePopLevel();
        if (cached) res = cached;
      }
      if (!res || !res.ok) {
        setError(res?.error || 'AI ne response nahi diya. Backend check karo.');
        setLoading(false);
        return;
      }
      // Cache this freshly-generated level so it's playable when offline.
      if (res.ok && !levelNumber) {
        try { await offlinePushLevel(res); } catch {}
      }
      setData(res);
      setLoading(false);
      // Quick Play only: fire the Chaalbaaz intro modal when the backend
      // says a HARD level was triggered for a dominating player. The
      // preview screen waits on Continue before the user can tap LET'S
      // PLAY — effectively pausing the flow.
      if (res?.chaalbaazIntro?.active && !levelNumber) {
        setShowChaalbaaz(true);
        Animated.spring(chaalbaazScale, {
          toValue: 1, useNativeDriver: true, friction: 5, tension: 80,
        }).start();
        Animated.loop(
          Animated.sequence([
            Animated.timing(chaalbaazWag, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(chaalbaazWag, { toValue: -1, duration: 700, useNativeDriver: true }),
          ]),
        ).start();
      }
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
      <SafeAreaView style={styles.container}>
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

  const { difficulty: rawDifficulty, level, chaalbaazActive } = data;
  // Tier-mandated overrides — the player's current tier is the source of
  // truth for grid size, word count, timer, and points-per-word.
  const cfg = tierObj?.puzzle || {};
  const difficulty = {
    ...rawDifficulty,
    gridSize: cfg.gridSize || rawDifficulty.gridSize,
    wordCount: cfg.wordCount || rawDifficulty.wordCount,
    timeLimit: cfg.timeLimit || rawDifficulty.timeLimit,
    pointsPerWord: cfg.pointsPerWord,
    tier: tierObj?.key,
  };
  const dColor = difficulty.difficulty === 'easy' ? theme.accent : difficulty.difficulty === 'medium' ? theme.gold : '#ef4444';

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.tealTint} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* HEADER with back button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>{levelNumber > 0 ? `LEVEL ${levelNumber}` : 'QUICK PLAY'}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {chaalbaazActive && !showChaalbaaz ? (
            <Animated.View style={[styles.chaalbaazBanner, { opacity: fadeIn }]}>
              <Text style={styles.chaalbaazTitle}>😏 ADVERSARY ACTIVATED</Text>
              <Text style={styles.chaalbaazSub}>Chaalbaaz cranked up the difficulty for you!</Text>
            </Animated.View>
          ) : null}

          {/* HERO */}
          <Animated.View style={[styles.heroWrap, { opacity: fadeIn, transform: [{ scale: heroScale }] }]}>
            <Text style={styles.aiHint}>🤖 AI PICKED FOR YOU</Text>
            <View style={styles.heroCircle}>
              <Text style={styles.heroEmoji}>{level.categoryEmoji || '🎯'}</Text>
            </View>
            <Text style={styles.heroCategory}>{level.category}</Text>

            <View style={[styles.diffPill, { backgroundColor: dColor }]}>
              <Text style={[styles.diffPillText, { color: '#fff' }]}>
                {diffEmoji(difficulty.difficulty)} {(difficulty.difficulty || '').toUpperCase()}
              </Text>
            </View>
          </Animated.View>

          {/* META TILES */}
          <Animated.View style={[styles.metaRow, { opacity: fadeIn }]}>
            <View style={styles.metaTile}>
              <View style={[styles.metaIconWrap, { backgroundColor: `${theme.accent}22`, borderColor: theme.accent }]}>
                <Text style={styles.metaIcon}>⏱</Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.accent }]}>{difficulty.timeLimit}s</Text>
              <Text style={styles.metaLabel}>TIME</Text>
            </View>
            <View style={styles.metaTile}>
              <View style={[styles.metaIconWrap, { backgroundColor: `${theme.gold}22`, borderColor: theme.gold }]}>
                <Text style={styles.metaIcon}>🔤</Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.gold }]}>{difficulty.wordCount}</Text>
              <Text style={styles.metaLabel}>WORDS</Text>
            </View>
            <View style={styles.metaTile}>
              <View style={[styles.metaIconWrap, { backgroundColor: `${theme.accent2}22`, borderColor: theme.accent2 }]}>
                <Text style={styles.metaIcon}>🎮</Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.accent2 }]}>{difficulty.gridSize}×{difficulty.gridSize}</Text>
              <Text style={styles.metaLabel}>GRID</Text>
            </View>
          </Animated.View>

          {/* AI REASONING CARD */}
          <Animated.View style={[styles.reasonCard, { opacity: fadeIn }]}>
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonHeaderIcon}>💭</Text>
              <Text style={styles.reasonHeaderText}>AI THINKING</Text>
            </View>
            <Text style={styles.reasonText}>{difficulty.reason}</Text>
          </Animated.View>

          {/* FUN FACT CARD */}
          <Animated.View style={[styles.funFactCard, { opacity: fadeIn }]}>
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonHeaderIcon}>💡</Text>
              <Text style={[styles.reasonHeaderText, { color: '#86efac' }]}>FUN FACT</Text>
            </View>
            <Text style={styles.funFactText}>{level.funFact}</Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.startBtn}
              onPress={() =>
                navigation.replace('Game', {
                  playerStats, sessionStats, difficulty, level, levelNumber,
                })
              }
            >
              <Text style={styles.startBtnText}>LET'S PLAY</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ height: 18 }} />
        </ScrollView>

        {/* Chaalbaaz pre-round modal — Quick Play HARD transitions only.
            Pauses the user on the preview screen until they tap Continue. */}
        <Modal
          visible={showChaalbaaz}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.chaalbaazModalBackdrop}>
            <Animated.View
              style={[
                styles.chaalbaazModalCard,
                {
                  transform: [
                    { scale: chaalbaazScale },
                    { rotate: chaalbaazWag.interpolate({ inputRange: [-1, 1], outputRange: ['-3deg', '3deg'] }) },
                  ],
                },
              ]}
            >
              <View style={styles.chaalbaazAvatar}>
                <Text style={styles.chaalbaazAvatarEmoji}>😏</Text>
              </View>
              <Text style={styles.chaalbaazModalTitle}>CHAALBAAZ</Text>
              <Text style={styles.chaalbaazModalLabel}>HARD CHALLENGE INCOMING</Text>
              <View style={styles.chaalbaazBubble}>
                <Text style={styles.chaalbaazBubbleText}>
                  {data?.chaalbaazIntro?.message || "You're getting too fast! I'm raising the difficulty. Bet I catch you this round."}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.chaalbaazContinueBtn}
                onPress={() => {
                  setShowChaalbaaz(false);
                  navigation.replace('Game', {
                    playerStats, sessionStats, difficulty, level, levelNumber,
                  });
                }}
              >
                <Text style={styles.chaalbaazContinueText}>CONTINUE →</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  bgFull: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,80,80,0.55)' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  back: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  levelPill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#78350f',
    borderWidth: 2, borderColor: '#fbbf24',
  },
  levelPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, color: '#fef3c7' },

  // Loading state — cartoonish
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 22 },
  spinnerOuter: {
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 5, borderColor: '#a16207',
  },
  spinnerRing: {
    position: 'absolute',
    width: 170, height: 170, borderRadius: 85,
    borderWidth: 4, borderColor: 'rgba(252,211,21,0.7)',
    borderStyle: 'dashed',
  },
  spinnerDotTop: { position: 'absolute', top: -10, left: 76, width: 18, height: 18, borderRadius: 9, backgroundColor: '#facc15', borderWidth: 2, borderColor: '#fff' },
  spinnerDotRight: { position: 'absolute', right: -10, top: 76, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
  spinnerDotBottom: { position: 'absolute', bottom: -8, left: 78, width: 14, height: 14, borderRadius: 7, backgroundColor: '#ec4899', borderWidth: 2, borderColor: '#fff' },
  spinnerCore: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#facc15',
  },
  spinnerCoreIcon: { fontSize: 44 },

  titlePlate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  titlePlateBig: { color: '#fff', fontSize: 22, fontWeight: '900' },
  titlePlateSub: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginTop: -2 },

  stepCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 16,
    borderWidth: 2, borderColor: '#fbbf24',
    maxWidth: '90%',
  },
  stepIcon: { fontSize: 26 },
  stepText: { color: '#fef3c7', fontSize: 13, fontWeight: '800', flexShrink: 1 },
  stepDots: { flexDirection: 'row', gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  stepDotActive: { width: 28, backgroundColor: '#facc15' },

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

  // Chaalbaaz pre-round MODAL — pauses the flow until Continue is tapped.
  chaalbaazModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 22,
  },
  chaalbaazModalCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#1a0a0a',
    borderRadius: 26,
    paddingHorizontal: 22, paddingTop: 28, paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#f97316',
    borderBottomWidth: 9, borderBottomColor: '#7c2d12',
    shadowColor: '#f97316', shadowOpacity: 0.55, shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 }, elevation: 22,
  },
  chaalbaazAvatar: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#7c2d12',
    borderWidth: 4, borderColor: '#fcd34d',
    marginBottom: 10,
  },
  chaalbaazAvatarEmoji: { fontSize: 56 },
  chaalbaazModalTitle: {
    color: '#fcd34d', fontSize: 26, fontWeight: '900', letterSpacing: 3,
  },
  chaalbaazModalLabel: {
    color: '#fed7aa', fontSize: 11, fontWeight: '900', letterSpacing: 2,
    marginTop: 2, marginBottom: 14,
  },
  chaalbaazBubble: {
    width: '100%',
    backgroundColor: '#fff7ed',
    borderRadius: 18, padding: 14,
    borderWidth: 2, borderColor: '#f97316',
    marginBottom: 18,
  },
  chaalbaazBubbleText: {
    color: '#7c2d12', fontSize: 15, lineHeight: 22, fontWeight: '700',
    textAlign: 'center',
  },
  chaalbaazContinueBtn: {
    width: '100%',
    paddingVertical: 16, borderRadius: 999,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#14532d',
  },
  chaalbaazContinueText: {
    color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.8,
  },

  // Hero
  heroWrap: { alignItems: 'center', paddingVertical: 6 },
  aiHint: {
    fontSize: 11, letterSpacing: 1.8, fontWeight: '900', marginBottom: 12,
    color: '#fde68a', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  heroCircle: {
    width: 140, height: 140, borderRadius: 70,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 5, borderColor: '#a16207',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  heroEmoji: { fontSize: 78 },
  heroCategory: {
    color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 14, textAlign: 'center', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 4,
  },
  diffPill: {
    marginTop: 12, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999,
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 6, borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  diffPillText: { fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },

  // Meta tiles — chunky 3D
  metaRow: { flexDirection: 'row', gap: 10 },
  metaTile: {
    flex: 1, borderRadius: 16, padding: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  metaIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: 6,
  },
  metaIcon: { fontSize: 20 },
  metaValue: { fontSize: 20, fontWeight: '900' },
  metaLabel: { color: '#cbd5e1', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 2 },

  // Reason / fun-fact cards
  reasonCard: {
    borderRadius: 18, padding: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 2, borderColor: '#fbbf24',
  },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reasonHeaderIcon: { fontSize: 18 },
  reasonHeaderText: { fontWeight: '900', fontSize: 12, letterSpacing: 1.4, color: '#fde68a' },
  reasonText: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '600' },

  funFactCard: {
    borderRadius: 18, padding: 14,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 2, borderColor: '#22c55e',
  },
  funFactText: { fontSize: 14, lineHeight: 20, color: '#dcfce7', fontWeight: '600' },

  // Primary CTA — chunky green
  startBtn: {
    borderRadius: 999, paddingVertical: 18, alignItems: 'center', marginTop: 8,
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  startBtnText: {
    fontSize: 18, fontWeight: '900', letterSpacing: 1.5, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
});
