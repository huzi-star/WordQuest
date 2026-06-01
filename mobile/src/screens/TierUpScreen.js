import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions } from 'react-native';
import * as Speech from 'expo-speech';
import TierBadge from '../components/TierBadge';
import { TIERS, nextTier } from '../utils/tiers';
import { playSfx } from '../utils/sound';
import { markTierSeen } from '../utils/storage';
import { trace } from '../utils/trace';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---------- corner-burst confetti ----------
function CornerBurst({ origin, color }) {
  // 12 confetti pieces fan out from one corner.
  const pieces = useRef(
    Array.from({ length: 12 }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rot: new Animated.Value(0),
      opacity: new Animated.Value(1),
      angle: Math.random() * Math.PI * 0.5,  // quadrant fan
      distance: 180 + Math.random() * 200,
      duration: 1400 + Math.random() * 800,
      size: 8 + Math.random() * 8,
      shape: Math.random() > 0.5 ? '■' : '●',
    })),
  ).current;

  useEffect(() => {
    pieces.forEach((p) => {
      const dirX = (origin === 'tl' || origin === 'bl' ? 1 : -1);
      const dirY = (origin === 'tl' || origin === 'tr' ? 1 : -1);
      const targetX = Math.cos(p.angle) * p.distance * dirX;
      const targetY = Math.sin(p.angle) * p.distance * dirY;
      Animated.parallel([
        Animated.timing(p.x, { toValue: targetX, duration: p.duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(p.y, { toValue: targetY, duration: p.duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(p.rot, { toValue: 6, duration: p.duration, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: p.duration, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const pos =
    origin === 'tl' ? { top: 0, left: 0 } :
    origin === 'tr' ? { top: 0, right: 0 } :
    origin === 'bl' ? { bottom: 0, left: 0 } :
                      { bottom: 0, right: 0 };

  return (
    <View pointerEvents="none" style={[styles.cornerBurstWrap, pos]}>
      {pieces.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            color,
            fontSize: p.size,
            opacity: p.opacity,
            transform: [
              { translateX: p.x }, { translateY: p.y },
              { rotate: p.rot.interpolate({ inputRange: [0, 6], outputRange: ['0deg', '720deg'] }) },
            ],
          }}
        >{p.shape}</Animated.Text>
      ))}
    </View>
  );
}

// ---------- continuous falling confetti ----------
function FallingConfetti({ color, count = 30 }) {
  const pieces = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random() * SCREEN_W,
      y: new Animated.Value(-30 - Math.random() * 200),
      delay: Math.random() * 1500,
      duration: 2400 + Math.random() * 1800,
      size: 8 + Math.random() * 8,
      rotStart: Math.random() * 360,
      shape: ['■', '●', '★', '✦', '◆'][Math.floor(Math.random() * 5)],
      hue: [color, '#fff', '#fde047', '#86efac', '#f9a8d4'][Math.floor(Math.random() * 5)],
    })),
  ).current;

  useEffect(() => {
    // Bursts fall for ~3s then slow.
    pieces.forEach((p, i) => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(p.y, {
          toValue: SCREEN_H + 40,
          duration: i < count * 0.7 ? p.duration : p.duration * 1.8,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            color: p.hue,
            fontSize: p.size,
            transform: [{ translateY: p.y }, { rotate: `${p.rotStart}deg` }],
            textShadowColor: 'rgba(0,0,0,0.4)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}
        >{p.shape}</Animated.Text>
      ))}
    </View>
  );
}

// ---------- main screen ----------
export default function TierUpScreen({ route, navigation }) {
  const fromKey = route.params?.fromTier || 'bronze';
  const toKey = route.params?.toTier || 'silver';
  const returnTo = route.params?.returnTo || null;
  const returnParams = route.params?.returnParams || undefined;
  const to = TIERS.find((t) => t.key === toKey) || TIERS[1];
  const nxt = nextTier(to.key);

  async function handleContinue() {
    // Mark this tier as celebrated so we don't re-show on the next return.
    try { await markTierSeen(to.key); } catch (_) {}
    // Trace this milestone so /dashboard shows tier promotions in real time.
    trace('tier-up', `${fromKey} → ${toKey}`, { fromTier: fromKey, toTier: toKey });
    // Push to Supabase immediately so a syncDown can never overwrite the
    // flag back to a lower tier (which would re-trigger the celebration
    // every time the player returns to Home).
    try {
      // eslint-disable-next-line global-require
      const { supabase } = require('../utils/supabase');
      // eslint-disable-next-line global-require
      const { loadStats } = require('../utils/storage');
      if (supabase) {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (uid) {
          const fresh = await loadStats();
          // Read current preferences blob, then merge lastSeenTier.
          const { data: row } = await supabase
            .from('user_stats').select('preferences').eq('user_id', uid).maybeSingle();
          const merged = { ...(row?.preferences || {}), lastSeenTier: fresh.lastSeenTier || to.key };
          await supabase.from('user_stats')
            .update({ preferences: merged, updated_at: new Date().toISOString() })
            .eq('user_id', uid);
        }
      }
    } catch (_) {}
    if (returnTo) {
      navigation.replace(returnTo, returnParams);
    } else {
      navigation.goBack();
    }
  }

  // Animated values for entrance sequence.
  const screenFade = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeGlow = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(40)).current;
  const titleOp = useRef(new Animated.Value(0)).current;
  const subOp = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0)).current;
  const btnBounce = useRef(new Animated.Value(1)).current;
  const trophies = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const sparkleSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Fade in screen (200ms) — confetti is mounted immediately, bursting from corners.
    Animated.timing(screenFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    // 2. Trophies pop in one by one.
    Animated.stagger(150, trophies.map((t) =>
      Animated.spring(t, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
    )).start();

    // 3. Badge scales in with spring bounce (300ms delay).
    Animated.sequence([
      Animated.delay(300),
      Animated.spring(badgeScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      // 4. Badge glows once.
      Animated.timing(badgeGlow, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(badgeGlow, { toValue: 0.55, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ]).start();

    // 5. Title slides up + fades in (400ms delay).
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.spring(titleY, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(titleOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    // 6. Subtitle fades in (600ms delay).
    Animated.sequence([
      Animated.delay(600),
      Animated.timing(subOp, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // 7. Continue button bounces in (800ms delay).
    Animated.sequence([
      Animated.delay(800),
      Animated.spring(btnScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start(() => {
      // Persistent gentle bounce on the button.
      Animated.loop(Animated.sequence([
        Animated.timing(btnBounce, { toValue: 1.05, duration: 600, useNativeDriver: true }),
        Animated.timing(btnBounce, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])).start();
    });

    // Sparkle row loop.
    Animated.loop(
      Animated.timing(sparkleSpin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    ).start();

    playSfx('tierup', { volume: 0.9 });
    try {
      Speech.stop();
      Speech.speak(`Tier up! You are now ${to.name}. Congratulations!`, {
        language: 'en-US', rate: 0.95, pitch: 1.15,
      });
    } catch (_) {}
    return () => { try { Speech.stop(); } catch (_) {} };
  }, []);  // eslint-disable-line

  const tierColor = to.color || '#facc15';
  const tierAccent = to.accent || '#fde047';

  return (
    <Animated.View style={[styles.root, { backgroundColor: to.bg || '#0f172a', opacity: screenFade }]}>
      {/* Continuous falling confetti */}
      <FallingConfetti color={tierAccent} count={36} />

      {/* Corner bursts on entry */}
      <CornerBurst origin="tl" color={tierAccent} />
      <CornerBurst origin="tr" color={tierAccent} />
      <CornerBurst origin="bl" color={tierAccent} />
      <CornerBurst origin="br" color={tierAccent} />

      <View style={styles.center}>
        {/* Trophies row */}
        <View style={styles.trophyRow}>
          {[0, 1, 2].map((i) => (
            <Animated.Text
              key={i}
              style={[
                styles.trophy,
                { transform: [{ scale: trophies[i] }] },
                i === 1 && { fontSize: 44 },
              ]}
            >
              {i === 1 ? '🏆' : '⭐'}
            </Animated.Text>
          ))}
        </View>

        {/* Tier badge with spring bounce + glow halo */}
        <View style={styles.badgeStack}>
          <Animated.View
            style={[
              styles.glowHalo,
              {
                backgroundColor: tierAccent,
                opacity: badgeGlow,
                transform: [{ scale: badgeGlow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.3] }) }],
              },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: badgeScale }] }}>
            <View style={[styles.badgeRing, { borderColor: tierAccent, shadowColor: tierAccent }]}>
              <TierBadge tierKey={to.key} size={170} />
            </View>
          </Animated.View>
        </View>

        {/* Title — bubbly with tier-colored glow outline */}
        <Animated.Text
          style={[
            styles.title,
            {
              opacity: titleOp,
              transform: [{ translateY: titleY }],
              textShadowColor: tierAccent,
            },
          ]}
        >
          You reached {to.name}!
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text style={[styles.subtitle, { opacity: subOp }]}>
          {nxt
            ? `Keep going — ${nxt.name} is now unlocked!`
            : `You're at the top — Master tier reached!`}
        </Animated.Text>

        {/* Sparkle row */}
        <Animated.View
          style={[
            styles.sparkleRow,
            { transform: [{ rotate: sparkleSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
          ]}
        >
          <Text style={styles.sparkle}>✨</Text>
          <Text style={[styles.sparkle, { fontSize: 22 }]}>⭐</Text>
          <Text style={styles.sparkle}>✨</Text>
          <Text style={[styles.sparkle, { fontSize: 22 }]}>⭐</Text>
          <Text style={styles.sparkle}>✨</Text>
        </Animated.View>
      </View>

      {/* Continue button — pill, green, bouncing */}
      <View style={styles.actions}>
        <Animated.View style={{ transform: [{ scale: Animated.multiply(btnScale, btnBounce) }] }}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.continueBtn}
            onPress={handleContinue}
          >
            <Text style={styles.continueText}>Let's Go!  →</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  cornerBurstWrap: { position: 'absolute', width: 1, height: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingTop: 30 },

  trophyRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 18,
    marginBottom: 10,
  },
  trophy: { fontSize: 32 },

  badgeStack: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  glowHalo: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
  },
  badgeRing: {
    width: 220, height: 220, borderRadius: 110,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 6,
    shadowOpacity: 0.9, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 18,
  },

  title: {
    color: '#fff', fontSize: 30, fontWeight: '900',
    marginTop: 28, textAlign: 'center',
    letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16,
  },
  subtitle: {
    color: '#f1f5f9', fontSize: 15, fontWeight: '700',
    marginTop: 12, textAlign: 'center', lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
    paddingHorizontal: 10,
  },

  sparkleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 14, marginTop: 22,
  },
  sparkle: { fontSize: 18 },

  actions: { padding: 22, paddingBottom: 28 },
  continueBtn: {
    paddingVertical: 18, paddingHorizontal: 40,
    borderRadius: 999, alignItems: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 4, borderColor: '#fff',
    borderBottomWidth: 10, borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  continueText: {
    color: '#fff', fontWeight: '900', letterSpacing: 1.5, fontSize: 19,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
});
