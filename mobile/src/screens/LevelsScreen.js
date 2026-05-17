import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadStats } from '../utils/storage';
import { useSettings } from '../utils/settings';
import { useTheme } from '../utils/theme';

const TOTAL_LEVELS = 15;

function tierFor(n) {
  if (n <= 5) return { name: 'EASY', size: '6×6', words: 3 + Math.min(2, n - 1) };
  if (n <= 10) return { name: 'MEDIUM', size: '8×8', words: 5 + Math.min(2, n - 6) };
  return { name: 'HARD', size: '10×10', words: 7 + Math.min(2, n - 11) };
}

export default function LevelsScreen({ navigation }) {
  const { t } = useSettings();
  const theme = useTheme();
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
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    );
  }

  const maxUnlocked = stats.maxUnlockedLevel || 1;
  const completed = new Set(stats.completedLevels || []);
  const progress = Math.round((completed.size / TOTAL_LEVELS) * 100);

  function startLevel(n) {
    if (n > maxUnlocked) return;
    navigation.navigate('Category', {
      playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
      sessionStats: {
        score: 0, round: 1, streak: 0, badges: [], history: [],
        highScore: stats.highScore, bestStreak: stats.bestStreak, levelNumber: n,
      },
      levelNumber: n,
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100 }]} />
      <View style={[styles.blob, { backgroundColor: theme.accent2, bottom: -140, left: -100, opacity: 0.13 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>🏆 {t('levels_title')}</Text>
              <Text style={styles.subtitle}>{t('levels_sub')}</Text>
            </View>
          </View>

          {/* Progress card */}
          <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.accent }]}>
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

          {/* Section labels */}
          <Text style={styles.sectionTitle}>🟢 EASY · Levels 1-5</Text>
          <View style={styles.gridRow}>
            {[1, 2, 3, 4, 5].map((n) => <LevelTile key={n} n={n} stats={stats} theme={theme} onPress={() => startLevel(n)} />)}
          </View>

          <Text style={styles.sectionTitle}>🟡 MEDIUM · Levels 6-10</Text>
          <View style={styles.gridRow}>
            {[6, 7, 8, 9, 10].map((n) => <LevelTile key={n} n={n} stats={stats} theme={theme} onPress={() => startLevel(n)} />)}
          </View>

          <Text style={styles.sectionTitle}>🔴 HARD · Levels 11-15</Text>
          <View style={styles.gridRow}>
            {[11, 12, 13, 14, 15].map((n) => <LevelTile key={n} n={n} stats={stats} theme={theme} onPress={() => startLevel(n)} />)}
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function LevelTile({ n, stats, theme, onPress }) {
  const isUnlocked = n <= (stats.maxUnlockedLevel || 1);
  const isCompleted = (stats.completedLevels || []).includes(n);
  const tier = tierFor(n);
  const tierColor = n <= 5 ? theme.accent : n <= 10 ? theme.gold : '#ef4444';
  return (
    <TouchableOpacity
      activeOpacity={isUnlocked ? 0.85 : 1}
      onPress={onPress}
      disabled={!isUnlocked}
      style={[
        styles.tile,
        {
          backgroundColor: isUnlocked ? theme.card : 'rgba(15,23,42,0.6)',
          borderColor: isCompleted ? theme.gold : isUnlocked ? tierColor : theme.border,
          shadowColor: isCompleted ? theme.gold : isUnlocked ? tierColor : 'transparent',
          shadowOpacity: isUnlocked ? 0.35 : 0,
        },
      ]}
    >
      {isCompleted ? <Text style={[styles.tileStar, { color: theme.gold }]}>★</Text> : null}
      <Text style={[styles.tileNum, { color: isUnlocked ? '#fff' : '#475569' }]}>{n}</Text>
      <Text style={[styles.tileMeta, { color: isUnlocked ? tierColor : '#475569' }]}>
        {isUnlocked ? tier.size : '🔒'}
      </Text>
      {isUnlocked ? <Text style={styles.tileWords}>{tier.words}w</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.15 },
  scroll: { padding: 16, gap: 10 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1f2937' },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  progressCard: {
    borderWidth: 1, borderRadius: 18, padding: 16,
    shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  progressValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  progressTrack: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressHint: { color: '#94a3b8', fontSize: 11, marginTop: 4 },

  sectionTitle: { color: '#cbd5e1', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginTop: 14, marginBottom: 6 },
  gridRow: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, aspectRatio: 1, borderWidth: 1, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  tileStar: { position: 'absolute', top: 4, right: 6, fontSize: 14 },
  tileNum: { fontSize: 22, fontWeight: '900' },
  tileMeta: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
  tileWords: { color: '#64748b', fontSize: 8, fontWeight: '700', marginTop: 1 },
});
