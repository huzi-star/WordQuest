import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { roundComplete } from '../utils/api';
import { saveStats, logRound } from '../utils/storage';

export default function RoundCompleteScreen({ navigation, route }) {
  const { playerStats, sessionStats, roundResult, level } = route.params;
  const [loading, setLoading] = useState(true);
  const [reward, setReward] = useState(null);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.7)).current;
  const scoreFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.sequence([
        Animated.timing(scoreFlash, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(scoreFlash, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();

    (async () => {
      const res = await roundComplete({
        wordsFound: roundResult.wordsFound,
        totalWords: roundResult.totalWords,
        timeLeft: roundResult.timeLeft,
        score: roundResult.roundScore,
        roundNumber: roundResult.roundNumber,
        streak: roundResult.streak,
      });
      if (res?.ok) {
        setReward(res.result);
        const allBadges = [...(sessionStats.badges || []), ...(res.result.badges || [])];
        sessionStats.badges = allBadges;
      }
      await saveStats({
        highScore: sessionStats.score,
        bestStreak: Math.max(sessionStats.bestStreak || 0, sessionStats.streak || 0),
      });
      await logRound({
        category: roundResult.category || '',
        wordsFound: roundResult.wordsFound,
        totalWords: roundResult.totalWords,
        timeSpent: roundResult.timeSpent || 0,
        roundScore: roundResult.roundScore || 0,
        perfect: roundResult.wordsFound === roundResult.totalWords,
        hintsUsed: roundResult.hintsUsed || 0,
      });
      setLoading(false);
    })();
  }, []);

  const { wordsFound, totalWords, timeLeft, roundScore } = roundResult;
  const ratio = totalWords > 0 ? wordsFound / totalWords : 0;
  const isPerfect = ratio === 1;
  const heroEmoji = isPerfect ? '🎉' : ratio >= 0.5 ? '✨' : '💪';
  const heroTitle = isPerfect ? 'PERFECT ROUND!' : ratio >= 0.5 ? 'NICE WORK!' : 'KEEP GOING!';
  const heroSub = isPerfect ? 'Sab words mil gaye 🇵🇰' : ratio >= 0.5 ? 'Aadha kaam ho gaya' : 'Agla round better hoga';
  const accent = isPerfect ? '#22c55e' : ratio >= 0.5 ? '#fcd34d' : '#fb923c';

  return (
    <View style={styles.container}>
      <View style={[styles.blob, { backgroundColor: accent, top: -100, right: -80 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <Animated.View style={[styles.hero, { opacity: fadeIn, transform: [{ scale: heroScale }] }]}>
            <View style={[styles.heroCircle, { borderColor: accent, shadowColor: accent }]}>
              <Text style={styles.heroEmoji}>{heroEmoji}</Text>
            </View>
            <Text style={[styles.heroTitle, { color: accent }]}>{heroTitle}</Text>
            <Text style={styles.heroSub}>{heroSub}</Text>
            <Animated.Text
              style={[
                styles.heroScore,
                {
                  color: accent,
                  transform: [
                    {
                      scale: scoreFlash.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.18],
                      }),
                    },
                  ],
                },
              ]}
            >
              +{roundScore}
            </Animated.Text>
            <Text style={styles.heroScoreLabel}>points earned</Text>
          </Animated.View>

          {/* Stat tiles */}
          <Animated.View style={[styles.statsRow, { opacity: fadeIn }]}>
            <View style={styles.statTile}>
              <Text style={styles.statEmoji}>🔤</Text>
              <Text style={styles.statValue}>{wordsFound}/{totalWords}</Text>
              <Text style={styles.statLabel}>WORDS</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statEmoji}>⏱</Text>
              <Text style={styles.statValue}>{timeLeft}s</Text>
              <Text style={styles.statLabel}>TIME LEFT</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statEmoji}>💰</Text>
              <Text style={styles.statValue}>{sessionStats.score}</Text>
              <Text style={styles.statLabel}>TOTAL</Text>
            </View>
          </Animated.View>

          {/* AI analysis loading or content */}
          {loading ? (
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator color="#22c55e" />
              <Text style={styles.loadingText}>AI agent analysis...</Text>
            </View>
          ) : (
            <>
              {/* Badges */}
              {reward?.badges?.length ? (
                <View style={[styles.card, styles.badgeCard]}>
                  <Text style={styles.sectionTitle}>🏅 BADGES EARNED</Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {reward.badges.map((b) => (
                      <View key={b.id} style={styles.badgeItem}>
                        <Text style={styles.badgeName}>{b.name}</Text>
                        <Text style={styles.badgeMsg}>{b.message}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Encouragement */}
              {reward?.encouragement ? (
                <View style={[styles.card, styles.encourageCard]}>
                  <Text style={styles.encourageText}>{reward.encouragement}</Text>
                </View>
              ) : null}

              {/* AI Preview */}
              {reward?.nextRoundPreview ? (
                <View style={[styles.card, styles.aiCard]}>
                  <View style={styles.aiHeader}>
                    <Text style={styles.aiAvatar}>🤖</Text>
                    <Text style={styles.aiLabel}>AI AGENT · Next Round</Text>
                  </View>
                  <Text style={styles.aiText}>{reward.nextRoundPreview}</Text>
                </View>
              ) : null}
            </>
          )}

          <View style={{ height: 20 }} />

          {/* CTAs */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryBtn, { shadowColor: accent }]}
            onPress={() => navigation.replace('Category', { playerStats, sessionStats })}
          >
            <Text style={styles.primaryArrow}>▶</Text>
            <Text style={styles.primaryText}>NEXT ROUND</Text>
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.replace('Home')}
            >
              <Text style={styles.secondaryText}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Stats')}
            >
              <Text style={styles.secondaryText}>📊 Stats</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14', overflow: 'hidden' },
  blob: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.15 },
  scroll: { padding: 18, gap: 12 },

  hero: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  heroCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  heroEmoji: { fontSize: 64 },
  heroTitle: { fontSize: 26, fontWeight: '900', marginTop: 12, letterSpacing: 1 },
  heroSub: { color: '#94a3b8', marginTop: 4 },
  heroScore: { fontSize: 54, fontWeight: '900', marginTop: 12 },
  heroScoreLabel: { color: '#64748b', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statTile: {
    flex: 1,
    backgroundColor: '#0e1726',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#1f2937',
  },
  statEmoji: { fontSize: 22 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4 },
  statLabel: { color: '#64748b', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 2 },

  card: {
    backgroundColor: '#0e1726',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  badgeCard: { borderColor: '#fcd34d' },
  sectionTitle: { color: '#fcd34d', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  badgeItem: {
    backgroundColor: 'rgba(252, 211, 77, 0.08)',
    borderRadius: 12, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fcd34d',
  },
  badgeName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  badgeMsg: { color: '#cbd5e1', marginTop: 2, fontSize: 13 },

  encourageCard: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.06)' },
  encourageText: { color: '#86efac', fontSize: 14, textAlign: 'center', fontWeight: '600', fontStyle: 'italic' },

  aiCard: { borderColor: '#a78bfa' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  aiAvatar: { fontSize: 18 },
  aiLabel: { color: '#a78bfa', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  aiText: { color: '#e9d5ff', fontSize: 14, lineHeight: 20 },

  loadingText: { color: '#94a3b8', marginTop: 10 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#22c55e', borderRadius: 22, paddingVertical: 18,
    shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  primaryArrow: { color: '#0f172a', fontSize: 18 },
  primaryText: { color: '#0f172a', fontSize: 17, fontWeight: '900', letterSpacing: 2 },

  secondaryRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#1f2937',
  },
  secondaryText: { color: '#cbd5e1', fontWeight: '700' },
});
