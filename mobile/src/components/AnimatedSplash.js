import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, Image, ImageBackground } from 'react-native';

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
            <Text style={styles.bigBrand}>WordQuest</Text>
            <View style={styles.tagPill}>
              <Text style={styles.tagPillText}>AI POWERED · WORLD THEMED</Text>
            </View>
          </Animated.View>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,80,80,0.55)' },

  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },

  logoStack: { alignItems: 'center', justifyContent: 'center', width: 180, height: 180 },
  outerRing: {
    position: 'absolute',
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 4, borderColor: 'rgba(252, 211, 21, 0.75)',
    borderStyle: 'dashed',
  },
  logoOuter: {
    width: 152, height: 152, borderRadius: 76,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 5, borderColor: '#a16207',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  logoInner: {
    width: 124, height: 124, borderRadius: 62,
    overflow: 'hidden',
    borderWidth: 4, borderColor: '#facc15',
  },
  logo: { width: '100%', height: '100%' },

  titleWrap: { marginTop: 22, alignItems: 'center' },
  plate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 28, paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  plateBrand: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  plateTag: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 2.5, marginTop: -2 },

  bigBrand: {
    color: '#bfdbfe', fontSize: 44, fontWeight: '900', marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 5,
  },
  tagPill: {
    marginTop: 8,
    backgroundColor: '#78350f',
    paddingHorizontal: 18, paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 2, borderColor: '#fbbf24',
  },
  tagPillText: { color: '#fef3c7', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
});
