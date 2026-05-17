import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, Image } from 'react-native';

// Cinematic splash screen: logo zooms in with sparkle particles, then fades
// out after ~1.6 s.
export default function AnimatedSplash({ onDone }) {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(titleOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(sparkle, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      onDone && onDone();
    });
  }, []);

  const sparkleScale = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] });
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <View style={[styles.blob, { top: -120, right: -100, backgroundColor: '#22c55e' }]} />
      <View style={[styles.blob, { bottom: -120, left: -100, backgroundColor: '#a78bfa' }]} />

      <Animated.View style={[styles.logoWrap, { transform: [{ scale }], opacity }]}>
        <Image source={require('../../app-logo.jpeg')} style={styles.logo} />
        <Animated.View
          style={[
            styles.sparkleRing,
            { transform: [{ scale: sparkleScale }], opacity: sparkleOpacity },
          ]}
        />
      </Animated.View>

      <Animated.View style={[styles.titleWrap, { opacity: titleOpacity }]}>
        <Text style={styles.brand}>WordQuest</Text>
        <Text style={styles.tag}>AI POWERED · PAKISTAN THEMED</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070b14',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999,
  },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.2 },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 2, borderColor: '#22c55e',
  },
  sparkleRing: {
    position: 'absolute',
    width: 170, height: 170, borderRadius: 85,
    borderWidth: 2, borderColor: '#22c55e',
  },
  titleWrap: { marginTop: 24, alignItems: 'center' },
  brand: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: 1 },
  tag: { color: '#86efac', fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: 6 },
});
