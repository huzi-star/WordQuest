import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, ActivityIndicator, Alert, TextInput, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { upgradePlan, startTrial, applyCoupon } from '../utils/api';
import { useAuth } from '../utils/auth';
import { usePlan } from '../utils/plan';
import { trace } from '../utils/trace';

const BG = require('../../home_design/home_bg.jpeg');

// All "Levels" copy removed — the game uses Tiers (Bronze → Master) and
// Learning Units, not numbered levels.
const PLANS = [
  {
    key: 'free', name: 'FREE', icon: '⭐',
    monthly: 0, yearly: 0, currency: '₨',
    color: '#475569', shadow: '#0f172a', accent: '#94a3b8',
    bullets: [
      { c: '⭐', t: '5 Quick Play games / day' },
      { c: '🏰', t: 'Learning A1 stage (8 units)' },
      { c: '🥉', t: 'Bronze + Silver tiers' },
      { c: '💡', t: '1 hint per game' },
      { c: '📺', t: 'Shows ads' },
    ],
  },
  {
    key: 'pro', name: 'PRO', icon: '🚀',
    monthly: 299, yearly: 1999, currency: '₨',
    color: '#7c3aed', shadow: '#3b0764', accent: '#c4b5fd',
    popular: true,
    bestValue: true,
    bullets: [
      { c: '♾️', t: 'Unlimited Quick Play games' },
      { c: '⭐', t: 'Unlimited Daily Challenge' },
      { c: '❓', t: 'Unlimited Quiz Mode' },
      { c: '⚔️', t: '1v1 Battle Mode (MMR ranked)' },
      { c: '🏆', t: 'Bronze to Master tier progression' },
      { c: '🏰', t: 'A1 → A2 Learning (24 units)' },
      { c: '🚫', t: 'No ads · 5 hints per game' },
      { c: '🔊', t: 'Voice pronunciation (5 languages)' },
    ],
  },
  {
    key: 'pro_max', name: 'PRO MAX', icon: '👑',
    monthly: 599, yearly: 3999, currency: '₨',
    color: '#d97706', shadow: '#7c2d12', accent: '#fcd34d',
    bullets: [
      { c: '👑', t: 'Everything in Pro' },
      { c: '🏰', t: 'Full A1 → B1 Learning (32 units)' },
      { c: '📊', t: 'Parent dashboard + weekly email' },
      { c: '🤖', t: 'Personal AI Tutor (1-on-1 chat)' },
      { c: '🎖️', t: 'Achievement badges + rewards' },
      { c: '🎨', t: 'Custom avatars + nameplate' },
      { c: '📥', t: 'Offline mode' },
    ],
  },
];

// ------------------------------------------------------ floating coins/stars
function FloatingCoins() {
  const items = useRef(
    Array.from({ length: 16 }, () => ({
      x: Math.random() * 100,
      y: new Animated.Value(Math.random() * 800),
      delay: Math.random() * 4500,
      size: 12 + Math.random() * 14,
      char: ['🪙', '⭐', '✨', '★', '·'][Math.floor(Math.random() * 5)],
    })),
  ).current;
  useEffect(() => {
    const loops = items.map((a) =>
      Animated.loop(Animated.sequence([
        Animated.delay(a.delay),
        Animated.timing(a.y, {
          toValue: -80, duration: 10000 + Math.random() * 5000,
          easing: Easing.linear, useNativeDriver: true,
        }),
        Animated.timing(a.y, { toValue: 900, duration: 0, useNativeDriver: true }),
      ])),
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
            fontSize: a.size, opacity: 0.55,
          }}
        >{a.char}</Animated.Text>
      ))}
    </View>
  );
}

