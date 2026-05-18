import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View, Dimensions } from 'react-native';
import { useTheme } from '../utils/theme';

// A premium AI toast that pinned at the TOP of the screen.
// Replaces the previous popup with no stacking (always takes over the slot).
// Reads accent color from active theme.
export default function AgentThinking({ message, visible, duration = 2200 }) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-100)).current;
  const hideTimer = useRef(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (visible && message) {
      // Reset instantly so multiple successive messages don't pile on top of
      // each other — they replace.
      opacity.setValue(0);
      translateY.setValue(-100);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 100 }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -50, duration: 260, useNativeDriver: true }),
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
      style={[
        styles.wrapper,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={[styles.card, { borderColor: accent, shadowColor: accent }]}>
        <View style={[styles.glowDot, { backgroundColor: accent, shadowColor: accent }]} />
        <View style={[styles.avatar, { borderColor: accent, backgroundColor: `${accent}1f` }]}>
          <Text style={styles.avatarText}>🤖</Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: accent }]}>AI AGENT</Text>
          <Text style={styles.message} numberOfLines={3}>{message}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    zIndex: 999,
    elevation: 16,
  },
  card: {
    backgroundColor: 'rgba(11, 18, 32, 0.96)',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  glowDot: {
    position: 'absolute',
    top: -3,
    left: 22,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginRight: 11,
  },
  avatarText: { fontSize: 20 },
  body: { flex: 1 },
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 1 },
  message: { color: '#f1f5f9', fontSize: 13, fontWeight: '600', lineHeight: 17 },
});
