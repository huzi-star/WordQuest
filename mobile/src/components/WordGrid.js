import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PAD = 16;
const CELL = Math.floor((SCREEN_W - GRID_PAD * 2) / 8) - 2;

function key(r, c) { return `${r}-${c}`; }

export default function WordGrid({ grid = [], onLetterPress, selectedCells = [], foundCells = [] }) {
  const isSelected = (r, c) => selectedCells.some(s => s.r === r && s.c === c);
  const isFound = (r, c) => foundCells.some(s => s.r === r && s.c === c);

  return (
    <View style={styles.grid}>
      {grid.map((row, r) => (
        <View key={`r${r}`} style={styles.row}>
          {row.map((letter, c) => {
            const sel = isSelected(r, c);
            const found = isFound(r, c);
            const bg = sel ? '#22c55e' : found ? '#166534' : '#1e293b';
            const color = sel ? '#000' : '#fff';
            return (
              <TouchableOpacity
                key={key(r, c)}
                activeOpacity={0.7}
                style={[styles.cell, { backgroundColor: bg }]}
                onPress={() => onLetterPress && onLetterPress(r, c, letter)}
              >
                <Text style={[styles.letter, { color }]}>{letter}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { alignSelf: 'center', padding: 0 },
  row: { flexDirection: 'row' },
  cell: {
    width: CELL,
    height: CELL,
    margin: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  letter: { fontSize: Math.max(14, CELL * 0.45), fontWeight: 'bold' },
});
