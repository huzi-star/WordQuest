import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PAD = 16;
const CELL = Math.floor((SCREEN_W - GRID_PAD * 2) / 8) - 2;
const CELL_WITH_MARGIN = CELL + 2; // cell + horizontal margin (1px each side)

export default function WordGrid({
  grid = [],
  onCellEnter,
  onSelectionEnd,
  selectedCells = [],
  foundCells = [],
}) {
  const gridRef = useRef(null);
  const originRef = useRef({ x: 0, y: 0 });
  const lastCellRef = useRef(null);
  const gestureCountRef = useRef(0);

  // Keep latest props accessible inside stable PanResponder callbacks.
  const propsRef = useRef({});
  propsRef.current = { grid, onCellEnter, onSelectionEnd };

  const measure = () => {
    if (gridRef.current && gridRef.current.measure) {
      gridRef.current.measure((x, y, w, h, pageX, pageY) => {
        if (typeof pageX === 'number' && typeof pageY === 'number') {
          originRef.current = { x: pageX, y: pageY };
        }
      });
    }
  };

  // Convert an absolute touch position into a grid cell.
  // Use pageX/pageY minus measured grid origin. This is the only reliable
  // approach when PanResponder is on the parent and cells are child Views —
  // locationX/locationY would be relative to whichever child was hit.
  const pointToCell = (evt) => {
    const g = propsRef.current.grid;
    if (!g || !g.length) return null;
    const ne = evt.nativeEvent;
    const relX = ne.pageX - originRef.current.x;
    const relY = ne.pageY - originRef.current.y;
    const c = Math.floor(relX / CELL_WITH_MARGIN);
    const r = Math.floor(relY / CELL_WITH_MARGIN);
    if (r < 0 || r >= g.length || c < 0 || c >= g[0].length) return null;
    return { r, c, letter: g[r][c] };
  };

  const touchHandler = (evt) => {
    const cell = pointToCell(evt);
    if (!cell) return;
    const last = lastCellRef.current;
    if (last && last.r === cell.r && last.c === cell.c) return;
    lastCellRef.current = cell;
    gestureCountRef.current += 1;
    if (propsRef.current.onCellEnter) {
      propsRef.current.onCellEnter(cell.r, cell.c, cell.letter);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        gestureCountRef.current = 0;
        lastCellRef.current = null;
        measure();
        touchHandler(evt);
      },
      onPanResponderMove: (evt) => touchHandler(evt),
      onPanResponderRelease: () => {
        const wasDrag = gestureCountRef.current > 1;
        lastCellRef.current = null;
        if (propsRef.current.onSelectionEnd) {
          propsRef.current.onSelectionEnd(wasDrag);
        }
      },
      onPanResponderTerminate: () => {
        lastCellRef.current = null;
      },
    })
  ).current;

  // Re-measure shortly after mount to catch any post-render layout shifts
  // (status bar, safe-area insets, font loading on Android).
  useEffect(() => {
    const t1 = setTimeout(measure, 100);
    const t2 = setTimeout(measure, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const isSelected = (r, c) => selectedCells.some((s) => s.r === r && s.c === c);
  const isFound = (r, c) => foundCells.some((s) => s.r === r && s.c === c);

  return (
    <View
      ref={gridRef}
      onLayout={measure}
      collapsable={false}
      style={styles.grid}
      {...panResponder.panHandlers}
    >
      {grid.map((row, r) => (
        <View key={`r${r}`} style={styles.row}>
          {row.map((letter, c) => {
            const sel = isSelected(r, c);
            const found = isFound(r, c);
            const bg = sel ? '#22c55e' : found ? '#166534' : '#1e293b';
            const color = sel ? '#000' : '#fff';
            return (
              <View key={`${r}-${c}`} style={[styles.cell, { backgroundColor: bg }]}>
                <Text style={[styles.letter, { color }]}>{letter}</Text>
              </View>
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
