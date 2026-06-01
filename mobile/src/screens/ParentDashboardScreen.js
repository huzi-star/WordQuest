import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { fetchParentSummary } from '../utils/api';
import { useAuth } from '../utils/auth';

const BG = require('../../home_design/home_bg.jpeg');

export default function ParentDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!user?.id) { setLoading(false); return; }
        setLoading(true);
        const r = await fetchParentSummary(user.id);
        if (!cancelled) { setData(r?.ok ? r : null); setLoading(false); }
      })();
      return () => { cancelled = true; };
    }, [user?.id]),
  );

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>📊 Parent Dashboard</Text>
          <Text style={styles.subtitle}>Pro Max · {data?.profile?.displayName || 'Child'}'s progress</Text>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#a855f7" size="large" /></View>
        ) : !data ? (
          <View style={styles.center}><Text style={styles.empty}>No data yet</Text></View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.section}>OVERVIEW</Text>
            <View style={styles.grid}>
              <StatCard icon="🏆" label="High Score" value={data.progress.highScore} color="#facc15" />
              <StatCard icon="🎮" label="Total Games" value={data.progress.totalGames} color="#3b82f6" />
              <StatCard icon="🔤" label="Words Found" value={data.progress.totalWords} color="#22c55e" />
              <StatCard icon="🔥" label="Best Streak" value={data.progress.bestStreak} color="#f97316" />
              <StatCard icon="🎯" label="Perfect" value={data.progress.perfectRounds} color="#a855f7" />
              <StatCard icon="⏱" label="Minutes played" value={Math.floor(data.progress.totalTimeSeconds / 60)} color="#06b6d4" />
            </View>

            <Text style={styles.section}>BATTLE & MMR</Text>
            <View style={styles.bigCard}>
              <View style={styles.bigRow}><Text style={styles.bigLbl}>Rating (MMR)</Text><Text style={styles.bigVal}>{data.battle.mmr}</Text></View>
              <View style={styles.bigRow}><Text style={styles.bigLbl}>Wins / Losses</Text><Text style={styles.bigVal}>{data.battle.wins} / {data.battle.losses}</Text></View>
              <View style={styles.bigRow}><Text style={styles.bigLbl}>Current streak</Text><Text style={styles.bigVal}>{data.battle.streak > 0 ? `🔥 +${data.battle.streak}` : data.battle.streak < 0 ? `🥶 ${data.battle.streak}` : '–'}</Text></View>
            </View>

            <Text style={styles.section}>LEARNING ACADEMY</Text>
            <View style={styles.bigCard}>
              <View style={styles.bigRow}><Text style={styles.bigLbl}>Units completed</Text><Text style={styles.bigVal}>{data.learning.completedUnits} / 32</Text></View>
              <View style={styles.bigRow}><Text style={styles.bigLbl}>Current unit</Text><Text style={styles.bigVal}>{data.learning.currentUnit}</Text></View>
              <View style={styles.bigRow}><Text style={styles.bigLbl}>Levels unlocked</Text><Text style={styles.bigVal}>{data.progress.maxUnlockedLevel} / 15</Text></View>
            </View>

            <Text style={styles.section}>ACTIVITY (LAST 14 DAYS)</Text>
            <View style={styles.bigCard}>
              <View style={styles.chartRow}>
                {(data.activity.last14Days || []).map((d, i) => {
                  const max = Math.max(1, ...(data.activity.last14Days || []).map((x) => x.count || 0));
                  const h = Math.max(4, Math.round(((d.count || 0) / max) * 70));
                  return (
                    <View key={d.day || i} style={styles.barWrap}>
                      <View style={[styles.bar, { height: h, backgroundColor: d.count ? '#22c55e' : '#334155' }]} />
                      <Text style={styles.barLbl}>{d.day?.slice(-2)}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.chartCaption}>Bars = games played per day</Text>
            </View>

            <View style={{ height: 30 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#94a3b8', fontWeight: '800' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#a855f7', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#94a3b8', fontSize: 14 },
  scroll: { padding: 14 },

  section: {
    color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1.5,
    marginTop: 14, marginBottom: 8, marginLeft: 4,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '31.5%',
    backgroundColor: 'rgba(15,23,42,0.85)',
    padding: 10, borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  statIcon: { fontSize: 22 },
  statValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  statLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '800', marginTop: 2, textAlign: 'center' },

  bigCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    padding: 14, borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  bigRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bigLbl: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  bigVal: { color: '#fff', fontSize: 14, fontWeight: '900' },

  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 90, marginBottom: 6 },
  barWrap: { alignItems: 'center', flex: 1 },
  bar: { width: 12, borderRadius: 4 },
  barLbl: { color: '#64748b', fontSize: 9, marginTop: 4 },
  chartCaption: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 4 },
});
