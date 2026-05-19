import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveStats } from '../utils/storage';
import { getCoach } from '../utils/api';
import { useTheme } from '../utils/theme';

export default function GameOverScreen({ navigation, route }) {
  const theme = useTheme();
  const { sessionStats = {} } = route.params || {};
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

  useEffect(() => {
    saveStats({
      highScore: Math.max(highScore, score),
      bestStreak: Math.max(bestStreak, streak),
    });

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
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100 }]} />
      <View style={[styles.blob, { backgroundColor: theme.accent2, bottom: -140, left: -100, opacity: 0.13 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>Game Over 🎮</Text>

          {/* Compact stat strip — no big Final Score box */}
          <View style={styles.row}>
            <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={styles.statLabel}>ROUNDS</Text>
              <Text style={styles.statValue}>{totalRounds}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={styles.statLabel}>BEST STREAK</Text>
              <Text style={[styles.statValue, { color: '#f97316' }]}>🔥 {Math.max(bestStreak, streak)}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.gold }]}>
              <Text style={[styles.statLabel, { color: theme.gold }]}>HIGH SCORE</Text>
              <Text style={[styles.statValue, { color: theme.gold }]}>🏆 {Math.max(highScore, score)}</Text>
            </View>
          </View>

          {/* AI Coach card — English only, no practice words, no next-session line */}
          <View style={[styles.coachCard, { backgroundColor: theme.card, borderColor: theme.accent }]}>
            <View style={styles.coachHeader}>
              <Text style={styles.coachAvatar}>🤖</Text>
              <Text style={[styles.coachTitle, { color: theme.accent }]}>AI COACH ANALYSIS</Text>
            </View>

            {coachLoading ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color={theme.accent} />
                <Text style={styles.coachLoadingText}>Analyzing your performance…</Text>
              </View>
            ) : coach ? (
              <View style={{ gap: 10 }}>
                {coach.headline ? (
                  <Text style={[styles.headline, { color: theme.gold }]}>{coach.headline}</Text>
                ) : null}

                <Text style={[styles.subhead, { color: theme.accent }]}>💪 Your strengths</Text>
                {(coach.strengths || []).map((s, i) => (
                  <Text key={`s${i}`} style={styles.bullet}>• {s}</Text>
                ))}

                <Text style={[styles.subhead, { color: theme.accent }]}>📈 Areas to improve</Text>
                {(coach.improvements || []).map((s, i) => (
                  <Text key={`i${i}`} style={styles.bullet}>• {s}</Text>
                ))}
              </View>
            ) : (
              <Text style={styles.coachLoadingText}>Coach offline — try again later.</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.statsBtn, { backgroundColor: theme.card, borderColor: theme.accent }]}
            onPress={() => navigation.navigate('Stats')}
            activeOpacity={0.85}
          >
            <Text style={[styles.statsBtnText, { color: theme.accent }]}>📊 My Stats Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restartBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
            activeOpacity={0.85}
            onPress={() =>
              navigation.replace('Category', {
                playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
                sessionStats: {
                  score: 0, round: 1, streak: 0, badges: [], history: [],
                  highScore: Math.max(highScore, score),
                  bestStreak: Math.max(bestStreak, streak),
                },
              })
            }
          >
            <Text style={[styles.restartText, { color: theme.bg }]}>🔄 Play Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.homeBtn, { backgroundColor: 'rgba(148,163,184,0.08)', borderColor: theme.border }]}
            onPress={() => navigation.replace('Home')}
            activeOpacity={0.85}
          >
            <Text style={styles.homeText}>🏠 Home</Text>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.13 },
  scroll: { padding: 18, gap: 14 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 },

  row: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  statLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 6 },

  coachCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  coachAvatar: { fontSize: 18 },
  coachTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  coachLoadingText: { color: '#94a3b8', marginTop: 6, textAlign: 'center' },
  headline: { fontSize: 15, fontWeight: '900' },
  subhead: { fontWeight: '900', marginTop: 6, fontSize: 12, letterSpacing: 0.5 },
  bullet: { color: '#fff', marginLeft: 6, lineHeight: 19 },

  statsBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  statsBtnText: { fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },

  restartBtn: {
    paddingVertical: 16, borderRadius: 20, alignItems: 'center',
    shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  restartText: { fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },

  homeBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  homeText: { color: '#cbd5e1', fontWeight: '700' },
});
