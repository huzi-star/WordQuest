import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View, Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;

// Premium AI toast that slides DOWN from the top of the screen and fades out.
// Sits above the grid so it never blocks gameplay controls.
export default function AgentThinking({ message, visible, duration = 2400 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    if (visible && message) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 90 }),
      ]).start();
      const hideId = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -60, duration: 320, useNativeDriver: true }),
        ]).start();
      }, duration);
      return () => clearTimeout(hideId);
    }
  }, [visible, message, duration]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.glowDot} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🤖</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>AI AGENT</Text>
          <Text style={styles.message} numberOfLines={3}>{message}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 999,
    elevation: 16,
  },
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
  },
  glowDot: {
    position: 'absolute',
    top: -2,
    left: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
    marginRight: 12,
  },
  avatarText: { fontSize: 22 },
  body: { flex: 1 },
  title: { color: '#22c55e', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
  message: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
