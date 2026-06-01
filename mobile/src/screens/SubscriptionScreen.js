import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ImageBackground, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/auth';
import { usePlan } from '../utils/plan';
import { cancelPlan } from '../utils/api';

const BG = require('../../home_design/home_bg.jpeg');

const NAMES = { free: 'Free', pro: 'Pro', pro_max: 'Pro Max' };
const COLORS = { free: '#64748b', pro: '#22c55e', pro_max: '#a855f7' };

export default function SubscriptionScreen({ navigation }) {
  const { user } = useAuth();
  const { plan, status, expiresAt, usage, features, refresh } = usePlan();
  const [busy, setBusy] = useState(false);

  async function onCancel() {
    Alert.alert(
      'Cancel subscription?',
      `You'll keep ${NAMES[plan]} until ${expiresAt ? new Date(expiresAt).toLocaleDateString() : 'expiry'}.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel plan', style: 'destructive', onPress: async () => {
          if (!user?.id) return;
          setBusy(true);
          await cancelPlan(user.id);
          await refresh();
          setBusy(false);
        }},
      ],
    );
  }

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backTxt}>← Back</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.heroCard, { backgroundColor: COLORS[plan], borderBottomColor: '#000' }]}>
            <Text style={styles.heroLabel}>YOUR PLAN</Text>
            <Text style={styles.heroPlan}>{NAMES[plan] || 'Free'}</Text>
            {status === 'trial' ? <Text style={styles.heroSub}>🎁 Trial — ends {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'soon'}</Text> : null}
            {status === 'active' && plan !== 'free' && expiresAt ? <Text style={styles.heroSub}>Renews on {new Date(expiresAt).toLocaleDateString()}</Text> : null}
            {status === 'cancelled' ? <Text style={styles.heroSub}>Ends {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'soon'}</Text> : null}
          </View>

          <Text style={styles.section}>TODAY'S USAGE</Text>
          <View style={styles.usageCard}>
            <UsageRow label="Quick Play" used={usage.quick_play} cap={features.qpPerDay} />
            <UsageRow label="Quiz" used={usage.quiz} cap={features.quizPerDay} />
            <UsageRow label="Daily Challenge" used={usage.daily} cap={features.dailyPerDay} />
          </View>

          <Text style={styles.section}>FEATURES</Text>
          <View style={styles.featCard}>
            <Feat label="Battle 1v1" on={features.battle} />
            <Feat label="Bronze to Master tiers" on={features.maxLevel >= 15} />
            <Feat label={`Learning units (${features.maxUnit}/32)`} on={features.maxUnit >= 32} />
            <Feat label="No ads" on={!features.ads} />
            <Feat label="TTS pronunciation" on={!!features.tts} />
            <Feat label="AI Tutor" on={!!features.aiTutor} />
            <Feat label="Parent dashboard" on={!!features.parentDashboard} />
          </View>

          {plan === 'free' || plan === 'pro' ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Paywall')} style={styles.upgradeBtn}>
              <Text style={styles.upgradeText}>{plan === 'free' ? '⭐ Upgrade to Pro' : '👑 Upgrade to Pro Max'}</Text>
            </TouchableOpacity>
          ) : null}

          {plan !== 'free' && status !== 'cancelled' ? (
            <TouchableOpacity activeOpacity={0.9} onPress={onCancel} style={styles.cancelBtn} disabled={busy}>
              <Text style={styles.cancelText}>Cancel subscription</Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function UsageRow({ label, used, cap }) {
  const unlim = cap < 0;
  const pct = unlim ? 0 : Math.min(1, (used || 0) / Math.max(1, cap));
  return (
    <View style={styles.usageRow}>
      <View style={styles.usageHeader}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usageValue}>{unlim ? '∞' : `${used || 0} / ${cap}`}</Text>
      </View>
      <View style={styles.usageTrack}>
        <View style={[styles.usageFill, { width: unlim ? '100%' : `${pct * 100}%`, backgroundColor: unlim ? '#22c55e' : pct >= 1 ? '#ef4444' : '#facc15' }]} />
      </View>
    </View>
  );
}

function Feat({ label, on }) {
  return (
    <View style={styles.featRow}>
      <Text style={[styles.featIcon, { color: on ? '#22c55e' : '#94a3b8' }]}>{on ? '✓' : '✗'}</Text>
      <Text style={[styles.featLabel, !on && { color: '#94a3b8' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)' },
  scroll: { padding: 14 },
  headerRow: { flexDirection: 'row' },
  backBtn: { padding: 6 },
  backTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },

  heroCard: {
    marginTop: 8, padding: 18, borderRadius: 22,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, alignItems: 'center',
  },
  heroLabel: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  heroPlan: {
    color: '#fff', fontSize: 38, fontWeight: '900', marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  heroSub: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 6, opacity: 0.9 },

  section: {
    color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1.5,
    marginTop: 16, marginBottom: 6, marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  usageCard: {
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 16, padding: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },
  usageRow: { marginBottom: 10 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  usageLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  usageValue: { color: '#fff', fontSize: 12, fontWeight: '900' },
  usageTrack: { height: 7, backgroundColor: '#1e293b', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  usageFill: { height: '100%', borderRadius: 4 },

  featCard: {
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  featIcon: { fontSize: 16, fontWeight: '900', width: 22 },
  featLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },

  upgradeBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 16, borderRadius: 999,
    alignItems: 'center', marginTop: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#14532d',
  },
  upgradeText: {
    color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },

  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  cancelText: { color: '#fca5a5', fontWeight: '800', fontSize: 13 },
});
