import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import { saveStats, loadStats } from '../utils/storage';
import { TIERS, tierUpDelta } from '../utils/tiers';
import { getCoach } from '../utils/api';
import { useTheme } from '../utils/theme';

export default function GameOverScreen({ navigation, route }) {
  const theme = useTheme();
  const { sessionStats = {}, penaltyInfo = null, failed = false } = route.params || {};
  const {
    score = 0,
    round = 1,
    streak = 0,
    bestStreak = 0,
    highScore = 0,
    history = [],
  } = sessionStats;

  const totalRounds = Math.max(0, round - 1);
  const avgWords = history.length ? history.reduce((a, h) => a + h.wordsFound, 0) / history.length : 0;
  const avgTime = history.length ? history.reduce((a, h) => a + h.timeLeft, 0) / history.length : 0;

  const [coach, setCoach] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [pendingTierUp, setPendingTierUp] = useState(null);
  // Penalty-driven tier-down (Quick Play fail) takes priority over tier-up.
  const pendingTierDown = penaltyInfo?.downgrade || null;

  function navigateWithTierUpCheck(destRoute, destParams) {
    if (pendingTierDown) {
      navigation.replace('TierDown', {
        ...pendingTierDown,
        returnTo: destRoute,
        returnParams: destParams,
      });
    } else if (pendingTierUp) {
      navigation.replace('TierUp', {
        ...pendingTierUp,
        returnTo: destRoute,
        returnParams: destParams,
      });
    } else {
      navigation.replace(destRoute, destParams);
    }
  }

  useEffect(() => {
    (async () => {
      // Quick Play all-or-nothing: quit mid-round = fail = no points
      // promoted to highScore. Passing 0 is a no-op since saveStats keeps
      // the max — guarantees the partial in-round earnings never count.
      await saveStats({
        highScore: failed ? 0 : Math.max(highScore, score),
        bestStreak: failed ? 0 : Math.max(bestStreak, streak),
      });
      // Tier-up check: totalScoreEver was already updated round-by-round
      // via logRound in RoundComplete. Compare to lastSeenTier.
      try {
        const fresh = await loadStats();
        const delta = tierUpDelta(fresh.lastSeenTier || 'bronze', fresh.totalScoreEver || 0);
        if (delta) setPendingTierUp(delta);
      } catch (_) {}
    })();

    const weakCategories = history
      .filter(h => h.wordsFound < h.totalWords / 2)
      .map(h => h.category)
      .filter(Boolean);

    getCoach({
      totalScore: score,
      rounds: totalRounds,
      bestStreak: Math.max(bestStreak, streak),
      avgWordsPerRound: avgWords,
      avgTimeLeftPerRound: avgTime,
      categoriesPlayed: Array.from(new Set(history.map(h => h.category).filter(Boolean))),
      weakCategories: Array.from(new Set(weakCategories)),
      language: 'english',
    }).then(res => {
      setCoach(res?.ok ? res.result : null);
      setCoachLoading(false);
    });
  }, []);

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.tealTint} />
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100 }]} />
      <View style={[styles.blob, { backgroundColor: theme.accent2, bottom: -140, left: -100, opacity: 0.13 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.titlePlate, failed && styles.titlePlateFail]}>
            <Text style={styles.heading}>{failed ? 'Round Failed!' : 'Game Over 🎮'}</Text>
          </View>

          {penaltyInfo ? (() => {
            const newTier = TIERS.find((t) => t.key === penaltyInfo.newTier) || TIERS[0];
            const droppedTo = penaltyInfo.downgrade
              ? (TIERS.find((t) => t.key === penaltyInfo.downgrade.toTier) || TIERS[0])
              : null;
            return (
              <View style={styles.penaltyCard}>
                <Text style={styles.penaltyDelta}>−{penaltyInfo.penalty} points</Text>
                <View style={styles.penaltyRow}>
                  <View style={styles.penaltyCol}>
                    <Text style={styles.penaltyLabel}>NEW TOTAL</Text>
                    <Text style={styles.penaltyVal}>💰 {penaltyInfo.newTotal}</Text>
                  </View>
                  <View style={styles.penaltyCol}>
                    <Text style={styles.penaltyLabel}>CURRENT TIER</Text>
                    <Text style={styles.penaltyVal}>{newTier.emoji} {newTier.name}</Text>
                  </View>
                </View>
                {droppedTo ? (
                  <Text style={styles.tierDropText}>⬇ Tier dropped to {droppedTo.name}</Text>
                ) : null}
              </View>
            );
          })() : null}

          {/* Compact stat strip — no big Final Score box */}
          <View style={styles.row}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>ROUNDS</Text>
              <Text style={styles.statValue}>{totalRounds}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>BEST STREAK</Text>
              <Text style={[styles.statValue, { color: '#fb923c' }]}>🔥 {Math.max(bestStreak, streak)}</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#fbbf24' }]}>
              <Text style={[styles.statLabel, { color: '#fde68a' }]}>HIGH SCORE</Text>
              <Text style={[styles.statValue, { color: '#facc15' }]}>🏆 {Math.max(highScore, score)}</Text>
            </View>
          </View>

          {/* AI Coach card — English only, no practice words, no next-session line */}
          <View style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <Text style={styles.coachAvatar}>🤖</Text>
              <Text style={styles.coachTitle}>AI COACH ANALYSIS</Text>
            </View>

            {coachLoading ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color="#facc15" />
                <Text style={styles.coachLoadingText}>Analyzing your performance…</Text>
              </View>
            ) : coach ? (
              <View style={{ gap: 10 }}>
                {coach.headline ? (
                  <Text style={styles.headline}>{coach.headline}</Text>
                ) : null}

                <Text style={styles.subhead}>💪 Your strengths</Text>
                {(coach.strengths || []).map((s, i) => (
                  <Text key={`s${i}`} style={styles.bullet}>• {s}</Text>
                ))}

                <Text style={styles.subhead}>📈 Areas to improve</Text>
                {(coach.improvements || []).map((s, i) => (
                  <Text key={`i${i}`} style={styles.bullet}>• {s}</Text>
                ))}
              </View>
            ) : (
              <Text style={styles.coachLoadingText}>Coach offline — try again later.</Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.statsBtn}
            onPress={() => navigation.navigate('Stats')}
            activeOpacity={0.85}
          >
            <Text style={styles.statsBtnText}>📊 My Stats Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restartBtn}
            activeOpacity={0.85}
            onPress={() =>
              navigateWithTierUpCheck('Category', {
                playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
                sessionStats: {
                  score: 0, round: 1, streak: 0, badges: [], history: [],
                  highScore: Math.max(highScore, score),
                  bestStreak: Math.max(bestStreak, streak),
                },
              })
            }
          >
            <Text style={styles.restartText}>{failed ? '↻ Try Again' : '🔄 Play Again'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => navigateWithTierUpCheck('Home')}
            activeOpacity={0.85}
          >
            <Text style={styles.homeText}>🏠 Home</Text>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,80,80,0.55)' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.13 },
  scroll: { padding: 18, gap: 14 },

  titlePlate: {
    alignSelf: 'center',
    paddingHorizontal: 28, paddingVertical: 12,
    backgroundColor: '#92400e',
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
  },
  heading: {
    color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 3,
  },

  titlePlateFail: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },

  penaltyCard: {
    backgroundColor: 'rgba(127,29,29,0.85)',
    borderRadius: 18, padding: 14,
    borderWidth: 3, borderColor: '#ef4444',
    borderBottomWidth: 7, borderBottomColor: '#450a0a',
    alignItems: 'center',
  },
  penaltyDelta: {
    color: '#fca5a5', fontSize: 28, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  penaltyRow: { flexDirection: 'row', gap: 12, marginTop: 10, alignSelf: 'stretch' },
  penaltyCol: { flex: 1, alignItems: 'center' },
  penaltyLabel: { color: '#fecaca', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  penaltyVal: {
    color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  tierDropText: {
    color: '#fca5a5', fontSize: 13, fontWeight: '900', marginTop: 10,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  row: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, borderRadius: 16, padding: 12, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  statLabel: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  statValue: {
    color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  coachCard: {
    borderRadius: 18, padding: 14, gap: 8,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  coachAvatar: { fontSize: 18 },
  coachTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5, color: '#fde68a' },
  coachLoadingText: { color: '#fde68a', marginTop: 6, textAlign: 'center', fontWeight: '600' },
  headline: { fontSize: 15, fontWeight: '900', color: '#facc15' },
  subhead: { fontWeight: '900', marginTop: 6, fontSize: 12, letterSpacing: 0.5, color: '#86efac' },
  bullet: { color: '#fff', marginLeft: 6, lineHeight: 19, fontWeight: '600' },

  statsBtn: {
    paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#1e3a8a',
  },
  statsBtnText: {
    color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  restartBtn: {
    paddingVertical: 18, borderRadius: 999, alignItems: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#14532d',
    shadowColor: '#22c55e',
    shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  restartText: {
    color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },

  homeBtn: {
    paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  homeText: {
    color: '#fff', fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});
