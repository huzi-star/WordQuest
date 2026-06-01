import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Speech from 'expo-speech';
import { fetchWordOfDay } from '../utils/api';

export default function WordOfDayCard({ tierKey = 'bronze', accent = '#34d399' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchWordOfDay(tierKey);
      if (cancelled) return;
      if (r?.ok) setData(r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tierKey]);

  function speak() {
    try { Speech.stop(); Speech.speak(data?.word || '', { language: 'en-US', rate: 0.9, pitch: 1.05 }); } catch (_) {}
  }

  if (loading) {
    return (
      <View style={[styles.card, { borderColor: accent + '55' }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }
  if (!data) return null;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => setOpen((o) => !o)} style={[styles.card, { borderColor: accent }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.tag, { color: accent }]}>★ WORD OF THE DAY</Text>
        <TouchableOpacity onPress={speak} hitSlop={10} style={[styles.speakBtn, { borderColor: accent }]}>
          <Text style={styles.speakIcon}>🔊</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.word}>{(data.word || '').toUpperCase()}</Text>
      <Text style={styles.meaning}>{data.meaning}</Text>
      {open ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          {data.example ? <Text style={styles.example}>💬 “{data.example}”</Text> : null}
          {data.synonym || data.antonym ? (
            <Text style={styles.synAnt}>
              {data.synonym ? `Same as: ${data.synonym}` : ''}
              {data.synonym && data.antonym ? '  ·  ' : ''}
              {data.antonym ? `Opposite: ${data.antonym}` : ''}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.tapMore, { color: accent }]}>Tap for example →</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderRadius: 18,
    padding: 16, marginTop: 14,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tag: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  speakBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  speakIcon: { fontSize: 13 },
  word: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  meaning: { color: '#cbd5e1', fontSize: 13, marginTop: 4, lineHeight: 19 },
  example: { color: '#94a3b8', fontStyle: 'italic', fontSize: 12, lineHeight: 18 },
  synAnt: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  tapMore: { fontSize: 11, marginTop: 8, fontWeight: '700' },
});
