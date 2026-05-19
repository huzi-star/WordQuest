import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadStats } from '../utils/storage';
import { useSettings } from '../utils/settings';
import { useTheme } from '../utils/theme';
import { useAuth } from '../utils/auth';
import AnimatedNumber from '../components/AnimatedNumber';

const TOTAL_LEVELS = 15;

export default function HomeScreen({ navigation }) {
  const { t } = useSettings();
  const theme = useTheme();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    highScore: 0, bestStreak: 0,
    totalRoundsPlayed: 0, perfectRounds: 0,
    totalScoreEver: 0,
    maxUnlockedLevel: 1, completedLevels: [],
  });

  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.8)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadStats();
        if (cancelled) return;
        setStats({
          highScore: s.highScore || 0,
          bestStreak: s.bestStreak || 0,
          totalRoundsPlayed: s.totalRoundsPlayed || 0,
          perfectRounds: s.perfectRounds || 0,
          totalScoreEver: s.totalScoreEver || 0,
          maxUnlockedLevel: s.maxUnlockedLevel || 1,
          completedLevels: s.completedLevels || [],
          lastAdaptiveStats: s.lastAdaptiveStats || null,
        });
      })();
      return () => { cancelled = true; };
    }, []),
  );

  function startAdaptive() {
    // Resume from where the player left off if any adaptive state exists.
    const resumed = stats.lastAdaptiveStats || {
      roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '',
    };
    navigation.navigate('Category', {
      playerStats: resumed,
      sessionStats: {
        score: 0, round: 1, streak: 0, badges: [], history: [],
        highScore: stats.highScore, bestStreak: stats.bestStreak,
      },
    });
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Player';
  const accent = theme.accent;
  const gold = theme.gold;
  const completedCount = stats.completedLevels.length;
  const progressPct = Math.round((completedCount / TOTAL_LEVELS) * 100);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: accent, top: -140, right: -120 }]} />
      <View style={[styles.blob, { backgroundColor: theme.accent2, bottom: -160, left: -120, opacity: 0.13 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarCircle, { borderColor: accent }]}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.helloLabel}>WELCOME</Text>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
            </View>
          </View>
          <View style={styles.iconRow}>
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: theme.accent, backgroundColor: `${theme.accent}1f` }]}
              onPress={() => navigation.navigate('Stats')}
              activeOpacity={0.7}
            >
              <Text style={[styles.iconText, { color: theme.accent }]}>📊</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: theme.accent, backgroundColor: `${theme.accent}1f` }]}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.7}
            >
              <Text style={[styles.iconText, { color: theme.accent }]}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* HERO */}
          <Animated.View style={[styles.hero, { opacity: fadeIn, transform: [{ scale: heroScale }] }]}>
            <Animated.View
              style={[
                styles.logoCircle,
                { borderColor: accent, shadowColor: accent, transform: [{ scale: pulse }] },
              ]}
            >
              <Image source={require('../../app-logo.jpeg')} style={styles.logo} />
            </Animated.View>
            <Text style={styles.brand}>WordQuest</Text>
            <View style={[styles.tagPill, { borderColor: accent, backgroundColor: `${accent}1a` }]}>
              <Text style={[styles.tag, { color: accent }]}>AI-POWERED · WORLD THEMED</Text>
            </View>
          </Animated.View>

          {/* SCORE BANNER */}
          <Animated.View
            style={[
              styles.scoreBanner,
              { backgroundColor: theme.card, borderColor: accent, shadowColor: accent, opacity: fadeIn },
            ]}
          >
            <View style={styles.scoreCol}>
              <Text style={styles.scoreLabel}>🏆 HIGH SCORE</Text>
              <AnimatedNumber value={stats.highScore} style={[styles.scoreValue, { color: accent }]} />
            </View>
            <View style={styles.scoreDivider} />
            <View style={styles.scoreCol}>
              <Text style={styles.scoreLabel}>🔥 STREAK</Text>
              <AnimatedNumber value={stats.bestStreak} style={[styles.scoreValue, { color: '#f97316' }]} />
            </View>
            <View style={styles.scoreDivider} />
            <View style={styles.scoreCol}>
              <Text style={styles.scoreLabel}>🎯 PERFECT</Text>
              <AnimatedNumber value={stats.perfectRounds} style={[styles.scoreValue, { color: '#a78bfa' }]} />
            </View>
          </Animated.View>

          {/* HERO CTA */}
          <Animated.View style={{ opacity: fadeIn }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={startAdaptive}
              style={[styles.playBtn, { backgroundColor: accent, shadowColor: accent }]}
            >
              <View>
                <Text style={[styles.playLabel, { color: theme.bg }]}>QUICK PLAY</Text>
                <Text style={[styles.playSubLabel, { color: theme.bg }]}>AI adaptive difficulty</Text>
              </View>
              <View style={[styles.playArrow, { backgroundColor: theme.bg }]}>
                <Text style={[styles.playArrowText, { color: accent }]}>▶</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* GAME MODES TITLE */}
          <Text style={styles.sectionLabel}>GAME MODES</Text>

          {/* LEVELS CARD */}
          <Animated.View style={{ opacity: fadeIn }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('Levels')}
              style={[styles.modeCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={[styles.modeIcon, { backgroundColor: `${accent}22`, borderColor: accent }]}>
                <Text style={styles.modeEmoji}>🏆</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Levels</Text>
                <Text style={styles.modeSub}>Progress through 15 AI-crafted stages</Text>
                <View style={styles.miniProgressTrack}>
                  <View
                    style={[
                      styles.miniProgressFill,
                      { width: `${progressPct}%`, backgroundColor: accent },
                    ]}
                  />
                </View>
                <Text style={styles.modeMeta}>
                  {completedCount} / {TOTAL_LEVELS} completed · Level {stats.maxUnlockedLevel} unlocked
                </Text>
              </View>
              <Text style={[styles.modeArrow, { color: accent }]}>→</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* DAILY + QUIZ ROW */}
          <Animated.View style={[styles.modeRow, { opacity: fadeIn }]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('DailyChallenge')}
              style={[styles.modeCardSmall, { backgroundColor: theme.card, borderColor: gold, shadowColor: gold }]}
            >
              <Text style={styles.smallEmoji}>🌟</Text>
              <Text style={[styles.smallTitle, { color: gold }]}>Daily</Text>
              <Text style={styles.smallSub}>New puzzle today</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('Quiz')}
              style={[styles.modeCardSmall, { backgroundColor: theme.card, borderColor: theme.accent2, shadowColor: theme.accent2 }]}
            >
              <Text style={styles.smallEmoji}>❓</Text>
              <Text style={[styles.smallTitle, { color: theme.accent2 }]}>Quiz</Text>
              <Text style={styles.smallSub}>8 AI questions</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* AGENTS FOOTER CARD */}
          <Animated.View
            style={[
              styles.agentsCard,
              { backgroundColor: theme.card, borderColor: theme.border, opacity: fadeIn },
            ]}
          >
            <View style={styles.agentsRow}>
              <View style={[styles.agentDot, { backgroundColor: accent }]} />
              <View style={[styles.agentDot, { backgroundColor: gold }]} />
              <View style={[styles.agentDot, { backgroundColor: theme.accent2 }]} />
              <View style={[styles.agentDot, { backgroundColor: '#f97316' }]} />
              <View style={[styles.agentDot, { backgroundColor: '#22c55e' }]} />
              <View style={[styles.agentDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.agentsTitle}>9 AI Agents</Text>
            </View>
            <Text style={styles.agentsBody}>
              Difficulty · Generator · Referee · Reward · Tutor · Commentator · Coach · Chaalbaaz · Quiz
            </Text>
          </Animated.View>

          <Text style={styles.footerText}>Powered by Google Gemini · Antigravity #AISeekho2026</Text>
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 360, height: 360, borderRadius: 180, opacity: 0.16 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4,
  },
  avatarWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 12 },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, backgroundColor: '#0b1220',
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  helloLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  iconRow: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 20, fontWeight: '900' },

  scroll: { paddingHorizontal: 16, paddingTop: 6 },

  // Hero
  hero: { alignItems: 'center', marginTop: 6, marginBottom: 14 },
  logoCircle: {
    width: 110, height: 110, borderRadius: 55,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0b1220', borderWidth: 2,
    shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
    elevation: 14, overflow: 'hidden',
  },
  logo: { width: 98, height: 98, borderRadius: 49 },
  brand: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 10, letterSpacing: 0.5 },
  tagPill: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  tag: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },

  // Score banner
  scoreBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    padding: 14, borderRadius: 20, borderWidth: 1,
    shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    marginBottom: 14,
  },
  scoreCol: { alignItems: 'center', flex: 1 },
  scoreLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
  scoreValue: { fontSize: 22, fontWeight: '900' },
  scoreDivider: { width: 1, height: 30, backgroundColor: '#1f2937' },

  // Primary play button
  playBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderRadius: 22,
    shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  playLabel: { fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },
  playSubLabel: { fontSize: 11, opacity: 0.7, marginTop: 2, fontWeight: '600' },
  playArrow: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  playArrowText: { fontSize: 18, fontWeight: '900' },

  sectionLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 18, marginBottom: 8 },

  // Levels card (wide)
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18, borderWidth: 1,
  },
  modeIcon: {
    width: 50, height: 50, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  modeEmoji: { fontSize: 26 },
  modeTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modeSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  miniProgressTrack: { height: 5, backgroundColor: '#0f172a', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  miniProgressFill: { height: 5, borderRadius: 3 },
  modeMeta: { color: '#cbd5e1', fontSize: 10, fontWeight: '700', marginTop: 4 },
  modeArrow: { fontSize: 22, fontWeight: '900' },

  // Daily + Quiz row
  modeRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modeCardSmall: {
    flex: 1, padding: 14, borderRadius: 18, borderWidth: 1,
    shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  smallEmoji: { fontSize: 28 },
  smallTitle: { fontSize: 17, fontWeight: '900', marginTop: 6 },
  smallSub: { color: '#94a3b8', fontSize: 11, marginTop: 2, fontWeight: '600' },

  // Agents
  agentsCard: {
    marginTop: 14, padding: 14, borderRadius: 18, borderWidth: 1,
  },
  agentsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agentDot: { width: 10, height: 10, borderRadius: 5 },
  agentsTitle: { color: '#fff', fontSize: 13, fontWeight: '900', marginLeft: 6 },
  agentsBody: { color: '#94a3b8', fontSize: 11, marginTop: 6, lineHeight: 16 },

  footerText: { color: '#475569', fontSize: 10, textAlign: 'center', marginTop: 16, letterSpacing: 0.5 },
});