// ------------------------------------------------------------ main screen
export default function PaywallScreen({ navigation, route }) {
  const { user } = useAuth();
  const { plan: currentPlan, trialUsed, refresh } = usePlan();
  const reason = route.params?.reason || null;
  const [cycle, setCycle] = useState('monthly');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (reason) trace('paywall-hit', reason, {}, { userId: user?.id });
  }, []);

  async function pickPlan(key) {
    if (key === 'free' || !user?.id) { navigation.goBack(); return; }
    setBusy(key);
    const r = await upgradePlan(user.id, { plan: key, cycle });
    setBusy(null);
    if (r?.ok) {
      await refresh();
      trace('subscription', `upgrade → ${key} (${cycle})`, { plan: key, cycle }, { userId: user?.id });
      Alert.alert('🎉 Welcome to ' + (key === 'pro' ? 'Pro' : 'Pro Max') + '!', 'All premium features are now unlocked.');
      navigation.goBack();
    } else {
      trace('subscription', `upgrade failed → ${key}`, { plan: key, error: r?.error }, { userId: user?.id, status: 'error' });
      Alert.alert('Payment failed', r?.error || 'Try again in a moment.');
    }
  }

  async function redeemCoupon(planKey, code) {
    if (!user?.id) return;
    setBusy('coupon_' + planKey);
    const r = await applyCoupon(user.id, code);
    setBusy(null);
    if (r?.ok) {
      await refresh();
      trace('subscription', `coupon → ${planKey}`, { plan: planKey, coupon: code }, { userId: user?.id });
      Alert.alert('🎁 Coupon applied!', `${planKey === 'pro' ? 'Pro' : 'Pro Max'} activated for 7 days.`);
      navigation.goBack();
    } else {
      Alert.alert('Invalid code', r?.error || 'This coupon does not match this plan.');
    }
  }

  async function pickTrial() {
    if (!user?.id || trialUsed) return;
    setBusy('trial');
    const r = await startTrial(user.id);
    setBusy(null);
    if (r?.ok) {
      await refresh();
      trace('subscription', 'trial-started (Pro 7-day)', { plan: 'pro', trial: true }, { userId: user?.id });
      Alert.alert('✨ 7-day Pro trial started!', 'Enjoy all Pro features free for a week.');
      navigation.goBack();
    } else {
      Alert.alert('Trial failed', r?.error || 'Try again later.');
    }
  }

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      {/* All decorative overlays must opt out of touch — otherwise the
          absolute-positioned tint + orbs sit ON TOP of the ScrollView and
          eat single-finger drag events, which is why one-finger scroll was
          stuck while two fingers (pinch-like) bypassed the responder. */}
      <View style={styles.tint} pointerEvents="none" />
      <FloatingCoins />
      <View style={[styles.orb, { backgroundColor: '#a855f7', top: -120, right: -100 }]} pointerEvents="none" />
      <View style={[styles.orb, { backgroundColor: '#f59e0b', bottom: -140, left: -100, opacity: 0.18 }]} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled
          nestedScrollEnabled
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          removeClippedSubviews={false}
          scrollEventThrottle={16}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
          </View>

          <Text style={styles.title}>Choose Your Plan ⚡</Text>
          {reason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ) : null}
          <Text style={styles.tagline}>Unlock tiers, battles, and the full Learning journey</Text>

          {/* Cycle toggle */}
          <View style={styles.cycleToggle}>
            <TouchableOpacity onPress={() => setCycle('monthly')} style={[styles.cycleBtn, cycle === 'monthly' && styles.cycleBtnActive]}>
              <Text style={[styles.cycleText, cycle === 'monthly' && styles.cycleTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCycle('yearly')} style={[styles.cycleBtn, cycle === 'yearly' && styles.cycleBtnActive]}>
              <Text style={[styles.cycleText, cycle === 'yearly' && styles.cycleTextActive]}>Yearly</Text>
              <View style={styles.savePill}><Text style={styles.savePillText}>SAVE 40%</Text></View>
            </TouchableOpacity>
          </View>

          {/* Plan cards */}
          {PLANS.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              cycle={cycle}
              isCurrent={currentPlan === p.key}
              busy={busy === p.key}
              couponBusy={busy === 'coupon_' + p.key}
              onPick={() => pickPlan(p.key)}
              onCoupon={(code) => redeemCoupon(p.key, code)}
            />
          ))}

          {/* Free trial CTA */}
          {!trialUsed && currentPlan === 'free' ? (
            <TouchableOpacity activeOpacity={0.9} onPress={pickTrial} style={styles.trialBtn} disabled={busy === 'trial'}>
              {busy === 'trial'
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.trialText}>✨ Try Pro Free for 7 days</Text>}
            </TouchableOpacity>
          ) : null}

          {/* Cancel-anytime footnote with shield */}
          <View style={styles.footnoteRow}>
            <Text style={styles.shieldIcon}>🛡️</Text>
            <Text style={styles.footnoteText}>Cancel anytime in Settings · auto-renews</Text>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ------------------------------------------------------------ plan card
