import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import { useFocusEffect } from '@react-navigation/native';
import { loadStats, getLevelWords } from '../utils/storage';
import { useTheme } from '../utils/theme';
import { usePlan, isLevelUnlocked } from '../utils/plan';

const TOTAL_LEVELS = 15;

// Locked level table (matches backend difficultyAgent.LEVEL_CONFIG).
const LEVEL_TABLE = {
  1:  { gridSize: 3,  wordCount: 2,  timeLimit: 40 },
  2:  { gridSize: 4,  wordCount: 4,  timeLimit: 40 },
  3:  { gridSize: 5,  wordCount: 4,  timeLimit: 45 },
  4:  { gridSize: 5,  wordCount: 5,  timeLimit: 45 },
  5:  { gridSize: 6,  wordCount: 6,  timeLimit: 60 },
  6:  { gridSize: 6,  wordCount: 7,  timeLimit: 76 },
  7:  { gridSize: 7,  wordCount: 8,  timeLimit: 80 },
  8:  { gridSize: 7,  wordCount: 7,  timeLimit: 80 },
  9:  { gridSize: 8,  wordCount: 7,  timeLimit: 100 },
  10: { gridSize: 8,  wordCount: 8,  timeLimit: 100 },
  11: { gridSize: 9,  wordCount: 8,  timeLimit: 110 },
  12: { gridSize: 9,  wordCount: 9,  timeLimit: 110 },
  13: { gridSize: 10, wordCount: 9,  timeLimit: 120 },
  14: { gridSize: 10, wordCount: 10, timeLimit: 120 },
  15: { gridSize: 12, wordCount: 12, timeLimit: 130 },
};
function colorFor(n, theme) {
  if (n <= 5) return theme.accent;
  if (n <= 10) return theme.gold;
  return '#ef4444';
}

