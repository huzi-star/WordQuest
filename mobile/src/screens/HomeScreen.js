import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  const [highScore, setHighScore] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadStats();
        if (cancelled) return;
        setHighScore(s.highScore);
        setBestStreak(s.bestStreak);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.emoji}>🎮</Text>
        <Text style={styles.title}>WordQuest Pakistan</Text>
        <Text style={styles.subtitle}>AI Powered Word Puzzle</Text>
      </View>

      <View style={styles.middle}>
        <View style={styles.card}>
          <Text style={styles.cardText}>🏆 High Score: {highScore}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardText}>🔥 Best Streak: {bestStreak}</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.playBtn}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('Category', {
              playerStats: INITIAL_STATS,
              sessionStats: {
                score: 0,
                round: 1,
                streak: 0,
                badges: [],
                history: [],
                highScore,
                bestStreak,
              },
            })
          }
        >
          <Text style={styles.playText}>▶ Game Shuru Karo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chaalbaazBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Chaalbaaz', { sessionStats: { streak: bestStreak } })}
        >
          <Text style={styles.chaalbaazText}>😏 Chaalbaaz se baat karo</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 20, justifyContent: 'space-between' },
  top: { alignItems: 'center', marginTop: 40 },
  emoji: { fontSize: 80 },
  title: { color: '#22c55e', fontSize: 32, fontWeight: 'bold', marginTop: 8, textShadowColor: '#22c55e', textShadowRadius: 12 },
  subtitle: { color: '#94a3b8', marginTop: 6, fontSize: 16 },
  middle: { gap: 12 },
  card: { backgroundColor: '#1e293b', padding: 18, borderRadius: 12 },
  cardText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  bottom: { marginBottom: 40 },
  playBtn: { backgroundColor: '#22c55e', paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  playText: { color: '#0f172a', fontSize: 20, fontWeight: 'bold' },
  chaalbaazBtn: { backgroundColor: '#7f1d1d', borderColor: '#f97316', borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  chaalbaazText: { color: '#fcd34d', fontSize: 16, fontWeight: 'bold' },
});