function PlanCard({ plan, cycle, isCurrent, busy, couponBusy, onPick, onCoupon }) {
  const price = cycle === 'yearly' ? plan.yearly : plan.monthly;
  const [code, setCode] = useState('');
  const showCoupon = plan.key !== 'free';

  // Shimmer pulse on the recommended (Pro) card.
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!plan.bestValue) return;
    Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(shimmer, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ])).start();
  }, []);
  const shimmerShadow = shimmer.interpolate({ inputRange: [0, 1], outputRange: [6, 22] });
  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: plan.color,
          borderBottomColor: plan.shadow,
          borderColor: plan.bestValue ? '#fde047' : '#fff',
          shadowColor: plan.bestValue ? '#fde047' : '#000',
          shadowOpacity: plan.bestValue ? shimmerOpacity : 0.3,
          shadowRadius: plan.bestValue ? shimmerShadow : 6,
          shadowOffset: { width: 0, height: 6 },
          elevation: plan.bestValue ? 16 : 6,
          transform: [{ scale: plan.bestValue ? 1.03 : 1 }],
        },
      ]}
    >
      {/* BEST VALUE ribbon */}
      {plan.bestValue ? (
        <View style={styles.bestValuePill}>
          <Text style={styles.bestValueText}>⭐ BEST VALUE</Text>
        </View>
      ) : plan.popular ? (
        <View style={styles.popularPill}><Text style={styles.popularText}>★ POPULAR</Text></View>
      ) : null}

      {/* Current plan badge */}
      {isCurrent ? (
        <View style={styles.currentPill}>
          <Text style={styles.currentText}>Your Plan ✓</Text>
        </View>
      ) : null}

      {/* Icon circle */}
      <View style={styles.iconCircleWrap}>
        <View style={[styles.iconCircle, { borderColor: plan.accent }]}>
          <Text style={styles.iconText}>{plan.icon}</Text>
        </View>
      </View>

      {/* Name */}
      <Text style={styles.cardName}>{plan.name}</Text>

      {/* Features */}
      <View style={styles.bulletList}>
        {plan.bullets.map((b, i) => (
          <View key={i} style={styles.bulletRow}>
            <View style={[styles.checkCircle, { backgroundColor: plan.accent }]}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <Text style={styles.bulletEmoji}>{b.c}</Text>
            <Text style={styles.bulletText}>{b.t}</Text>
          </View>
        ))}
      </View>

      {/* Price */}
      <View style={styles.priceBox}>
        {price > 0 ? (
          <>
            <Text style={styles.priceText}>{plan.currency} {price}</Text>
            <Text style={styles.priceCycle}>/ {cycle === 'yearly' ? 'year' : 'month'}</Text>
          </>
        ) : (
          <Text style={styles.priceText}>FREE</Text>
        )}
      </View>

      {/* CTA */}
      <TouchableOpacity
        activeOpacity={0.9}
        delayPressIn={80}
        onPress={onPick}
        disabled={isCurrent || busy}
        style={[
          styles.cardBtn,
          { borderBottomColor: plan.shadow },
          isCurrent && { opacity: 0.5 },
        ]}
      >
        {busy
          ? <ActivityIndicator color={plan.color} />
          : <Text style={[styles.cardBtnText, { color: plan.color }]}>
              {isCurrent
                ? '✓ Current plan'
                : plan.key === 'free'
                  ? 'Continue free'
                  : 'Get ' + plan.name + '  →'}
            </Text>}
      </TouchableOpacity>

      {/* Coupon */}
      {showCoupon ? (
        <View style={styles.couponBox}>
          <Text style={styles.couponLabel}>🎁 Have a coupon? Get 7 days free</Text>
          <View style={styles.couponRow}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter code"
              placeholderTextColor="rgba(255,255,255,0.55)"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.couponInput}
            />
            <TouchableOpacity
              activeOpacity={0.9}
              delayPressIn={80}
              onPress={() => onCoupon(code)}
              disabled={!code || couponBusy}
              style={[styles.couponBtn, (!code || couponBusy) && { opacity: 0.6 }]}
            >
              {couponBusy
                ? <ActivityIndicator color={plan.color} />
                : <Text style={[styles.couponBtnText, { color: plan.color }]}>Apply</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,10,45,0.78)' },
  orb: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.22 },

  scroll: { padding: 14, paddingTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },

  title: {
    color: '#fde68a', fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 4,
    letterSpacing: 0.5,
    textShadowColor: '#7c3aed', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10,
  },
  reasonBox: {
    marginTop: 10, padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(252,211,77,0.18)',
    borderWidth: 2, borderColor: '#fde047',
  },
  reasonText: { color: '#fde68a', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  tagline: { color: '#e2e8f0', fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 10, fontWeight: '700' },

  cycleToggle: {
    flexDirection: 'row', padding: 4,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 999, marginBottom: 14,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  cycleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  cycleBtnActive: {
    backgroundColor: '#facc15',
    borderWidth: 2, borderColor: '#fff',
  },
  cycleText: { color: '#cbd5e1', fontWeight: '900', fontSize: 13 },
  cycleTextActive: { color: '#78350f' },
  savePill: { backgroundColor: '#22c55e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  savePillText: { color: '#fff', fontWeight: '900', fontSize: 8 },

  // Card
  card: {
    borderRadius: 24, padding: 16, marginBottom: 18, marginTop: 10,
    borderWidth: 3,
    borderBottomWidth: 9,
    alignItems: 'center',
  },
  bestValuePill: {
    position: 'absolute', top: -14, alignSelf: 'center',
    backgroundColor: '#facc15',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: '#a16207',
    zIndex: 10,
  },
  bestValueText: { color: '#78350f', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  popularPill: {
    position: 'absolute', top: -10, right: 14,
    backgroundColor: '#fbbf24',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 2, borderColor: '#fff',
  },
  popularText: { color: '#78350f', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  currentPill: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: '#22c55e',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  currentText: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },

  iconCircleWrap: { marginTop: 6, marginBottom: 8 },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4,
  },
  iconText: { fontSize: 36 },

  cardName: {
    color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },

  bulletList: { width: '100%', marginTop: 12, gap: 6 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  checkMark: { color: '#0f172a', fontWeight: '900', fontSize: 12 },
  bulletEmoji: { fontSize: 16, width: 22, textAlign: 'center' },
  bulletText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },

  priceBox: {
    marginTop: 14, flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  priceText: {
    color: '#fff', fontSize: 28, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  priceCycle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginLeft: 4 },

  cardBtn: {
    marginTop: 14, paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 999, alignSelf: 'stretch', alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  cardBtnText: { fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },

  couponBox: {
    width: '100%', marginTop: 12, padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
  },
  couponLabel: { color: '#fff', fontSize: 11, fontWeight: '900', marginBottom: 6 },
  couponRow: { flexDirection: 'row', gap: 6 },
  couponInput: {
    flex: 1, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    color: '#1e293b', fontWeight: '900', letterSpacing: 1,
    borderWidth: 2, borderColor: '#fff',
  },
  couponBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    minWidth: 70,
  },
  couponBtnText: { fontWeight: '900', fontSize: 13 },

  trialBtn: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 16, borderRadius: 999,
    alignItems: 'center', marginTop: 6,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#0c4a6e',
    shadowColor: '#0ea5e9', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  trialText: {
    color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },

  footnoteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  shieldIcon: { fontSize: 14 },
  footnoteText: { color: '#cbd5e1', fontSize: 10, fontWeight: '700', flex: 1, textAlign: 'center' },
});
