import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateLevel } from '../utils/api';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateLabel() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function DailyChallengeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      // Use today's date as a seed to keep the puzzle stable for everyone.
      const res = await generateLevel({
        roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0,
        currentStreak: 0, lastCategory: '',
        dailySeed: todayKey(),
      });
      if (res?.ok) setData(res);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#fcd34d" />
        <Text style={styles.loadText}>Aaj ka challenge load ho raha...</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errText}>Daily challenge load nahi hua.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Wapas jao</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { difficulty, level } = data;

  return (
    <View style={styles.container}>
      <View style={styles.blob} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>🌟 Daily Challenge</Text>
            <Text style={styles.subtitle}>{dateLabel()}</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.starWrap}>
            <Text style={styles.bigStar}>🌟</Text>
          </View>
          <Text style={styles.heroTitle}>TODAY'S PUZZLE</Text>
          <Text style={styles.heroCategory}>{level.categoryEmoji} {level.category}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaTile}>
              <Text style={styles.metaIcon}>⏱</Text>
              <Text style={styles.metaValue}>{difficulty.timeLimit}s</Text>
            </View>
            <View style={styles.metaTile}>
              <Text style={styles.metaIcon}>🔤</Text>
              <Text style={styles.metaValue}>{difficulty.wordCount}</Text>
            </View>
            <View style={styles.metaTile}>
              <Text style={styles.metaIcon}>🎮</Text>
              <Text style={styles.metaValue}>{difficulty.gridSize}×{difficulty.gridSize}</Text>
            </View>
          </View>

          <Text style={styles.note}>
            Same puzzle har user ke liye aaj. 2x score multiplier active 🔥
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipIcon}>💡</Text>
          <Text style={styles.tipText}>
            Daily challenge cheat-proof hai — sirf ek baar khel sakte ho aaj, kal naya puzzle aayega.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={styles.playBtn}
          activeOpacity={0.9}
          onPress={() =>
            navigation.replace('Game', {
              playerStats: { roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '' },
              sessionStats: {
                score: 0, round: 1, streak: 0, badges: [], history: [],
                highScore: 0, bestStreak: 0, isDaily: true,
              },
              difficulty: { ...difficulty, isDaily: true },
              level,
            })
          }
        >
          <Text style={styles.playText}>▶ START CHALLENGE</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14', padding: 18, overflow: 'hidden' },
  center: { flex: 1, backgroundColor: '#070b14', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText: { color: '#fcd34d', fontWeight: '700' },
  errText: { color: '#ef4444' },
  retryBtn: { backgroundColor: '#22c55e', padding: 12, borderRadius: 12, marginTop: 14 },
  retryText: { color: '#0f172a', fontWeight: '900' },

  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#fcd34d', opacity: 0.13, top: -100, right: -80 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1f2937' },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#fcd34d', fontSize: 12, fontWeight: '700' },

  heroCard: {
    backgroundColor: '#0e1726', borderRadius: 22, padding: 22,
    borderWidth: 2, borderColor: '#fcd34d',
    alignItems: 'center',
    shadowColor: '#fcd34d', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  starWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(252, 211, 77, 0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fcd34d' },
  bigStar: { fontSize: 60 },
  heroTitle: { color: '#fcd34d', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  heroCategory: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 6, textAlign: 'center' },

  metaRow: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  metaTile: { flex: 1, backgroundColor: '#0f172a', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  metaIcon: { fontSize: 18 },
  metaValue: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 4 },

  note: { color: '#fcd34d', fontSize: 12, fontWeight: '700', marginTop: 14, textAlign: 'center' },

  tipBox: { flexDirection: 'row', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14, padding: 14, gap: 10, marginTop: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  tipIcon: { fontSize: 18 },
  tipText: { color: '#bbf7d0', fontSize: 12, flex: 1, lineHeight: 18 },

  playBtn: {
    backgroundColor: '#fcd34d', borderRadius: 20, paddingVertical: 18, alignItems: 'center',
    shadowColor: '#fcd34d', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  playText: { color: '#0f172a', fontSize: 17, fontWeight: '900', letterSpacing: 2 },
});
