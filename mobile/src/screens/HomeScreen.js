import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadStats } from '../utils/storage';
import { useSettings } from '../utils/settings';
import { useTheme } from '../utils/theme';
import AnimatedNumber from '../components/AnimatedNumber';

const TOTAL_LEVELS = 15;

export default function HomeScreen({ navigation }) {
  const { t } = useSettings();
  const theme = useTheme();
  const [stats, setStats] = useState({
    highScore: 0, bestStreak: 0,
    totalRoundsPlayed: 0, perfectRounds: 0,
    maxUnlockedLevel: 1, completedLevels: [],
  });

  const logoScale = useRef(new Animated.Value(0.6)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
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
          maxUnlockedLevel: s.maxUnlockedLevel || 1,
          completedLevels: s.completedLevels || [],
        });
      })();
      return () => { cancelled = true; };
    }, [])
  );

  function startAdaptive() {
    navigation.navigate('Category', {
      playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
      sessionStats: { score: 0, round: 1, streak: 0, badges: [], history: [], highScore: stats.highScore, bestStreak: stats.bestStreak },
    });
  }

  function startLevel(n) {
    if (n > stats.maxUnlockedLevel) return;
    navigation.navigate('Category', {
      playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
      sessionStats: { score: 0, round: 1, streak: 0, badges: [], history: [], highScore: stats.highScore, bestStreak: stats.bestStreak, levelNumber: n },
      levelNumber: n,
    });
  }

  const accent = theme.accent;
  const gold = theme.gold;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: accent, top: -120, right: -100, opacity: 0.18 }]} />
      <View style={[styles.blob, { backgroundColor: theme.accent2, bottom: -140, left: -120, opacity: 0.16 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <Animated.View style={[styles.heroWrap, { opacity: fadeIn }]}>
            <Animated.View style={[styles.logoCircle, { transform: [{ scale: logoScale }], borderColor: accent, shadowColor: accent }]}>
              <Animated.Image source={require('../../app-logo.jpeg')} style={[styles.logo, { transform: [{ scale: pulse }] }]} />
            </Animated.View>
            <Text style={styles.brand}>WordQuest</Text>
            <View style={[styles.tagPill, { borderColor: accent, backgroundColor: `${accent}1a` }]}>
              <Text style={[styles.tag, { color: accent }]}>{t('brand_tag')}</Text>
            </View>
          </Animated.View>

          {/* Top stats */}
          <Animated.View style={[styles.statsRow, { opacity: fadeIn }]}>
            <View style={[styles.statCard, { borderColor: accent, shadowColor: accent, backgroundColor: theme.card }]}>
              <Text style={styles.statIcon}>🏆</Text>
              <Text style={styles.statLabel}>{t('high_score')}</Text>
              <AnimatedNumber value={stats.highScore} style={[styles.statValue, { color: accent }]} />
            </View>
            <View style={[styles.statCard, { borderColor: '#f97316', shadowColor: '#f97316', backgroundColor: theme.card }]}>
              <Text style={styles.statIcon}>🔥</Text>
              <Text style={styles.statLabel}>{t('best_streak')}</Text>
              <AnimatedNumber value={stats.bestStreak} style={[styles.statValue, { color: '#f97316' }]} />
            </View>
          </Animated.View>

          {/* Levels card */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Levels')}
            style={[styles.levelsCard, { backgroundColor: theme.card, borderColor: accent, shadowColor: accent }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelsCardTitle, { color: accent }]}>{t('levels_title')}</Text>
              <Text style={styles.levelsCardSub}>{t('levels_sub')}</Text>
              <Text style={styles.levelsCardMeta}>
                {stats.maxUnlockedLevel} / {TOTAL_LEVELS} unlocked · {stats.completedLevels.length} completed
              </Text>
            </View>
            <View style={[styles.levelsCardBadge, { backgroundColor: accent }]}>
              <Text style={[styles.levelsCardBadgeText, { color: theme.bg }]}>1-15</Text>
            </View>
          </TouchableOpacity>

          {/* Primary actions */}
          <View style={styles.actionsWrap}>
            <TouchableOpacity activeOpacity={0.9} onPress={startAdaptive} style={[styles.playBtn, { backgroundColor: accent, shadowColor: accent }]}>
              <Text style={[styles.playArrow, { color: theme.bg }]}>▶</Text>
              <Text style={[styles.playText, { color: theme.bg }]}>{t('play_game')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('DailyChallenge')}
              style={[styles.dailyBtn, { borderColor: gold, shadowColor: gold, backgroundColor: theme.card }]}
            >
              <Text style={[styles.dailyText, { color: gold }]}>🌟 {t('daily_challenge')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Quiz')}
              style={[styles.dailyBtn, { borderColor: theme.accent2, shadowColor: theme.accent2, backgroundColor: theme.card }]}
            >
              <Text style={[styles.dailyText, { color: theme.accent2 }]}>❓ {t('quiz_mode')}</Text>
            </TouchableOpacity>

            <View style={styles.miniBtnRow}>
              <TouchableOpacity style={[styles.miniBtn, { borderColor: theme.border }]} activeOpacity={0.85} onPress={() => navigation.navigate('Stats')}>
                <Text style={styles.miniBtnText}>📊 {t('stats')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtn, { borderColor: theme.border }]} activeOpacity={0.85} onPress={() => navigation.navigate('Settings')}>
                <Text style={styles.miniBtnText}>⚙ {t('settings_btn')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Powered by Google Gemini · Antigravity #AISeekho2026</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  scroll: { paddingHorizontal: 16, paddingBottom: 30 },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },

  heroWrap: { alignItems: 'center', marginTop: 18 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
    elevation: 10, overflow: 'hidden',
  },
  logo: { width: 88, height: 88, borderRadius: 44 },
  brand: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 8, letterSpacing: 0.5 },
  tagPill: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  tag: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statCard: {
    flex: 1, padding: 14, borderRadius: 16,
    alignItems: 'center', borderWidth: 1,
    shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  statIcon: { fontSize: 22 },
  statLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  statValue: { fontSize: 24, fontWeight: '900', marginTop: 2 },

  levelsCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 18, borderWidth: 1,
    marginTop: 14,
    shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  levelsCardTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  levelsCardSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  levelsCardMeta: { color: '#cbd5e1', fontSize: 11, marginTop: 6, fontWeight: '700' },
  levelsCardBadge: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  levelsCardBadgeText: { fontWeight: '900', fontSize: 16, letterSpacing: 1 },

  actionsWrap: { gap: 10, marginTop: 18 },
  playBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, borderRadius: 20,
    shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  playArrow: { fontSize: 17 },
  playText: { fontSize: 17, fontWeight: '900', letterSpacing: 1.5 },
  dailyBtn: {
    paddingVertical: 14, borderRadius: 18, alignItems: 'center', borderWidth: 1,
    shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  dailyText: { fontSize: 15, fontWeight: '800' },
  miniBtnRow: { flexDirection: 'row', gap: 10 },
  miniBtn: { flex: 1, backgroundColor: 'rgba(148,163,184,0.08)', borderWidth: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  miniBtnText: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },

  footer: { alignItems: 'center', paddingTop: 20 },
  footerText: { color: '#475569', fontSize: 10, letterSpacing: 0.5 },
});
