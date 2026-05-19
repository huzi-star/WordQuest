import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { generateLevel } from '../utils/api';
import { useTheme } from '../utils/theme';
import { useSettings } from '../utils/settings';
import { loadStats } from '../utils/storage';

// Daily challenge: locked, one round per day. The lock releases at the
// next local midnight so the player gets a fresh puzzle each calendar day.
const DAILY_GRID = 10;
const DAILY_WORDS = 10;
const DAILY_TIME = 100;
const DAILY_POINTS_PER_WORD = 500;

function nextMidnight(from = Date.now()) {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0); // next 00:00 local
  return d.getTime();
}
function isSameLocalDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatHMS(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function DailyChallengeScreen({ navigation }) {
  const theme = useTheme();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Re-check the lock every time the screen comes into focus.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const stats = await loadStats();
      const lastAttempt = stats.dailyChallengeLastAttemptAt || 0;
      // Locked until the next local midnight if attempted earlier today.
      const isLocked = lastAttempt && isSameLocalDay(lastAttempt, Date.now());
      const unlocksAt = isLocked ? nextMidnight(lastAttempt) : 0;
      if (cancelled) return;
      setLockedUntil(unlocksAt);

      if (isLocked) {
        setLoading(false);
        return;
      }

      // Not locked → load today's puzzle. Pass dailySeed at the ROOT so
      // backend's daily branch fires and forces 10×10 / 10 words / 100s.
      const res = await generateLevel(
        {
          roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0,
          currentStreak: 0, lastCategory: '',
        },
        {
          dailySeed: todayKey(),
          language: settings.language,
        },
      );
      if (!cancelled && res?.ok) setData(res);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [settings.language]));

  // Tick every second while locked to update the countdown display.
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // LOCKED STATE
  if (lockedUntil) {
    const remaining = Math.max(0, lockedUntil - now);
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={[styles.blob, { backgroundColor: theme.gold, top: -100, right: -80 }]} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.back, { borderColor: theme.border }]}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>🌟 Daily Challenge</Text>
              <Text style={[styles.subtitle, { color: theme.gold }]}>{dateLabel()}</Text>
            </View>
          </View>

          <View style={[styles.lockedCard, { backgroundColor: theme.card, borderColor: theme.gold, shadowColor: theme.gold }]}>
            <View style={[styles.lockCircle, { borderColor: theme.gold }]}>
              <Text style={styles.lockEmoji}>🔒</Text>
            </View>
            <Text style={[styles.lockTitle, { color: theme.gold }]}>CHALLENGE LOCKED</Text>
            <Text style={styles.lockSub}>
              You have already played today's challenge. A new puzzle will be available at midnight.
            </Text>

            <Text style={styles.countdownLabel}>UNLOCKS IN</Text>
            <Text style={[styles.countdown, { color: theme.gold }]}>{formatHMS(remaining)}</Text>

            <View style={styles.lockTipBox}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.tipText}>
                Meanwhile, try Quick Play, Levels, or Quiz Mode!
              </Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.playText, { color: '#cbd5e1' }]}>← BACK TO HOME</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.gold} />
        <Text style={[styles.loadText, { color: theme.gold }]}>Loading today's challenge...</Text>
      </SafeAreaView>
    );
  }

  // Defensive: if the level payload is missing essential fields, fall back
  // to the error state instead of crashing on first render.
  const level = data?.level;
  const hasValidLevel =
    level &&
    Array.isArray(level.grid) && level.grid.length > 0 &&
    Array.isArray(level.words) && level.words.length > 0;

  if (!data || !hasValidLevel) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={styles.errEmoji}>⚠️</Text>
        <Text style={styles.errText}>Daily challenge failed to load.</Text>
        <Text style={[styles.errText, { fontSize: 12, color: '#94a3b8', marginTop: 4 }]}>
          AI server slow. Tap retry, or check your internet.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.replace('DailyChallenge')}
            style={[styles.retryBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[styles.retryText, { color: theme.bg }]}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.retryBtn, { backgroundColor: 'rgba(148,163,184,0.1)', borderColor: theme.border, borderWidth: 1 }]}
          >
            <Text style={[styles.retryText, { color: '#cbd5e1' }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Force the daily-specific overrides.
  const difficulty = {
    difficulty: 'hard',
    timeLimit: DAILY_TIME,
    wordCount: DAILY_WORDS,
    gridSize: DAILY_GRID,
    reason: 'Daily Challenge — 10×10 elite mode',
    isDaily: true,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.gold, top: -100, right: -80 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.back, { borderColor: theme.border }]}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>🌟 Daily Challenge</Text>
            <Text style={[styles.subtitle, { color: theme.gold }]}>{dateLabel()}</Text>
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.gold, shadowColor: theme.gold }]}>
          <View style={[styles.starWrap, { borderColor: theme.gold, backgroundColor: `${theme.gold}26` }]}>
            <Text style={styles.bigStar}>🌟</Text>
          </View>
          <Text style={[styles.heroTitle, { color: theme.gold }]}>ELITE MODE · TODAY ONLY</Text>
          <Text style={styles.heroCategory}>{level.categoryEmoji} {level.category}</Text>

          <View style={styles.metaRow}>
            <View style={[styles.metaTile, { borderColor: theme.border }]}>
              <Text style={styles.metaIcon}>⏱</Text>
              <Text style={styles.metaValue}>{DAILY_TIME}s</Text>
            </View>
            <View style={[styles.metaTile, { borderColor: theme.border }]}>
              <Text style={styles.metaIcon}>🔤</Text>
              <Text style={styles.metaValue}>{DAILY_WORDS}</Text>
            </View>
            <View style={[styles.metaTile, { borderColor: theme.border }]}>
              <Text style={styles.metaIcon}>🎮</Text>
              <Text style={styles.metaValue}>{DAILY_GRID}×{DAILY_GRID}</Text>
            </View>
          </View>

          <View style={[styles.rewardBox, { borderColor: theme.gold }]}>
            <Text style={[styles.rewardLabel, { color: theme.gold }]}>REWARD</Text>
            <Text style={styles.rewardValue}>
              {DAILY_POINTS_PER_WORD} pts × {DAILY_WORDS} words = {DAILY_POINTS_PER_WORD * DAILY_WORDS}
            </Text>
          </View>

          <Text style={[styles.note, { color: theme.gold }]}>
            One attempt only. Incomplete = 0 points & level failed.
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipIcon}>⚠️</Text>
          <Text style={styles.tipText}>
            After this attempt, Daily Challenge locks until midnight — a fresh puzzle drops at 00:00 every day.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: theme.gold, shadowColor: theme.gold }]}
          activeOpacity={0.9}
          onPress={() =>
            navigation.replace('Game', {
              playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
              sessionStats: {
                score: 0, round: 1, streak: 0, badges: [], history: [],
                highScore: 0, bestStreak: 0, isDaily: true,
              },
              difficulty,
              level,
              isDaily: true,
              dailyPointsPerWord: DAILY_POINTS_PER_WORD,
            })
          }
        >
          <Text style={[styles.playText, { color: '#0f172a' }]}>▶ START CHALLENGE</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText: { fontWeight: '700' },
  errText: { color: '#ef4444', textAlign: 'center', fontWeight: '700' },
  errEmoji: { fontSize: 60 },
  retryBtn: { padding: 12, borderRadius: 12, marginTop: 14 },
  retryText: { fontWeight: '900' },

  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.13 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { fontSize: 12, fontWeight: '700' },

  // Hero (unlocked) card
  heroCard: {
    borderRadius: 22, padding: 22,
    borderWidth: 2, alignItems: 'center',
    shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  starWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  bigStar: { fontSize: 60 },
  heroTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  heroCategory: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 6, textAlign: 'center' },

  metaRow: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  metaTile: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  metaIcon: { fontSize: 18 },
  metaValue: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 4 },

  rewardBox: {
    marginTop: 14, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderRadius: 12,
    alignItems: 'center', width: '100%',
  },
  rewardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  rewardValue: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 2 },

  note: { fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'center' },

  tipBox: { flexDirection: 'row', backgroundColor: 'rgba(252,211,77,0.08)', borderRadius: 14, padding: 14, gap: 10, marginTop: 14, borderWidth: 1, borderColor: 'rgba(252,211,77,0.3)' },
  tipIcon: { fontSize: 18 },
  tipText: { color: '#fef3c7', fontSize: 12, flex: 1, lineHeight: 18 },

  // Locked state card
  lockedCard: {
    borderRadius: 22, padding: 22,
    borderWidth: 2, alignItems: 'center',
    shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  lockCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: 'rgba(252,211,77,0.12)' },
  lockEmoji: { fontSize: 50 },
  lockTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  lockSub: { color: '#cbd5e1', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 19 },
  countdownLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 16 },
  countdown: { fontSize: 38, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  lockTipBox: { flexDirection: 'row', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14, padding: 12, gap: 10, marginTop: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', alignItems: 'center' },

  playBtn: {
    borderRadius: 20, paddingVertical: 18, alignItems: 'center',
    shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  playText: { fontSize: 17, fontWeight: '900', letterSpacing: 2 },
});
