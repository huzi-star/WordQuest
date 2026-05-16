import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

// Floats upward + fades out over ~1.2s.
export default function ScorePopup({ text, x, y, color = '#22c55e', onDone }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(700),
        Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      Animated.timing(translateY, { toValue: -70, duration: 1200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1.1, useNativeDriver: true, friction: 5 }),
    ]).start(() => onDone && onDone());
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { left: x - 50, top: y - 30, opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      <Text style={[styles.text, { color }]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 100,
    alignItems: 'center',
    zIndex: 50,
  },
  text: {
    fontSize: 28,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
