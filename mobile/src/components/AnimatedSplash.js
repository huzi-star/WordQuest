import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, Image, ImageBackground } from 'react-native';
import { rs, rfs } from '../utils/responsive';

const BG = require('../../home_design/home_bg.jpeg');
const LOGO = require('../../app-logo.jpeg');

// Cinematic splash — cartoonish 3D look matching the Auth screen.
export default function AnimatedSplash({ onDone }) {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(titleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => { onDone && onDone(); });

    Animated.loop(
      Animated.timing(ringSpin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }),
    ).start();
  }, []);

  const spin = ringSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tealTint} />

        <View style={styles.inner}>
          <Animated.View style={[styles.logoStack, { transform: [{ scale }], opacity }]}>
            <Animated.View style={[styles.outerRing, { transform: [{ rotate: spin }] }]} />
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Image source={LOGO} style={styles.logo} />
              </View>
            </View>
          </Animated.View>

          <Animated.View style={[styles.titleWrap, { opacity: titleOpacity }]}>
            <View style={styles.plate}>
              <Text style={styles.plateBrand}>WordQuest</Text>
              <Text style={styles.plateTag}>BUILD YOUR MIND</Text>
            </View>
            <Text style={styles.brand}>WordQuest</Text>
            <View style={styles.brandPill}>
              <Text style={styles.brandPillText}>AI POWERED · WORLD THEMED</Text>
            </View>
          </Animated.View>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a' },
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.65)' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  logoStack: {
    width: rs(220), height: rs(220),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: rs(18),
  },
  outerRing: {
    position: 'absolute', width: rs(220), height: rs(220), borderRadius: rs(110),
    borderWidth: 5, borderColor: '#facc15',
    borderStyle: 'dashed',
  },
  logoOuter: {
    width: rs(170), height: rs(170), borderRadius: rs(85),
    backgroundColor: '#facc15',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 6, borderColor: '#fff',
    shadowColor: '#facc15', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  logoInner: {
    width: rs(150), height: rs(150), borderRadius: rs(75),
    backgroundColor: '#92400e',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#fff',
    overflow: 'hidden',
  },
  logo: { width: rs(150), height: rs(150), borderRadius: rs(75) },

  titleWrap: { alignItems: 'center' },

  plate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 9, borderBottomColor: '#451a03',
    alignItems: 'center',
    marginBottom: 14,
  },
  plateBrand: {
    color: '#fff', fontSize: rfs(22), fontWeight: '900', letterSpacing: 1.2,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  plateTag: {
    color: '#fde68a', fontSize: rfs(10), fontWeight: '900', letterSpacing: 2, marginTop: 4,
  },

  brand: {
    color: '#e2e8f0', fontSize: rfs(38), fontWeight: '900', letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 6,
    marginBottom: 8,
  },
  brandPill: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#92400e',
    borderWidth: 2, borderColor: '#fbbf24',
    borderBottomWidth: 5, borderBottomColor: '#451a03',
  },
  brandPillText: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
});