export default function LevelsScreen({ navigation }) {
  const theme = useTheme();
  const { plan, features } = usePlan();
  const [stats, setStats] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadStats();
        if (cancelled) return;
        setStats(s);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  if (!stats) {
    return (
      <ImageBackground source={BG} style={styles.container} resizeMode="cover">
        <View style={styles.tint} />
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="large" color="#facc15" />
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const maxUnlocked = stats.maxUnlockedLevel || 1;
  const completed = new Set(stats.completedLevels || []);
  const progress = Math.round((completed.size / TOTAL_LEVELS) * 100);

  async function startLevel(n) {
    if (n > maxUnlocked) return;
    if (!isLevelUnlocked(plan, n)) {
      navigation.navigate('Paywall', { reason: `Levels ${features.maxLevel + 1}-15 are a Pro feature. Unlock the full journey.` });
      return;
    }
    // If this level was attempted before, pass cached words so AI just
    // reshuffles them into a new grid (retry logic for Level Mode).
    const cached = await getLevelWords(n);
    navigation.navigate('Category', {
      playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
      sessionStats: {
        score: 0, round: 1, streak: 0, badges: [], history: [],
        highScore: stats.highScore || 0, bestStreak: stats.bestStreak || 0, levelNumber: n,
      },
      levelNumber: n,
      ...(cached ? {
        reshuffleWords: cached.words,
        reshuffleCategory: cached.category,
        reshuffleEmoji: cached.emoji,
        reshuffleFunFact: cached.funFact,
      } : {}),
    });
  }

  // Flatten 15 levels into rows of 3.
  const rows = [];
  for (let i = 0; i < TOTAL_LEVELS; i += 3) {
    rows.push([i + 1, i + 2, i + 3].filter((n) => n <= TOTAL_LEVELS));
  }

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.titlePlate}>
              <Text style={styles.titlePlateBig}>🏆 LEVELS</Text>
              <Text style={styles.titlePlateSub}>15 AI-DESIGNED STAGES</Text>
            </View>
          </View>

          {/* Progress card */}
          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <View>
                <Text style={[styles.progressLabel, { color: theme.accent }]}>UNLOCKED</Text>
                <Text style={styles.progressValue}>{maxUnlocked} / {TOTAL_LEVELS}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.progressLabel, { color: theme.gold }]}>COMPLETED</Text>
                <Text style={[styles.progressValue, { color: theme.gold }]}>{completed.size} / {TOTAL_LEVELS}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.gold }]} />
            </View>
            <Text style={styles.progressHint}>{progress}% of the journey complete</Text>
          </View>

          {/* Flat 3-per-row grid, no category headers */}
          <View style={styles.flatGrid}>
            {rows.map((row, ri) => (
              <View key={`r${ri}`} style={styles.gridRow}>
                {row.map((n) => (
                  <LevelTile
                    key={n}
                    n={n}
                    stats={stats}
                    theme={theme}
                    onPress={() => startLevel(n)}
                  />
                ))}
                {/* Fill empty slots so the last row aligns */}
                {row.length < 3 ? Array.from({ length: 3 - row.length }).map((_, i) => (
                  <View key={`spacer${i}`} style={styles.tileSpacer} />
                )) : null}
              </View>
            ))}
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function LevelTile({ n, stats, theme, onPress }) {
  const isUnlocked = n <= (stats.maxUnlockedLevel || 1);
  const isCompleted = (stats.completedLevels || []).includes(n);
  const isCurrent = n === (stats.maxUnlockedLevel || 1) && !isCompleted;
  const cfg = LEVEL_TABLE[n];
  const tierColor = colorFor(n, theme);
  const bestScore = Number((stats.levelHighScores || {})[n]) || 0;

  return (
    <TouchableOpacity
      activeOpacity={isUnlocked ? 0.85 : 1}
      onPress={onPress}
      disabled={!isUnlocked}
      style={[
        styles.tile,
        {
          backgroundColor: isUnlocked ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.6)',
          borderColor: isCompleted ? '#fbbf24' : isCurrent ? '#fbbf24' : isUnlocked ? '#fff' : '#334155',
          borderBottomColor: isCompleted ? '#78350f' : isUnlocked ? '#0f172a' : '#0a0f1a',
          shadowColor: isCompleted ? theme.gold : isUnlocked ? tierColor : 'transparent',
          shadowOpacity: isUnlocked ? 0.45 : 0,
        },
      ]}
    >
      {/* Top gradient highlight band */}
      {isUnlocked ? (
        <View style={[styles.tileGlow, { backgroundColor: `${tierColor}26` }]} />
      ) : null}

      {/* "CURRENT" or stars badges at top-right */}
      {isCompleted ? (
        <View style={[styles.completeBadge, { backgroundColor: theme.gold }]}>
          <Text style={styles.completeBadgeText}>★</Text>
        </View>
      ) : isCurrent ? (
        <View style={[styles.currentBadge, { borderColor: tierColor, backgroundColor: `${tierColor}22` }]}>
          <Text style={[styles.currentBadgeText, { color: tierColor }]}>NOW</Text>
        </View>
      ) : null}

      {/* Big level number */}
      <Text
        style={[
          styles.tileNum,
          { color: isUnlocked ? '#fff' : '#334155' },
        ]}
      >
        {n}
      </Text>

      {/* Lock / meta block */}
      {isUnlocked ? (
        <View style={styles.metaBox}>
          <Text style={[styles.tileMeta, { color: tierColor }]}>
            {cfg.gridSize}×{cfg.gridSize}
          </Text>
          <View style={styles.tileMetaRow}>
            <Text style={styles.tileWords}>🔤 {cfg.wordCount}</Text>
            <Text style={styles.tileWords}>⏱ {cfg.timeLimit}s</Text>
          </View>
          {bestScore > 0 ? (
            <Text style={[styles.bestScore, { color: theme.gold }]}>
              🏆 {bestScore.toLocaleString()}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.lockIconWrap, { borderColor: '#334155' }]}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.15 },
  scroll: { padding: 16, gap: 12 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlate: {
    flex: 1,
    backgroundColor: '#92400e',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  titlePlateBig: { color: '#fff', fontSize: 18, fontWeight: '900' },
  titlePlateSub: { color: '#fde68a', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginTop: -2 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  subtitle: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },

  progressCard: {
    borderRadius: 20, padding: 16,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 8, borderBottomColor: '#78350f',
    shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  progressValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  progressTrack: { height: 10, backgroundColor: '#0f172a', borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#475569' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressHint: { color: '#cbd5e1', fontSize: 11, marginTop: 6, fontWeight: '700' },

  flatGrid: { gap: 12, marginTop: 6 },
  gridRow: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1, aspectRatio: 1, borderWidth: 3, borderRadius: 20,
    borderBottomWidth: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 10, paddingBottom: 8,
    shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
    overflow: 'hidden',
  },
  tileGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: '55%',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
  },
  tileSpacer: { flex: 1 },
  completeBadge: {
    position: 'absolute', top: 6, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  completeBadgeText: { color: '#0f172a', fontWeight: '900', fontSize: 14 },
  currentBadge: {
    position: 'absolute', top: 6, left: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  currentBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  tileNum: { fontSize: 38, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  metaBox: { alignItems: 'center', marginTop: 2 },
  tileMeta: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  tileMetaRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  tileWords: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  bestScore: { fontSize: 10, fontWeight: '900', marginTop: 4, letterSpacing: 0.5 },
  lockIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.7)', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  lockIcon: { fontSize: 18, opacity: 0.6 },
});
