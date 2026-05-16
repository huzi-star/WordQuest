import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadStats } from '../utils/storage';

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function StatTile({ label, value, color = '#22c55e' }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );
}

function CategoryBar({ name, played, wordsFound, totalWords }) {
  const mastery = totalWords > 0 ? Math.min(100, Math.round((wordsFound / totalWords) * 100)) : 0;
  return (
    <View style={styles.catRow}>
      <View style={styles.catHeader}>
        <Text style={styles.catName}>{name}</Text>
        <Text style={styles.catPct}>{mastery}% · {played} played</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${mastery}%` }]} />
      </View>
    </View>
  );
}

function ScoreHistoryChart({ scores }) {
  if (!scores.length) {
    return <Text style={styles.muted}>Khelo to scores yahan dikhenge.</Text>;
  }
  const max = Math.max(...scores, 1);
  const bars = scores.slice(0, 10).reverse(); // oldest to newest
  return (
    <View style={styles.chartWrap}>
      {bars.map((s, i) => {
        const h = Math.max(4, Math.round((s / max) * 110));
        return (
          <View key={i} style={styles.chartCol}>
            <View style={[styles.chartBar, { height: h }]} />
            <Text style={styles.chartLabel}>{s}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StreakHeatmap({ activeDays }) {
  // 21 day window
  const days = [];
  for (let i = 20; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ key, active: !!activeDays[key], label: d.getDate() });
  }
  return (
    <View style={styles.heatmap}>
      {days.map((d) => (
        <View
          key={d.key}
          style={[
            styles.heatCell,
            { backgroundColor: d.active ? '#22c55e' : '#1e293b' },
          ]}
        >
          <Text style={[styles.heatLabel, d.active && { color: '#0f172a', fontWeight: 'bold' }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function StatsScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadStats();
        if (cancelled) return;
        setStats(s);
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
      </SafeAreaView>
    );
  }

  const winRate = stats.totalRoundsPlayed > 0
    ? Math.round((stats.perfectRounds / stats.totalRoundsPlayed) * 100)
    : 0;
  const avgScore = stats.totalRoundsPlayed > 0
    ? Math.round(stats.totalScoreEver / stats.totalRoundsPlayed)
    : 0;
  const categoryEntries = Object.entries(stats.categoryStats || {});

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>📊 My Stats</Text>
            <Text style={styles.subtitle}>Tumhari poori journey</Text>
          </View>
        </View>

        <View style={styles.row}>
          <StatTile label="🏆 High Score" value={stats.highScore} color="#fcd34d" />
          <StatTile label="🔥 Best Streak" value={stats.bestStreak} color="#f97316" />
        </View>

        <View style={styles.row}>
          <StatTile label="🎮 Games" value={stats.totalGamesPlayed} />
          <StatTile label="🔄 Rounds" value={stats.totalRoundsPlayed} />
          <StatTile label="🎯 Perfect" value={stats.perfectRounds} color="#a78bfa" />
        </View>

        <View style={styles.row}>
          <StatTile label="🔤 Words Found" value={stats.totalWordsFound} />
          <StatTile label="⏱ Time Played" value={formatTime(stats.totalTimeSpent)} color="#60a5fa" />
        </View>

        <View style={styles.row}>
          <StatTile label="📈 Avg Score" value={avgScore} />
          <StatTile label="✨ Win Rate" value={`${winRate}%`} color="#22c55e" />
          <StatTile label="💡 Hints Used" value={stats.hintsUsed} color="#fb923c" />
        </View>

        <Text style={styles.sectionTitle}>📉 Score History (last 10 rounds)</Text>
        <View style={styles.card}>
          <ScoreHistoryChart scores={stats.recentScores || []} />
        </View>

        <Text style={styles.sectionTitle}>🗓 Activity (last 21 days)</Text>
        <View style={styles.card}>
          <StreakHeatmap activeDays={stats.activeDays || {}} />
          <Text style={styles.muted}>Har din khelo aur green box collect karo!</Text>
        </View>

        <Text style={styles.sectionTitle}>🎓 Category Mastery</Text>
        <View style={styles.card}>
          {categoryEntries.length === 0 ? (
            <Text style={styles.muted}>Khelo to categories yahan track hongi.</Text>
          ) : (
            categoryEntries.map(([name, c]) => (
              <CategoryBar
                key={name}
                name={name}
                played={c.played || 0}
                wordsFound={c.wordsFound || 0}
                totalWords={c.totalWords || 0}
              />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: { color: '#fff', fontSize: 28, paddingHorizontal: 4 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tileLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 4 },
  tileValue: { color: '#fff', fontSize: 20, fontWeight: '900' },

  sectionTitle: { color: '#22c55e', fontSize: 15, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  muted: { color: '#64748b', fontSize: 12, textAlign: 'center' },

  catRow: { gap: 4 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { color: '#fff', fontWeight: '700' },
  catPct: { color: '#94a3b8', fontSize: 12 },
  barTrack: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#22c55e', borderRadius: 4 },

  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140, paddingHorizontal: 4 },
  chartCol: { alignItems: 'center', flex: 1 },
  chartBar: { width: 14, backgroundColor: '#22c55e', borderTopLeftRadius: 3, borderTopRightRadius: 3, marginBottom: 4 },
  chartLabel: { color: '#94a3b8', fontSize: 10 },

  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  heatCell: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  heatLabel: { color: '#475569', fontSize: 10 },
});
