import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveStats } from '../utils/storage';

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

  useEffect(() => {
    saveStats({
      highScore: Math.max(highScore, score),
      bestStreak: Math.max(bestStreak, streak),
    });
  }, []);

  const totalRounds = Math.max(0, round - 1);
  const avgWords = history.length ? (history.reduce((a, h) => a + h.wordsFound, 0) / history.length).toFixed(1) : '0';
  const avgTime = history.length ? (history.reduce((a, h) => a + h.timeLeft, 0) / history.length).toFixed(1) : '0';

  const strength = Number(avgWords) >= 3 ? 'Words jaldi dhoondhne mein expert ho' : 'Tum dhairaj se khel rahe ho';
  const improve = Number(avgTime) < 20 ? 'Speed pe kaam karo — time bonus zyada milega' : 'Mushkil categories try karo — vocabulary barhayegi';

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

        <View style={styles.analysisCard}>
          <Text style={styles.sectionLabel}>🤖 AI Performance Analysis</Text>
          <Text style={styles.analysisLine}>Tumhari strengths: {strength}</Text>
          <Text style={styles.analysisLine}>Improve karo: {improve}</Text>
          <Text style={styles.analysisMeta}>Avg words/round: {avgWords} • Avg time left: {avgTime}s</Text>
        </View>

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
          onPress={() => navigation.replace('Home', { highScore: Math.max(highScore, score), bestStreak: Math.max(bestStreak, streak) })}
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
  analysisCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, gap: 6 },
  analysisLine: { color: '#fff' },
  analysisMeta: { color: '#94a3b8', marginTop: 6 },
  restartBtn: { backgroundColor: '#22c55e', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  restartText: { color: '#0f172a', fontWeight: 'bold', fontSize: 18 },
  homeBtn: { backgroundColor: '#1e293b', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  homeText: { color: '#fff', fontWeight: 'bold' },
});
