import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '../utils/theme';

// Premium AI toast — pinned BELOW the game grid, well above the action
// buttons. Slides up from below with a soft glow.
export default function AgentThinking({ message, visible, duration = 2200 }) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(60)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const hideTimer = useRef(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (visible && message) {
      // Reset so consecutive messages replace cleanly without piling up.
      opacity.setValue(0);
      translateY.setValue(60);
      scale.setValue(0.95);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 110 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 30, duration: 260, useNativeDriver: true }),
        ]).start();
      }, duration);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, message, duration]);

  if (!message) return null;

  const accent = theme.accent;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrapper, { opacity, transform: [{ translateY }, { scale }] }]}
    >
      {/* outer glow band */}
      <View style={[styles.glowBand, { backgroundColor: accent, shadowColor: accent }]} />
      <View style={[styles.card, { borderColor: accent, shadowColor: accent }]}>
        {/* subtle inner accent rail at top */}
        <View style={[styles.innerRail, { backgroundColor: accent }]} />
        <View style={styles.row}>
          <View style={[styles.avatar, { borderColor: accent, backgroundColor: `${accent}22` }]}>
            <Text style={styles.avatarText}>🤖</Text>
          </View>
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: accent }]}>AI AGENT</Text>
              <View style={[styles.liveDot, { backgroundColor: accent, shadowColor: accent }]} />
            </View>
            <Text style={styles.message} numberOfLines={3}>{message}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Position below the action buttons area so it never overlaps the score
  // bar / timer or the grid.
  wrapper: {
    position: 'absolute',
    bottom: 110,
    left: 14,
    right: 14,
    zIndex: 999,
    elevation: 18,
  },
  glowBand: {
    position: 'absolute',
    top: -2, bottom: -2, left: -2, right: -2,
    borderRadius: 22,
    opacity: 0.14,
    shadowOpacity: 0.9, shadowRadius: 26, shadowOffset: { width: 0, height: 8 },
  },
  card: {
    backgroundColor: 'rgba(11, 18, 32, 0.97)',
    borderRadius: 18,
    paddingTop: 14, paddingBottom: 12, paddingHorizontal: 14,
    borderWidth: 1.5,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    overflow: 'hidden',
  },
  innerRail: {
    position: 'absolute',
    top: 0, left: 16, right: 16, height: 2.5,
    borderRadius: 2,
    opacity: 0.85,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginRight: 12,
  },
  avatarText: { fontSize: 22 },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  message: { color: '#f1f5f9', fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
});
