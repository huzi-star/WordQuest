import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function WordList({ words = [], foundWords = [], currentSelection = '' }) {
  const foundSet = new Set(foundWords.map(w => w.toUpperCase()));
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {words.map((w, i) => {
          const found = foundSet.has(w.toUpperCase());
          return (
            <View
              key={`${w}-${i}`}
              style={[styles.chip, found ? styles.chipFound : styles.chipPending]}
            >
              <Text
                style={[
                  styles.chipText,
                  found && { textDecorationLine: 'line-through', color: '#bbf7d0' },
                ]}
              >
                {w}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.selectionBar}>
        <Text style={styles.selectionLabel}>Selection:</Text>
        <Text style={styles.selectionText}>{currentSelection || '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  scroll: { paddingVertical: 8, paddingHorizontal: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
  },
  chipPending: { backgroundColor: '#1e293b' },
  chipFound: { backgroundColor: '#166534' },
  chipText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1 },
  selectionBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 6,
    alignItems: 'center',
  },
  selectionLabel: { color: '#94a3b8', marginRight: 8 },
  selectionText: { color: '#eab308', fontWeight: 'bold', letterSpacing: 2, fontSize: 16 },
});
