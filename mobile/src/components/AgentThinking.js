import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';

// A premium AI message card that slides in from the bottom and fades out.
// Slightly taller, with an avatar circle, two-line text, and a soft shadow.
export default function AgentThinking({ message, visible, duration = 2400 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (visible && message) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
      const hideId = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 30, duration: 380, useNativeDriver: true }),
        ]).start();
      }, duration);
      return () => clearTimeout(hideId);
    }
  }, [visible, message, duration]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>🤖</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>AI Agent</Text>
        <Text style={styles.message} numberOfLines={3}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 28,
    left: 14,
    right: 14,
    backgroundColor: '#0b1220',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
    // Soft glow effect via shadow.
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
    marginRight: 12,
  },
  avatarText: { fontSize: 22 },
  body: { flex: 1 },
  title: { color: '#22c55e', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  message: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
