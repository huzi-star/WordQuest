import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ScoreBar({ score = 0, streak = 0, round = 1, right }) {
  return (
    <View style={styles.bar}>
      <View style={styles.cell}>
        <Text style={styles.label}>Score</Text>
        <Text style={styles.value}>{score}</Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.label}>Round</Text>
        <Text style={styles.value}>#{round}</Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.label}>Streak</Text>
        <Text style={styles.value}>🔥 {streak}</Text>
      </View>
      {right ? <View style={styles.cell}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cell: { alignItems: 'center', flex: 1 },
  label: { color: '#94a3b8', fontSize: 11 },
  value: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
});
