import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveStats } from '../utils/storage';
import { getCoach } from '../utils/api';

export default function GameOverScreen({ navigation, route }) {
  const { sessionStats = {} } = route.params || {};
  const {
    score = 0,
    round = 1,
    streak = 0,
    bestStreak = 0,
    highScore = 0,
    badges = [],
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
      badgesCount: badges.length,
      avgWordsPerRound: avgWords,
      avgTimeLeftPerRound: avgTime,
      categoriesPlayed: Array.from(new Set(history.map(h => h.category).filter(Boolean))),
      weakCategories: Array.from(new Set(weakCategories)),
    }).then(res => {
      setCoach(res?.ok ? res.result : null);
      setCoachLoading(false);
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Game Over! 🎮</Text>

        <View style={styles.bigCard}>
          <Text style={styles.bigLabel}>Final Score</Text>
          <Text style={styles.bigScore}>{score}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.card}>
            <Text style={styles.label}>Rounds</Text>
            <Text style={styles.value}>{totalRounds}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Best Streak</Text>
            <Text style={styles.value}>🔥 {Math.max(bestStreak, streak)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>High Score</Text>
            <Text style={styles.value}>🏆 {Math.max(highScore, score)}</Text>
          </View>
        </View>

        {badges.length ? (
          <View style={styles.badgesCard}>
            <Text style={styles.sectionLabel}>🏅 Badges Earned</Text>
            {badges.map((b, i) => (
              <Text key={`${b.id}-${i}`} style={styles.badgeLine}>{b.name} — {b.message}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.coachCard}>
          <Text style={styles.sectionLabel}>🤖 AI Coach Analysis</Text>
          {coachLoading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator color="#22c55e" />
              <Text style={styles.coachLoadingText}>Gemini tumhari performance analyse kar raha hai...</Text>
            </View>
          ) : coach ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.headline}>{coach.headline}</Text>

              <Text style={styles.subhead}>💪 Tumhari Strengths:</Text>
              {coach.strengths.map((s, i) => (
                <Text key={`s${i}`} style={styles.bullet}>• {s}</Text>
              ))}

              <Text style={styles.subhead}>📈 Improve karo:</Text>
              {coach.improvements.map((s, i) => (
                <Text key={`i${i}`} style={styles.bullet}>• {s}</Text>
              ))}

              <Text style={styles.subhead}>🎯 Practice ye words:</Text>
              <View style={styles.practiceRow}>
                {coach.practice.map((w, i) => (
                  <View key={`p${i}`} style={styles.practiceChip}>
                    <Text style={styles.practiceText}>{w}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.nextMove}>👉 {coach.nextMove}</Text>
            </View>
          ) : (
            <Text style={styles.coachLoadingText}>Coach offline — phir try karna.</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.statsBtn}
          onPress={() => navigation.navigate('Stats')}
        >
          <Text style={styles.statsText}>📊 My Stats Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restartBtn}
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
          <Text style={styles.restartText}>🔄 Dobara Khelo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.replace('Home')}
        >
          <Text style={styles.homeText}>🏠 Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  heading: { color: '#fff', fontSize: 28, fontWeight: 'bold', alignSelf: 'center' },
  bigCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#22c55e' },
  bigLabel: { color: '#94a3b8' },
  bigScore: { color: '#22c55e', fontSize: 48, fontWeight: 'bold', marginTop: 6 },
  row: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, alignItems: 'center' },
  label: { color: '#94a3b8', fontSize: 12 },
  value: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  badgesCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, gap: 6 },
  sectionLabel: { color: '#22c55e', fontWeight: 'bold', fontSize: 16 },
  badgeLine: { color: '#fff' },
  coachCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#22c55e' },
  coachLoadingText: { color: '#94a3b8', marginTop: 6 },
  headline: { color: '#fcd34d', fontSize: 15, fontWeight: 'bold' },
  subhead: { color: '#22c55e', fontWeight: 'bold', marginTop: 6 },
  bullet: { color: '#fff', marginLeft: 6 },
  practiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  practiceChip: { backgroundColor: '#0f172a', borderColor: '#22c55e', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  practiceText: { color: '#22c55e', fontWeight: 'bold', letterSpacing: 1 },
  nextMove: { color: '#cbd5e1', marginTop: 6, fontStyle: 'italic' },
  statsBtn: { backgroundColor: '#1e293b', borderColor: '#22c55e', borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  statsText: { color: '#22c55e', fontWeight: 'bold', fontSize: 16 },
  restartBtn: { backgroundColor: '#22c55e', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  restartText: { color: '#0f172a', fontWeight: 'bold', fontSize: 18 },
  homeBtn: { backgroundColor: '#1e293b', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  homeText: { color: '#fff', fontWeight: 'bold' },
});
