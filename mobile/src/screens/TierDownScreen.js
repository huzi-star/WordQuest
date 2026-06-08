import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import { TIERS } from '../utils/tiers';

export default function TierDownScreen({ navigation, route }) {
  const { fromTier, toTier } = route.params || {};
  const from = TIERS.find((t) => t.key === fromTier) || TIERS[0];
  const to = TIERS.find((t) => t.key === toTier) || TIERS[0];

  const arrowDrop = useRef(new Animated.Value(-40)).current;
  const arrowOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const btnBob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(arrowOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(arrowDrop, {
          toValue: 0, duration: 700, useNativeDriver: true,
          easing: Easing.bounce,
        }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      ]),
      Animated.sequence([
        Animated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 5, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(btnBob, { toValue: -4, duration: 600, useNativeDriver: true }),
        Animated.timing(btnBob, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  function handleTryAgain() {
    const returnTo = route.params?.returnTo || 'Home';
    const returnParams = route.params?.returnParams;
    if (returnParams) navigation.replace(returnTo, returnParams);
    else navigation.replace(returnTo);
  }

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.redTint} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.body}>
          <Animated.Text
            style={[
              styles.arrow,
              { opacity: arrowOpacity, transform: [{ translateY: arrowDrop }] },
            ]}
          >
            ⬇
          </Animated.Text>

          <Text style={styles.titlePlate}>TIER DOWN</Text>

          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity,
                transform: [{ scale: cardScale }, { translateX: shake }],
              },
            ]}
          >
            <Text style={styles.sadEmoji}>😢</Text>
            <Text style={styles.dropText}>You dropped from</Text>
            <Text style={[styles.tierName, { color: from.accent }]}>
              {from.emoji} {from.name}
            </Text>
            <Text style={styles.arrowSmall}>⬇</Text>
            <Text style={[styles.tierName, { color: to.accent }]}>
              {to.emoji} {to.name}
            </Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>
              Earn points to climb back up to {from.name}!
            </Text>
          </Animated.View>

          <Animated.View style={{ transform: [{ translateY: btnBob }], marginTop: 28 }}>
            <TouchableOpacity
              style={styles.tryBtn}
              activeOpacity={0.85}
              onPress={handleTryAgain}
            >
              <Text style={styles.tryText}>↻ TRY AGAIN</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  redTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(80,10,10,0.78)' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  arrow: {
    fontSize: 80, color: '#ef4444', marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 6,
  },
  titlePlate: {
    backgroundColor: '#7f1d1d',
    color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 4,
    paddingHorizontal: 26, paddingVertical: 10,
    borderRadius: 18, borderWidth: 3, borderColor: '#ef4444',
    borderBottomWidth: 7, borderBottomColor: '#450a0a',
    marginBottom: 20, overflow: 'hidden',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },

  card: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 3, borderColor: '#ef4444',
    borderBottomWidth: 9, borderBottomColor: '#7f1d1d',
    borderRadius: 22, padding: 22, alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  sadEmoji: { fontSize: 56, marginBottom: 8 },
  dropText: { color: '#fecaca', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  tierName: {
    fontSize: 28, fontWeight: '900', marginVertical: 4,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  arrowSmall: { color: '#ef4444', fontSize: 24, fontWeight: '900', marginVertical: 2 },
  divider: { height: 1, alignSelf: 'stretch', backgroundColor: 'rgba(239,68,68,0.3)', marginVertical: 12 },
  subtitle: {
    color: '#fde68a', fontSize: 13, fontWeight: '700',
    textAlign: 'center', lineHeight: 19,
  },

  tryBtn: {
    paddingVertical: 16, paddingHorizontal: 44, borderRadius: 999,
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#14532d',
    shadowColor: '#22c55e',
    shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  tryText: {
    color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
});
