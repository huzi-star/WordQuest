import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../utils/auth';
import { learnGetPath } from '../utils/api';

const PALETTE = { card: '#0f172a', border: 'rgba(255,255,255,0.1)', text: '#f4f6fb', muted: '#94a3b8', accent: '#fbbf24' };

export default function ContinueLearningCard({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      const r = await learnGetPath(user.id);
      if (cancelled) return;
      if (r?.ok) setData(r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]));

  if (loading) {
    return (
      <View style={[styles.card, { alignItems: 'center', padding: 30 }]}>
        <ActivityIndicator color={PALETTE.accent} />
      </View>
    );
  }

  if (!data) return null;

  const current = (data.path || []).find((u) => u.status === 'current') || (data.path || [])[0];
  const total = data.path?.length || 32;
  const done = (data.progress?.completed_units || []).length;

  if (!current) return null;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Lesson', { unitId: current.id, lessonIndex: 0 })} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Text style={{ fontSize: 30 }}>{current.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tag}>🎓 CONTINUE LEARNING</Text>
          <Text style={styles.title}>Unit {current.id}: {current.title}</Text>
          <Text style={styles.sub}>Stage {current.stage} · {done}/{total} units complete</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round(done / total * 100)}%` }]} />
          </View>
        </View>
        <Text style={styles.arrow}>›</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('LearningPath')}>
          <Text style={styles.actionText}>📚 Full Path</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.playBtn]} onPress={() => navigation.navigate('Lesson', { unitId: current.id, lessonIndex: 0 })}>
          <Text style={[styles.actionText, { color: '#0b1424' }]}>▶ Start Lesson</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: PALETTE.card, borderRadius: 22, borderWidth: 1, borderColor: PALETTE.accent, padding: 16, marginTop: 4, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(251,191,36,0.15)', borderWidth: 1, borderColor: PALETTE.accent, alignItems: 'center', justifyContent: 'center' },
  tag: { color: PALETTE.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: PALETTE.text, fontSize: 17, fontWeight: '900', marginTop: 4 },
  sub: { color: PALETTE.muted, fontSize: 11, marginTop: 2 },
  bar: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: PALETTE.accent },
  arrow: { color: PALETTE.accent, fontSize: 30 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: PALETTE.border },
  actionText: { color: PALETTE.text, fontWeight: '800', fontSize: 12 },
  playBtn: { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
});
