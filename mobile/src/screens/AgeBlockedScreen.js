import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ImageBackground, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabase';
import { useSettings } from '../utils/settings';

const BG = require('../../home_design/home_bg.jpeg');

// Gentle floating sad-star/wilted-flower decorations.
function GentleFloat() {
  const items = useRef(
    Array.from({ length: 12 }, () => ({
      x: Math.random() * 100,
      y: new Animated.Value(Math.random() * 800),
      delay: Math.random() * 4000,
      size: 12 + Math.random() * 14,
      char: ['☆', '✿', '❀', '·', '✾', '✧'][Math.floor(Math.random() * 6)],
      color: ['#c4b5fd', '#fda4af', '#fdba74', '#a5b4fc', '#f9a8d4'][Math.floor(Math.random() * 5)],
    })),
  ).current;

  useEffect(() => {
    const loops = items.map((a) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(a.delay),
          Animated.timing(a.y, {
            toValue: -80, duration: 11000 + Math.random() * 5000,
            easing: Easing.linear, useNativeDriver: true,
          }),
          Animated.timing(a.y, { toValue: 900, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((a, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute', left: `${a.x}%`,
            transform: [{ translateY: a.y }],
            color: a.color, fontSize: a.size, opacity: 0.5,
          }}
        >{a.char}</Animated.Text>
      ))}
    </View>
  );
}

export default function AgeBlockedScreen({ navigation }) {
  const { update: updateSettings } = useSettings();
  const [busy, setBusy] = useState(false);

  // Friendly bounce of the apologetic owl character.
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, []);
  const ty = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });

  async function leave() {
    if (busy) return;
    setBusy(true);
    try {
      // 1. Wait for Supabase sign-out to fully complete before navigating —
      //    otherwise the rooted Auth screen would still see the old user.
      if (supabase) {
        try { await supabase.auth.signOut(); } catch (_) {}
      }
      // 2. Clear the cached DOB / onboarding flags so the user truly starts
      //    over (preventing the age guard from re-triggering on next sign-up).
      try { await updateSettings({ dob: null, hasSeenOnboarding: false }); } catch (_) {}
      try {
        await AsyncStorage.multiRemove([
          'wq_settings_v1', 'wq_onboarding_seen', 'wq_stats_v3',
        ]);
      } catch (_) {}
    } finally {
      setBusy(false);
      // 3. Reset the stack to Auth in signup mode so the user lands directly
      //    on the registration form.
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Auth', params: { initialMode: 'signup' } }],
        }),
      );
    }
  }

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <GentleFloat />
      {/* Soft glowing background orbs */}
      <View style={[styles.orb, { backgroundColor: '#a855f7', top: -120, right: -90 }]} />
      <View style={[styles.orb, { backgroundColor: '#fb7185', bottom: -150, left: -110, opacity: 0.16 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.center}>
          {/* Cartoon owl with apologetic sign */}
          <Animated.View style={[styles.charWrap, { transform: [{ translateY: ty }] }]}>
            <View style={styles.charOuter}>
              <View style={styles.charInner}>
                <Text style={styles.owl}>🦉</Text>
              </View>
            </View>
            <View style={styles.signPlate}>
              <Text style={styles.signEmoji}>🔒</Text>
              <Text style={styles.signText}>13 and under only</Text>
            </View>
          </Animated.View>

          {/* Title plaque */}
          <View style={styles.titlePlate}>
            <Text style={styles.title}>Oops! This Game is for Kids 🎮</Text>
          </View>

          <Text style={styles.body}>
            WordQuest is designed for children aged 13 and under. This account does not meet the age requirement.
          </Text>

          {/* Sign Out pill */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={leave}
            disabled={busy}
            style={[styles.signOutBtn, busy && { opacity: 0.7 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.signOutIcon}>🚪</Text>
                <Text style={styles.signOutText}>Sign Out & Try Again</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footnote}>We'd love to see you again with a kid's account ✨</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,10,45,0.82)' },
  orb: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.20 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },

  // Owl character
  charWrap: { alignItems: 'center', marginBottom: 24 },
  charOuter: {
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#fde68a',
    shadowColor: '#fbbf24', shadowOpacity: 0.7, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  charInner: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#1e1b4b',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  owl: { fontSize: 70 },

  // Apologetic sign hanging below the owl
  signPlate: {
    marginTop: -10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fde68a',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 6, borderBottomColor: '#92400e',
    transform: [{ rotate: '-4deg' }],
  },
  signEmoji: { fontSize: 16 },
  signText: { color: '#7c2d12', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },

  // Title
  titlePlate: {
    backgroundColor: '#581c87',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#c084fc',
    borderBottomWidth: 7, borderBottomColor: '#3b0764',
    marginTop: 8,
  },
  title: {
    color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: '#22c55e', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  body: {
    color: '#e2e8f0', fontSize: 15, textAlign: 'center', lineHeight: 22,
    marginTop: 16, maxWidth: 340, fontWeight: '600',
  },

  // Sign Out pill button
  signOutBtn: {
    marginTop: 36,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#fb7185',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#9f1239',
    shadowColor: '#fb7185', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  signOutIcon: { fontSize: 20 },
  signOutText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },

  footnote: { color: '#a5b4fc', fontSize: 11, marginTop: 20, fontWeight: '700', textAlign: 'center' },
});
