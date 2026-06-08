// AppLogo.js — polished WordQuest brand mark.
//
// Renders the app-logo.jpeg inside a layered medallion: an outer slowly
// rotating gold sparkle ring (quest feel), a warm halo, a double gold
// border, and a soft up/down float on the disc itself. Auto-scales to
// the device width so it looks balanced from iPhone SE through tablets.

import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, Easing, Text } from 'react-native';
import { rs } from '../utils/responsive';

const LOGO_SRC = require('../../app-logo.jpeg');

export default function AppLogo({ size = 110, floating = true, glow = true, style }) {
  const float = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (floating) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, {
            toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
          }),
          Animated.timing(float, {
            toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
          }),
        ]),
      ).start();
    }
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true,
      }),
    ).start();
  }, [floating]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const D = rs(size);
  const ringW = Math.max(3, Math.round(D * 0.035));
  const halo = D + rs(28);
  const sparkleD = D + rs(18);

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY }] }, style]}>
      {glow ? (
        <View
          style={[
            styles.halo,
            { width: halo, height: halo, borderRadius: halo / 2 },
          ]}
        />
      ) : null}
      {/* Slowly rotating sparkle ring (quest aura) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sparkleRing,
          {
            width: sparkleD, height: sparkleD, borderRadius: sparkleD / 2,
            transform: [{ rotate }],
          },
        ]}
      >
        <Text style={[styles.spark, styles.sparkTop]}>✦</Text>
        <Text style={[styles.spark, styles.sparkRight]}>✦</Text>
        <Text style={[styles.spark, styles.sparkBottom]}>✦</Text>
        <Text style={[styles.spark, styles.sparkLeft]}>✦</Text>
      </Animated.View>
      <View
        style={[
          styles.disc,
          {
            width: D, height: D, borderRadius: D / 2,
            borderWidth: ringW,
          },
        ]}
      >
        <View
          style={[
            styles.innerRing,
            { width: D - ringW * 2, height: D - ringW * 2, borderRadius: (D - ringW * 2) / 2 },
          ]}
        >
          <Image
            source={LOGO_SRC}
            style={{
              width: D - ringW * 4, height: D - ringW * 4,
              borderRadius: (D - ringW * 4) / 2,
            }}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(252, 211, 77, 0.22)',
    shadowColor: '#fcd34d', shadowOpacity: 0.8, shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 }, elevation: 18,
  },
  sparkleRing: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    color: '#fde68a',
    fontSize: 14, fontWeight: '900',
    textShadowColor: '#f59e0b',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  sparkTop:    { top: 0 },
  sparkBottom: { bottom: 0 },
  sparkLeft:   { left: 0 },
  sparkRight:  { right: 0 },
  disc: {
    backgroundColor: '#0b1220',
    borderColor: '#fcd34d',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#fcd34d', shadowOpacity: 0.55, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 14,
    overflow: 'hidden',
  },
  innerRing: {
    backgroundColor: '#0b1220',
    borderWidth: 2, borderColor: '#fbbf24',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
});
