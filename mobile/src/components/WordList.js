import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function WordList({
  words = [],
  foundWords = [],
  currentSelection = '',
  // Battle-mode props (optional). When provided, attribution overrides the
  // legacy single-player foundWords logic.
  claims = null,
  mySide = null,
  myColor = '#22c55e',
  oppColor = '#ef4444',
}) {
  const hasClaims = claims && typeof claims === 'object';
  const foundSet = new Set(foundWords.map((w) => w.toUpperCase()));

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {words.map((w, i) => {
          const upper = String(w).toUpperCase();
          const claimedBy = hasClaims ? claims[upper] : null;
          const found = hasClaims ? !!claimedBy : foundSet.has(upper);
          const mineClaimed = hasClaims && claimedBy && claimedBy === mySide;
          const oppClaimed = hasClaims && claimedBy && claimedBy !== mySide;
          const chipBg = mineClaimed ? myColor : oppClaimed ? oppColor : found ? '#166534' : '#1e293b';
          const textColor = found ? '#fff' : '#fff';
          const badge = mineClaimed ? 'YOU' : oppClaimed ? 'OPP' : null;
          return (
            <View
              key={`${w}-${i}`}
              style={[styles.chip, { backgroundColor: chipBg, opacity: oppClaimed ? 0.85 : 1 }]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: textColor },
                  found && { textDecorationLine: 'line-through' },
                ]}
              >
                {w}
              </Text>
              {badge ? (
                <View style={styles.badgePill}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
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
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
  },
  chipText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1 },
  badgePill: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff', fontWeight: '900', fontSize: 9, letterSpacing: 0.8,
  },
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
