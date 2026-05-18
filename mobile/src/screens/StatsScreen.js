import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadStats } from '../utils/storage';

function fmtTime(sec) {
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function levelFromXp(xp) {
  // Simple xp curve: each level needs 200 * level XP
  let level = 1;
  let remaining = xp;
  while (remaining >= 200 * level) {
    remaining -= 200 * level;
    level += 1;
  }
  const needed = 200 * level;
  return { level, current: remaining, needed, progress: remaining / needed };
}

function StatPod({ icon, label, value, accent = '#22c55e' }) {
  return (
    <View style={styles.pod}>
      <View style={[styles.podIconWrap, { backgroundColor: `${accent}22`, borderColor: accent }]}>
        <Text style={styles.podIcon}>{icon}</Text>
      </View>
      <Text style={styles.podLabel}>{label}</Text>
      <Text style={[styles.podValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function CategoryRow({ name, played, wordsFound, totalWords, perfectCount }) {
  const mastery = totalWords > 0 ? Math.min(100, Math.round((wordsFound / totalWords) * 100)) : 0;
  const tier = mastery >= 80 ? '🥇 Master' : mastery >= 50 ? '🥈 Skilled' : mastery >= 25 ? '🥉 Novice' : '⚪️ Rookie';
  return (
    <View style={styles.catCard}>
      <View style={styles.catTop}>
        <Text style={styles.catName}>{name}</Text>
        <Text style={styles.catTier}>{tier}</Text>
      </View>
      <View style={styles.catMeta}>
        <Text style={styles.catMetaText}>{played} rounds · {wordsFound}/{totalWords} words · {perfectCount} perfect</Text>
        <Text style={[styles.catPct, mastery >= 80 && { color: '#fcd34d' }]}>{mastery}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${mastery}%`, backgroundColor: mastery >= 80 ? '#fcd34d' : mastery >= 50 ? '#22c55e' : '#a78bfa' }]} />
      </View>
    </View>
  );
}

function ScoreChart({ scores }) {
  if (!scores.length) {
    return <Text style={styles.emptyText}>Khelo to scores yahan dikhenge.</Text>;
  }
  const display = scores.slice(0, 10).reverse();
  const max = Math.max(...display, 1);
  const avg = Math.round(display.reduce((a, b) => a + b, 0) / display.length);
  return (
    <View>
      <View style={styles.chartTop}>
        <View>
          <Text style={styles.chartHint}>LAST {display.length} ROUNDS</Text>
          <Text style={styles.chartAvg}>Avg {avg}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.chartHint}>BEST</Text>
          <Text style={[styles.chartAvg, { color: '#fcd34d' }]}>{max}</Text>
        </View>
      </View>
      <View style={styles.chartWrap}>
        {display.map((s, i) => {
          const h = Math.max(6, Math.round((s / max) * 110));
          const isBest = s === max;
          return (
            <View key={i} style={styles.chartCol}>
              <View
                style={[
                  styles.chartBar,
                  { height: h, backgroundColor: isBest ? '#fcd34d' : '#22c55e' },
                ]}
              />
              <Text style={[styles.chartLabel, isBest && { color: '#fcd34d', fontWeight: '900' }]}>{s}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Heatmap({ activeDays }) {
  const cells = [];
  let activeCount = 0;
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const active = !!activeDays[key];
    if (active) activeCount += 1;
    cells.push({ key, active, label: d.getDate(), isToday: i === 0 });
  }
  return (
    <View>
      <View style={styles.heatTop}>
        <Text style={styles.heatStat}>{activeCount} / 28 days active</Text>
        <Text style={styles.heatStreak}>🔥 keep going</Text>
      </View>
      <View style={styles.heat}>
        {cells.map((c) => (
          <View
            key={c.key}
            style={[
              styles.heatCell,
              c.active && styles.heatCellActive,
              c.isToday && styles.heatCellToday,
            ]}
          >
            <Text style={[styles.heatLabel, c.active && { color: '#0f172a', fontWeight: '900' }]}>{c.label}</Text>
          </View>
        ))}
      </View>
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
  const categoryEntries = Object.entries(stats.categoryStats || {})
    .sort((a, b) => (b[1].played || 0) - (a[1].played || 0));

  const xp = stats.totalScoreEver || 0;
  const { level, current, needed, progress } = levelFromXp(xp);

  return (
    <View style={styles.container}>
      <View style={[styles.bgBlob, { backgroundColor: '#22c55e', top: -100, right: -80 }]} />
      <View style={[styles.bgBlob, { backgroundColor: '#a78bfa', bottom: -100, left: -80, opacity: 0.1 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>📊 My Stats</Text>
              <Text style={styles.subtitle}>Your full journey</Text>
            </View>
          </View>

          {/* Level / XP hero */}
          <View style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelLabel}>LEVEL</Text>
                <Text style={styles.levelNum}>{level}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.heroTitle}>Total XP</Text>
                <Text style={styles.heroValue}>{xp.toLocaleString()}</Text>
                <View style={styles.xpBar}>
                  <View style={[styles.xpFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.xpHint}>{current} / {needed} XP to Level {level + 1}</Text>
              </View>
            </View>
          </View>

          {/* Top stat pods */}
          <View style={styles.podRow}>
            <StatPod icon="🏆" label="HIGH SCORE" value={stats.highScore} accent="#fcd34d" />
            <StatPod icon="🔥" label="BEST STREAK" value={stats.bestStreak} accent="#f97316" />
          </View>

          <View style={styles.podRow}>
            <StatPod icon="🎮" label="GAMES" value={stats.totalGamesPlayed} accent="#60a5fa" />
            <StatPod icon="🔄" label="ROUNDS" value={stats.totalRoundsPlayed} accent="#22c55e" />
            <StatPod icon="🎯" label="PERFECT" value={stats.perfectRounds} accent="#a78bfa" />
          </View>

          <View style={styles.podRow}>
            <StatPod icon="🔤" label="WORDS" value={stats.totalWordsFound} accent="#22c55e" />
            <StatPod icon="⏱" label="TIME" value={fmtTime(stats.totalTimeSpent)} accent="#60a5fa" />
            <StatPod icon="💡" label="HINTS" value={stats.hintsUsed} accent="#fb923c" />
          </View>

          {/* Stats summary card */}
          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>QUICK SUMMARY</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Average Score per Round</Text>
              <Text style={styles.summaryValue}>{avgScore}</Text>
            </View>
            <View style={styles.summaryDiv} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Perfect Round Rate</Text>
              <Text style={[styles.summaryValue, winRate >= 50 && { color: '#fcd34d' }]}>{winRate}%</Text>
            </View>
            <View style={styles.summaryDiv} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Words per Round (avg)</Text>
              <Text style={styles.summaryValue}>
                {stats.totalRoundsPlayed > 0 ? (stats.totalWordsFound / stats.totalRoundsPlayed).toFixed(1) : '0'}
              </Text>
            </View>
          </View>

          {/* Score history */}
          <Text style={styles.bigSection}>📈 Score Trend</Text>
          <View style={styles.card}>
            <ScoreChart scores={stats.recentScores || []} />
          </View>

          {/* Activity heatmap */}
          <Text style={styles.bigSection}>🗓 Activity Heatmap</Text>
          <View style={styles.card}>
            <Heatmap activeDays={stats.activeDays || {}} />
          </View>

          {/* Category mastery */}
          <Text style={styles.bigSection}>🎓 Category Mastery</Text>
          {categoryEntries.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>Khelo to categories yahan track hongi.</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {categoryEntries.map(([name, c]) => (
                <CategoryRow
                  key={name}
                  name={name}
                  played={c.played || 0}
                  wordsFound={c.wordsFound || 0}
                  totalWords={c.totalWords || 0}
                  perfectCount={c.perfectCount || 0}
                />
              ))}
            </View>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14', overflow: 'hidden' },
  bgBlob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.13 },
  center: { flex: 1, backgroundColor: '#070b14', justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 10 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(148,163,184,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1f2937',
  },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  // Level / XP hero
  heroCard: {
    backgroundColor: '#0e1726',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1, borderColor: '#22c55e',
    shadowColor: '#22c55e', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  levelBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  levelLabel: { color: '#0f172a', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  levelNum: { color: '#0f172a', fontSize: 36, fontWeight: '900', lineHeight: 40 },
  heroTitle: { color: '#64748b', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  heroValue: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2 },
  xpBar: { height: 6, backgroundColor: '#0f172a', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  xpFill: { height: 6, backgroundColor: '#22c55e', borderRadius: 3 },
  xpHint: { color: '#94a3b8', fontSize: 11, marginTop: 4 },

  // Pods
  podRow: { flexDirection: 'row', gap: 8 },
  pod: {
    flex: 1,
    backgroundColor: '#0e1726',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#1f2937',
  },
  podIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  podIcon: { fontSize: 18 },
  podLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  podValue: { color: '#22c55e', fontSize: 20, fontWeight: '900', marginTop: 2 },

  // Summary
  summaryCard: {
    backgroundColor: '#0e1726',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  sectionTitle: { color: '#94a3b8', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  summaryLabel: { color: '#cbd5e1', fontSize: 13 },
  summaryValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  summaryDiv: { height: 1, backgroundColor: '#1f2937' },

  bigSection: { color: '#22c55e', fontSize: 16, fontWeight: '900', marginTop: 10, marginBottom: 4 },
  card: {
    backgroundColor: '#0e1726',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center', paddingVertical: 20 },

  // Chart
  chartTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  chartHint: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  chartAvg: { color: '#fff', fontSize: 18, fontWeight: '900' },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  chartCol: { alignItems: 'center', flex: 1 },
  chartBar: { width: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4, marginBottom: 4 },
  chartLabel: { color: '#94a3b8', fontSize: 10 },

  // Heatmap
  heatTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  heatStat: { color: '#22c55e', fontWeight: '900', fontSize: 12 },
  heatStreak: { color: '#fb923c', fontSize: 12, fontWeight: '700' },
  heat: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  heatCell: {
    width: 32, height: 32, borderRadius: 6,
    backgroundColor: '#1e293b',
    alignItems: 'center', justifyContent: 'center',
  },
  heatCellActive: { backgroundColor: '#22c55e' },
  heatCellToday: { borderWidth: 2, borderColor: '#fcd34d' },
  heatLabel: { color: '#475569', fontSize: 10 },

  // Category
  catCard: {
    backgroundColor: '#0e1726',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName: { color: '#fff', fontWeight: '900', fontSize: 14, flex: 1 },
  catTier: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  catMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  catMetaText: { color: '#64748b', fontSize: 11 },
  catPct: { color: '#22c55e', fontWeight: '900', fontSize: 12 },
  barTrack: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
});
