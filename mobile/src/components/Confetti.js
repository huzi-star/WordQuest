import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DEFAULT_EMOJIS = ['🎉', '✨', '⭐', '💫', '🎊', '🏆', '🇵🇰', '🥳', '🪅', '🎈', '🌟', '💚', '🎆'];

function Particle({ delay, emojis }) {
  const fall = useRef(new Animated.Value(0)).current;
  const swayBase = useMemo(() => (Math.random() - 0.5) * 80, []);
  const startX = useMemo(() => Math.random() * SCREEN_W, []);
  const emoji = useMemo(() => emojis[Math.floor(Math.random() * emojis.length)], []);
  const rotateBase = useMemo(() => (Math.random() - 0.5) * 360, []);

  useEffect(() => {
    Animated.timing(fall, {
      toValue: 1,
      duration: 1800 + Math.random() * 600, // ~2 - 2.5s total
      delay,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-40, SCREEN_H + 40] });
  const translateX = fall.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, swayBase, -swayBase] });
  const rotate = fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${rotateBase}deg`] });
  const opacity = fall.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: startX,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
    </Animated.View>
  );
}

export default function Confetti({ visible, count = 40, duration = 2400, emojis = DEFAULT_EMOJIS, onDone }) {
  const seedRef = useRef(0);
  useEffect(() => {
    if (visible) {
      seedRef.current += 1;
      const t = setTimeout(() => onDone && onDone(), duration);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;
  const seed = seedRef.current;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {Array.from({ length: count }).map((_, i) => (
        <Particle key={`${seed}-${i}`} delay={i * 40} emojis={emojis} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  particle: { position: 'absolute', top: 0 },
  emoji: { fontSize: 28 },
});
