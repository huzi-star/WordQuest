import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { TIERS } from '../utils/tiers';

const BY_KEY = Object.fromEntries(TIERS.map((t) => [t.key, t]));

export default function TierBadge({ tierKey = 'bronze', size = 84, animated = true, showLabel = true }) {
  const t = BY_KEY[tierKey] || TIERS[0];
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={[styles.wrap, { width: size + 24 }]}>
      <Animated.View
        style={[
          styles.glow,
          { width: size + 24, height: size + 24, borderRadius: (size + 24) / 2, backgroundColor: t.accent, opacity: glowOpacity },
        ]}
      />
      <Animated.View
        style={[
          styles.badge,
          {
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: t.color, borderColor: t.accent,
            transform: [{ scale }],
          },
        ]}
      >
        <Text style={{ fontSize: size * 0.5 }}>{t.emoji}</Text>
      </Animated.View>
      {showLabel ? (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Text style={[styles.label, { color: t.accent }]}>{t.name.toUpperCase()}</Text>
          {t.cefr ? (
            <View style={[styles.cefrPill, { borderColor: t.accent }]}>
              <Text style={[styles.cefrText, { color: t.accent }]}>{t.cefr} · {t.cefrLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  badge: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  cefrPill: {
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cefrText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
});
