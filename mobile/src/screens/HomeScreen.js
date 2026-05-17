import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadStats } from '../utils/storage';

const INITIAL_STATS = {
  roundsPlayed: 0,
  avgWordsFound: 0,
  avgTimeLeft: 0,
  currentStreak: 0,
  lastCategory: '',
};

export default function HomeScreen({ navigation }) {
  const [stats, setStats] = useState({
    highScore: 0,
    bestStreak: 0,
    totalRoundsPlayed: 0,
    perfectRounds: 0,
  });

  // Logo entry animation.
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
        });
      })();
      return () => { cancelled = true; };
    }, [])
  );

  function startGame() {
    navigation.navigate('Category', {
      playerStats: INITIAL_STATS,
      sessionStats: {
        score: 0, round: 1, streak: 0, badges: [], history: [],
        highScore: stats.highScore, bestStreak: stats.bestStreak,
      },
    });
  }

  return (
    <View style={styles.container}>
      {/* Decorative glow blobs */}
      <View style={[styles.blob, styles.blobTopRight]} />
      <View style={[styles.blob, styles.blobBottomLeft]} />

      <SafeAreaView style={{ flex: 1 }}>
        <Animated.View style={[styles.heroWrap, { opacity: fadeIn }]}>
          <Animated.View style={[styles.logoCircle, { transform: [{ scale: logoScale }] }]}>
            <Animated.Image
              source={require('../../app-logo.jpeg')}
              style={[styles.logo, { transform: [{ scale: pulse }] }]}
            />
          </Animated.View>
          <Text style={styles.brand}>WordQuest</Text>
          <View style={styles.tagPill}>
            <Text style={styles.tag}>AI POWERED · PAKISTAN THEMED</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.statsRow, { opacity: fadeIn }]}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🏆</Text>
            <Text style={styles.statLabel}>HIGH SCORE</Text>
            <Text style={styles.statValue}>{stats.highScore}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardOrange]}>
            <Text style={styles.statIcon}>🔥</Text>
            <Text style={styles.statLabel}>BEST STREAK</Text>
            <Text style={[styles.statValue, { color: '#f97316' }]}>{stats.bestStreak}</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.miniRow, { opacity: fadeIn }]}>
          <View style={styles.miniTile}>
            <Text style={styles.miniLabel}>Rounds</Text>
            <Text style={styles.miniValue}>{stats.totalRoundsPlayed}</Text>
          </View>
          <View style={styles.miniDivider} />
          <View style={styles.miniTile}>
            <Text style={styles.miniLabel}>Perfect</Text>
            <Text style={styles.miniValue}>{stats.perfectRounds}</Text>
          </View>
          <View style={styles.miniDivider} />
          <View style={styles.miniTile}>
            <Text style={styles.miniLabel}>Agents</Text>
            <Text style={[styles.miniValue, { color: '#a78bfa' }]}>8</Text>
          </View>
        </Animated.View>

        <View style={styles.actionsWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={startGame} style={styles.playBtn}>
            <View style={styles.playBtnInner}>
              <Text style={styles.playArrow}>▶</Text>
              <Text style={styles.playText}>PLAY GAME</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Stats')}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryEmoji}>📊</Text>
            <Text style={styles.secondaryText}>My Stats Dashboard</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by Google Gemini · Antigravity #AISeekho2026</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14', overflow: 'hidden' },
  blob: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.18,
  },
  blobTopRight: { backgroundColor: '#22c55e', top: -120, right: -100 },
  blobBottomLeft: { backgroundColor: '#a78bfa', bottom: -140, left: -120 },

  heroWrap: { alignItems: 'center', marginTop: 28, paddingHorizontal: 20 },
  logoCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#22c55e',
    shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
    elevation: 14,
    overflow: 'hidden',
  },
  logo: { width: 100, height: 100, borderRadius: 50 },
  brand: { color: '#fff', fontSize: 36, fontWeight: '900', marginTop: 14, letterSpacing: 1 },
  tagPill: {
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  tag: { color: '#86efac', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },

  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 26 },
  statCard: {
    flex: 1,
    backgroundColor: '#0e1726',
    padding: 16, borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#22c55e',
    shadowColor: '#22c55e', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  statCardOrange: { borderColor: '#f97316', shadowColor: '#f97316' },
  statIcon: { fontSize: 26 },
  statLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '700', marginTop: 4, letterSpacing: 1 },
  statValue: { color: '#22c55e', fontSize: 28, fontWeight: '900', marginTop: 4 },

  miniRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 12,
    backgroundColor: '#0e1726', borderRadius: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: '#1f2937',
  },
  miniTile: { flex: 1, alignItems: 'center' },
  miniLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  miniValue: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 2 },
  miniDivider: { width: 1, height: 24, backgroundColor: '#1f2937' },

  actionsWrap: { paddingHorizontal: 20, marginTop: 'auto', marginBottom: 16, gap: 12 },
  playBtn: {
    backgroundColor: '#22c55e', borderRadius: 22,
    shadowColor: '#22c55e', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  playBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
  playArrow: { color: '#0f172a', fontSize: 18 },
  playText: { color: '#0f172a', fontSize: 18, fontWeight: '900', letterSpacing: 2 },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 18,
    paddingVertical: 14, gap: 10,
    borderWidth: 1, borderColor: '#22c55e',
  },
  secondaryEmoji: { fontSize: 18 },
  secondaryText: { color: '#22c55e', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  footer: { alignItems: 'center', paddingBottom: 10, paddingHorizontal: 20 },
  footerText: { color: '#475569', fontSize: 10, letterSpacing: 0.5 },
});
