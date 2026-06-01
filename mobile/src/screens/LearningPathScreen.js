import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, ImageBackground, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../utils/auth';
import { learnGetPath } from '../utils/api';
import { usePlan, isUnitUnlocked } from '../utils/plan';

const BG = require('../../home_design/home_bg.jpeg');
const ICO_UNIT_CASTLE = require('../../home_design/unit-castle.png');

const PALETTE = {
  text: '#f4f6fb', muted: '#cbd5e1',
  done: '#22c55e', current: '#fbbf24', locked: '#64748b',
};

const STAGE_META = {
  'A1':  { name: 'A1 Foundations', color: '#fbbf24' },
  'A2':  { name: 'A2 Building Blocks', color: '#5eead4' },
  'A2+': { name: 'A2+ Vocabulary', color: '#93c5fd' },
  'B1':  { name: 'B1 Intermediate', color: '#c4b5fd' },
};

export default function LearningPathScreen({ navigation }) {
  const { user } = useAuth();
  const { plan, features } = usePlan();
  const [data, setData] = useState({ progress: null, path: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!user?.id) { setLoading(false); return; }
    const r = await learnGetPath(user.id);
    if (r?.ok) setData({ progress: r.progress, path: r.path || [] });
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tealTint} />
        <SafeAreaView style={styles.safe}>
          <ActivityIndicator style={{ marginTop: 80 }} color={PALETTE.current} size="large" />
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const completedCount = data.path.filter((u) => u.status === 'done').length;
  const totalCount = Math.max(1, data.path.length);
  const pct = Math.round((completedCount / totalCount) * 100);

  // Group path by stage.
  const grouped = data.path.reduce((acc, u) => {
    (acc[u.stage] = acc[u.stage] || []).push(u);
    return acc;
  }, {});

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.titlePlate}>
              <Text style={styles.titlePlateText}>🎓 LEARNING PATH</Text>
              <Text style={styles.titlePlateSub}>CASTLE QUEST</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.progressCard}>
            <Image source={ICO_UNIT_CASTLE} style={styles.castleIcon} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.progressLabel}>OVERALL PROGRESS</Text>
              <Text style={styles.subtitle}>{completedCount} / {data.path.length} units complete</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
            </View>
          </View>
        </View>

        <FlatList
          data={Object.keys(grouped)}
          keyExtractor={(k) => k}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 70 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#fff" />}
          renderItem={({ item: stageKey }) => {
            const meta = STAGE_META[stageKey] || { name: stageKey, color: '#fbbf24' };
            return (
              <View style={{ marginBottom: 16 }}>
                <View style={[styles.stageHeaderPill, { backgroundColor: meta.color }]}>
                  <Text style={styles.stageHeaderText}>{meta.name.toUpperCase()}</Text>
                </View>
                {grouped[stageKey].map((u) => <UnitRow key={u.id} unit={u} navigation={navigation} planLocked={!isUnitUnlocked(plan, u.id)} maxUnit={features.maxUnit} />)}
              </View>
            );
          }}
        />
      </SafeAreaView>
    </ImageBackground>
  );
}

function UnitRow({ unit, navigation, planLocked, maxUnit }) {
  const isLocked = unit.status === 'locked';
  const isDone = unit.status === 'done';
  const isCurrent = unit.status === 'current';
  const accent = isDone ? PALETTE.done : isCurrent ? PALETTE.current : PALETTE.locked;
  const accentDark = isDone ? '#14532d' : isCurrent ? '#78350f' : '#0f172a';
  const statusIcon = isDone ? '✅' : isCurrent ? '▶' : isLocked || planLocked ? '🔒' : '•';

  return (
    <TouchableOpacity
      activeOpacity={isLocked ? 1 : 0.85}
      disabled={isLocked}
      onPress={() => {
        if (isLocked) return;
        if (planLocked) {
          navigation.navigate('Paywall', { reason: `Units ${maxUnit + 1}-32 are a Pro feature. Continue your CEFR journey.` });
          return;
        }
        navigation.navigate('Lesson', { unitId: unit.id, lessonIndex: 0 });
      }}
      style={[
        styles.unitRow,
        { borderColor: accent, borderBottomColor: accentDark },
        isCurrent && styles.unitRowCurrent,
        isLocked && styles.unitRowLocked,
      ]}
    >
      <View style={[styles.unitNum, { backgroundColor: accent, borderColor: '#fff' }]}>
        <Text style={styles.unitNumText}>{unit.id}</Text>
      </View>
      <Text style={styles.unitEmoji}>{unit.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.unitTitle, isLocked && { color: PALETTE.muted }]} numberOfLines={1}>{unit.title}</Text>
        <Text style={[styles.unitSub, { color: accent }]}>
          {isDone ? 'Completed ✓' : isCurrent ? 'In progress — tap to play' : isLocked ? 'Locked' : 'Available'}
        </Text>
      </View>
      <Text style={[styles.statusIcon, { color: accent }]}>{statusIcon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  safe: { flex: 1 },

  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  titlePlateText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  titlePlateSub: { color: '#fde68a', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginTop: -1 },

  progressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 18, padding: 12,
    borderWidth: 3, borderColor: '#fcd34d',
    borderBottomWidth: 7, borderBottomColor: '#78350f',
  },
  castleIcon: { width: 64, height: 64 },
  progressLabel: {
    color: '#fcd34d', fontSize: 11, fontWeight: '900', letterSpacing: 1.2,
  },
  subtitle: { color: '#fff', fontSize: 13, marginTop: 2, fontWeight: '800' },
  bar: {
    height: 10, backgroundColor: '#1e293b', borderRadius: 5, overflow: 'hidden', marginTop: 8,
    borderWidth: 1, borderColor: '#475569',
  },
  barFill: { height: '100%', backgroundColor: '#facc15' },

  stageHeaderPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.35)',
    marginBottom: 10, marginTop: 4,
  },
  stageHeaderText: { color: '#0f172a', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },

  unitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3,
    borderBottomWidth: 7,
  },
  unitRowCurrent: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    shadowColor: '#facc15', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  unitRowLocked: { opacity: 0.6 },
  unitNum: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
  },
  unitNumText: {
    fontWeight: '900', fontSize: 14, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  unitEmoji: { fontSize: 28 },
  unitTitle: {
    color: '#fff', fontSize: 15, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  unitSub: { fontSize: 11, marginTop: 2, fontWeight: '800' },
  statusIcon: { fontSize: 20, fontWeight: '900' },
});
