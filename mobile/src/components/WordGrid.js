import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder, Animated } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const GRID_HPAD = 12;

function computeCell(gridSize) {
  // Leave a little horizontal padding (12 each side). Each cell has 1px
  // margin all round so total stride is CELL + 2.
  const usable = SCREEN_W - GRID_HPAD * 2;
  const cell = Math.floor(usable / gridSize) - 2;
  return { CELL: Math.max(20, cell), CELL_WITH_MARGIN: Math.max(22, cell + 2) };
}

function Cell({ letter, sel, found, hinted, justFound, delay, size, fontSize }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (justFound) {
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, friction: 3, tension: 120 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      ]).start();
    }
  }, [justFound, delay]);

  const bg = sel ? '#22c55e' : found ? '#166534' : hinted ? '#7c2d12' : '#1e293b';
  const color = sel ? '#000' : hinted && !found ? '#fdba74' : '#fff';
  return (
    <Animated.View
      style={[
        styles.cellBase,
        { width: size, height: size, backgroundColor: bg, transform: [{ scale }] },
      ]}
    >
      <Text style={[styles.letterBase, { color, fontSize }]}>{letter}</Text>
    </Animated.View>
  );
}

export default function WordGrid({
  grid = [],
  onCellEnter,
  onSelectionEnd,
  selectedCells = [],
  foundCells = [],
  justFoundCells = [],
  hintedCells = [],
}) {
  const gridSize = grid.length || 8;
  const { CELL, CELL_WITH_MARGIN } = useMemo(() => computeCell(gridSize), [gridSize]);
  const fontSize = Math.max(13, Math.floor(CELL * 0.45));

  const gridRef = useRef(null);
  const originRef = useRef({ x: 0, y: 0 });
  const lastCellRef = useRef(null);
  const gestureCountRef = useRef(0);

  const propsRef = useRef({});
  propsRef.current = { grid, onCellEnter, onSelectionEnd, CELL_WITH_MARGIN };

  const measure = () => {
    if (gridRef.current && gridRef.current.measure) {
      gridRef.current.measure((x, y, w, h, pageX, pageY) => {
        if (typeof pageX === 'number' && typeof pageY === 'number') {
          originRef.current = { x: pageX, y: pageY };
        }
      });
    }
  };

  const pointToCell = (evt) => {
    const g = propsRef.current.grid;
    if (!g || !g.length) return null;
    const stride = propsRef.current.CELL_WITH_MARGIN;
    const ne = evt.nativeEvent;
    const relX = ne.pageX - originRef.current.x;
    const relY = ne.pageY - originRef.current.y;
    const c = Math.floor(relX / stride);
    const r = Math.floor(relY / stride);
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

  useEffect(() => {
    const t1 = setTimeout(measure, 100);
    const t2 = setTimeout(measure, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [gridSize]);

  const isSelected = (r, c) => selectedCells.some((s) => s.r === r && s.c === c);
  const isFound = (r, c) => foundCells.some((s) => s.r === r && s.c === c);
  const isHinted = (r, c) => hintedCells.some((s) => s.r === r && s.c === c);
  const justFoundIndex = (r, c) => justFoundCells.findIndex((s) => s.r === r && s.c === c);

  // Path-line segments between consecutive selected cells.
  const segments = [];
  for (let i = 1; i < selectedCells.length; i++) {
    const a = selectedCells[i - 1];
    const b = selectedCells[i];
    const horiz = a.r === b.r;
    const startC = Math.min(a.c, b.c);
    const startR = Math.min(a.r, b.r);
    if (horiz) {
      segments.push({
        key: `h${i}`,
        style: {
          left: startC * CELL_WITH_MARGIN + CELL_WITH_MARGIN / 2,
          top: a.r * CELL_WITH_MARGIN + CELL_WITH_MARGIN / 2 - 5,
          width: CELL_WITH_MARGIN,
          height: 10,
        },
      });
    } else {
      segments.push({
        key: `v${i}`,
        style: {
          left: a.c * CELL_WITH_MARGIN + CELL_WITH_MARGIN / 2 - 5,
          top: startR * CELL_WITH_MARGIN + CELL_WITH_MARGIN / 2,
          width: 10,
          height: CELL_WITH_MARGIN,
        },
      });
    }
  }

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
            const hinted = isHinted(r, c);
            const jfIdx = justFoundIndex(r, c);
            return (
              <Cell
                key={`${r}-${c}`}
                letter={letter}
                sel={sel}
                found={found}
                hinted={hinted}
                justFound={jfIdx >= 0}
                delay={jfIdx >= 0 ? jfIdx * 70 : 0}
                size={CELL}
                fontSize={fontSize}
              />
            );
          })}
        </View>
      ))}

      {segments.map((seg) => (
        <View
          key={seg.key}
          pointerEvents="none"
          style={[styles.line, seg.style]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { alignSelf: 'center', padding: 0, position: 'relative' },
  row: { flexDirection: 'row' },
  cellBase: {
    margin: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  letterBase: { fontWeight: 'bold' },
  line: {
    position: 'absolute',
    backgroundColor: 'rgba(250, 204, 21, 0.75)',
    borderRadius: 5,
    zIndex: -1,
  },
});
