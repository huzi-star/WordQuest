import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/auth';
import { loadStats } from '../utils/storage';
import { tierForScore, TIERS } from '../utils/tiers';
import { battleJoinQueue, battleCancelQueue, battleGetMatch } from '../utils/api';
import { trace } from '../utils/trace';
import TierBadge from '../components/TierBadge';
import { playSfx } from '../utils/sound';

const BG = require('../../home_design/home_bg.jpeg');

export default function BattleQueueScreen({ navigation }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('idle'); // idle | queued | matched
  const [tier, setTier] = useState(TIERS[0]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const widenRef = useRef(false);
  const spin = useRef(new Animated.Value(0)).current;
  const cancelledRef = useRef(false);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    return () => spin.stopAnimation();
  }, [spin]);

  async function start() {
    cancelledRef.current = false;
    setError(null);
    setElapsed(0);
    const s = await loadStats();
    const t = tierForScore(s?.totalScoreEver || 0);
    setTier(t);

    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Player';
    const palette = ['#7c3aed', '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#06b6d4', '#facc15'];
    let h = 0; for (let i = 0; i < (user?.id || '').length; i++) h = (h * 31 + user.id.charCodeAt(i)) >>> 0;
    const avatarColor = palette[h % palette.length];

    setPhase('queued');
    const r = await battleJoinQueue({ userId: user.id, tier: t.key, displayName, avatarColor });
    if (cancelledRef.current) return;
    if (!r?.ok) { setError(r?.error || 'Could not join queue'); setPhase('idle'); return; }
    if (r.status === 'matched' && r.matchId) {
      gotoMatch(r.matchId);
      return;
    }
    // Poll for a match.
    pollForMatch(t.key, displayName, avatarColor);
  }

  async function pollForMatch(tierKey, displayName, avatarColor) {
    const begin = Date.now();
    while (!cancelledRef.current) {
      setElapsed(Math.floor((Date.now() - begin) / 1000));
      // After 8s widen the MMR band to ±400 to speed things up.
      if (!widenRef.current && Date.now() - begin > 8000) widenRef.current = true;
      const r = await battleJoinQueue({
        userId: user.id, tier: tierKey, displayName, avatarColor, widen: widenRef.current,
      });
      if (cancelledRef.current) return;
      if (r?.ok && r.status === 'matched' && r.matchId) {
        gotoMatch(r.matchId);
        return;
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
  }

  function gotoMatch(matchId) {
    playSfx('battle_match', { volume: 0.9 });
    trace('battle-queue', `matched · ${String(matchId).slice(0,8)}…`, { matchId }, { userId: user?.id });
    navigation.replace('Battle', { matchId });
  }

  async function cancel() {
    cancelledRef.current = true;
    if (user?.id) await battleCancelQueue(user.id);
    setPhase('idle');
    setElapsed(0);
  }

  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.titlePlate}>
            <Text style={styles.titlePlateText}>1v1 BATTLE</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.center}>
          <Animated.View style={[styles.ring, { borderColor: tier.accent, transform: [{ rotate: rot }] }]}>
            <View style={[styles.inner, { backgroundColor: tier.bg, borderColor: tier.accent }]}>
              <TierBadge tierKey={tier.key} size={120} animated={false} showLabel={false} />
            </View>
          </Animated.View>

          <View style={styles.infoCard}>
            <Text style={styles.title}>
              {phase === 'queued' ? 'Finding an opponent…' : 'Ready to Battle?'}
            </Text>
            <Text style={styles.subtitle}>
              {phase === 'queued'
                ? `Matching ${tier.name} tier · ${elapsed}s`
                : 'Same puzzle. 60 seconds. Most words wins.'}
            </Text>
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </View>

          {phase === 'idle' ? (
            <TouchableOpacity activeOpacity={0.9} style={styles.findBtn} onPress={start}>
              <Text style={styles.findBtnText}>⚔  FIND MATCH</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.9} style={styles.cancelBtn} onPress={cancel}>
              <Text style={styles.cancelBtnText}>Cancel Search</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  safe: { flex: 1 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
  },
  titlePlateText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 },
  ring: {
    width: 210, height: 210, borderRadius: 105,
    borderWidth: 5, alignItems: 'center', justifyContent: 'center',
    borderStyle: 'dashed',
  },
  inner: {
    width: 170, height: 170, borderRadius: 85,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4,
  },

  infoCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20, paddingHorizontal: 20, paddingVertical: 16,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#0f172a',
    alignItems: 'center', maxWidth: 320,
  },
  title: {
    color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  subtitle: { color: '#cbd5e1', fontSize: 13, marginTop: 6, textAlign: 'center', fontWeight: '700' },
  err: { color: '#fca5a5', marginTop: 10, fontSize: 13, fontWeight: '700' },

  findBtn: {
    paddingVertical: 18, paddingHorizontal: 38, borderRadius: 999,
    backgroundColor: '#dc2626',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#7f1d1d',
    shadowColor: '#dc2626', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  findBtnText: {
    color: '#fff', fontWeight: '900', letterSpacing: 1.5, fontSize: 17,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  cancelBtn: {
    paddingVertical: 16, paddingHorizontal: 32, borderRadius: 999,
    backgroundColor: 'rgba(127,29,29,0.5)',
    borderWidth: 3, borderColor: '#fca5a5',
    borderBottomWidth: 7, borderBottomColor: '#450a0a',
  },
  cancelBtnText: { color: '#fecaca', fontWeight: '900', letterSpacing: 1, fontSize: 15 },
});
