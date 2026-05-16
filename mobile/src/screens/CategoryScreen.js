import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateLevel } from '../utils/api';

const diffColor = d => (d === 'easy' ? '#22c55e' : d === 'medium' ? '#eab308' : '#ef4444');

export default function CategoryScreen({ navigation, route }) {
  const { playerStats, sessionStats } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await generateLevel(playerStats);
      if (cancelled) return;
      if (!res || !res.ok) {
        setError(res?.error || 'AI ne response nahi diya. Backend check karo.');
        setLoading(false);
        return;
      }
      setData(res);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingMain}>🤖 AI soch raha hai...</Text>
        <Text style={styles.loadingSub}>Level generate ho raha hai...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errEmoji}>⚠️</Text>
        <Text style={styles.errMain}>Connection nahi hua</Text>
        <Text style={styles.errSub}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => navigation.replace('Category', route.params)}>
          <Text style={styles.retryText}>Dobara try karo</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { difficulty, level, chaalbaazActive } = data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {chaalbaazActive ? (
          <View style={styles.chaalbaazBanner}>
            <Text style={styles.chaalbaazTitle}>😏 Chaalbaaz Activated!</Text>
            <Text style={styles.chaalbaazSub}>Tum bohot acha kar rahe ho — adversary agent ne difficulty barha di!</Text>
          </View>
        ) : null}

        <Text style={styles.heading}>🤖 AI ne choose kiya:</Text>

        <View style={styles.catCard}>
          <Text style={styles.catEmoji}>{level.categoryEmoji || '🎯'}</Text>
          <Text style={styles.catName}>{level.category}</Text>
          <View style={[styles.badge, { backgroundColor: diffColor(difficulty.difficulty) }]}>
            <Text style={styles.badgeText}>{(difficulty.difficulty || '').toUpperCase()}</Text>
          </View>
          <Text style={styles.metaText}>⏱ {difficulty.timeLimit} seconds</Text>
          <Text style={styles.metaText}>🔤 {difficulty.wordCount} words dhoondhne hain</Text>
        </View>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonLabel}>AI ka sochna:</Text>
          <Text style={styles.reasonText}>{difficulty.reason}</Text>
        </View>

        <View style={styles.funFactCard}>
          <Text style={styles.funFactLabel}>💡 Fun Fact:</Text>
          <Text style={styles.funFactText}>{level.funFact}</Text>
        </View>

        <TouchableOpacity
          style={styles.startBtn}
          activeOpacity={0.85}
          onPress={() =>
            navigation.replace('Game', {
              playerStats,
              sessionStats,
              difficulty,
              level,
            })
          }
        >
          <Text style={styles.startText}>Tayaar Hun! →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 20, gap: 14 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingMain: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  loadingSub: { color: '#94a3b8', marginTop: 6 },
  errEmoji: { fontSize: 56 },
  errMain: { color: '#ef4444', fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  errSub: { color: '#94a3b8', textAlign: 'center', marginTop: 8 },
  retry: { backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 18 },
  retryText: { color: '#0f172a', fontWeight: 'bold' },
  heading: { color: '#94a3b8', fontSize: 14, marginTop: 8 },
  catCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 22, alignItems: 'center' },
  catEmoji: { fontSize: 60 },
  catName: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 8, textAlign: 'center' },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, marginTop: 10 },
  badgeText: { color: '#0f172a', fontWeight: 'bold', letterSpacing: 2 },
  metaText: { color: '#cbd5e1', marginTop: 8, fontSize: 15 },
  reasonCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16 },
  reasonLabel: { color: '#94a3b8', marginBottom: 4 },
  reasonText: { color: '#fff', fontSize: 15 },
  funFactCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#22c55e' },
  funFactLabel: { color: '#22c55e', fontWeight: 'bold', marginBottom: 4 },
  funFactText: { color: '#fff', lineHeight: 20 },
  startBtn: { backgroundColor: '#22c55e', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  startText: { color: '#0f172a', fontSize: 18, fontWeight: 'bold' },
  chaalbaazBanner: { backgroundColor: '#7f1d1d', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f97316' },
  chaalbaazTitle: { color: '#fcd34d', fontWeight: 'bold', fontSize: 16 },
  chaalbaazSub: { color: '#fed7aa', marginTop: 4 },
});
