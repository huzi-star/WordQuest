import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../utils/auth';
import { loadStats } from '../utils/storage';
import { fetchTierLeaderboard } from '../utils/api';
import { TIERS, tierForScore } from '../utils/tiers';
import TierBadge from '../components/TierBadge';
import { supabase } from '../utils/supabase';
import { rfs, IS_SMALL } from '../utils/responsive';

const BG = require('../../home_design/home_bg.jpeg');

export default function TierLeaderboardScreen({ navigation }) {
  const { user } = useAuth();
  const [activeTier, setActiveTier] = useState('bronze');
  const [data, setData] = useState({ top: [], me: null, aboveMe: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const tabScrollRef = useRef(null);
  const tabLayouts = useRef({});

  // On focus, pick the user's own tier as default.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadStats();
        if (cancelled) return;
        const score = s.totalScoreEver || 0;
        setMyScore(score);
        setActiveTier(tierForScore(score).key);
      })();
      return () => { cancelled = true; };
    }, []),
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const r = await fetchTierLeaderboard(activeTier, user?.id);
    if (r?.ok) setData({ top: r.top || [], me: r.me || null, aboveMe: r.aboveMe || null });
    else setData({ top: [], me: null, aboveMe: null });
    setLoading(false);
    setRefreshing(false);
  }, [activeTier, user?.id]);

  useEffect(() => { load(); }, [load]);

  // REAL-TIME RANKING — subscribe to any score change in the leaderboard
  // table for the active tier. When a row updates we silently reload so
  // ranks shift up/down live as players earn / lose points (e.g. a Quick
  // Play penalty drops someone below the tier's minScore, the row count
  // shrinks and ranks recompute in front of the kid).
  useEffect(() => {
    if (!supabase) return undefined;
    let ch;
    try {
      ch = supabase
        .channel(`tier-${activeTier}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wq_user_leaderboard' },
          () => { load(true); },
        )
        .subscribe();
    } catch (_) { /* realtime disabled or table missing — fall back to pull-to-refresh */ }
    // Soft polling fallback every 12s in case realtime is unavailable on
    // the player's network — keeps the screen "alive" even on cellular.
    const poll = setInterval(() => { load(true); }, 12000);
    return () => {
      try { if (ch && supabase) supabase.removeChannel(ch); } catch (_) {}
      clearInterval(poll);
    };
  }, [activeTier, load]);

  // Auto-scroll the tier tab row so the active tier sits roughly in
  // the centre of the visible window. Without this, players in
  // Diamond/Elite/Master tier can't see their own tab when it lives at
  // the far right. We wait a frame after layout reports so onLayout has
  // measured every tab — guarantees the scroll math has real widths to
  // work with on every device size.
  useEffect(() => {
    const t = setTimeout(() => {
      const layout = tabLayouts.current[activeTier];
      if (!layout || !tabScrollRef.current) return;
      const { Dimensions } = require('react-native');
      const screenW = Dimensions.get('window').width;
      const x = Math.max(0, layout.x + layout.width / 2 - screenW / 2);
      tabScrollRef.current.scrollTo({ x, animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [activeTier]);

  const tier = TIERS.find((t) => t.key === activeTier) || TIERS[0];
  const myTier = tierForScore(myScore);
  const isMyTier = myTier.key === tier.key;
  // A tier is "locked" for the kid if they have NOT yet reached it. Tabs
  // are still tappable — instead of a ranking the screen shows a warm
  // chain-of-tiers message telling them which tier(s) to finish first.
  const locked = tier.rank > myTier.rank;

  return (
    <ImageBackground source={BG} style={{ flex: 1 }} resizeMode="cover">
      <View style={styles.bgTint} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.titlePlate}>
            <Text style={styles.title}>🏆 Tier Leaderboard</Text>
            <Text style={styles.subtitle}>Pick a tier to peek inside</Text>
          </View>
        </View>

        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabRow}
          bounces
        >
          {TIERS.map((t) => {
            const tabLocked = t.rank > myTier.rank;
            const isActive = activeTier === t.key;
            // Bulletproof tab styling for every Android skin (Infinix XOS,
            // MIUI, OneUI, etc.). textShadow was being rendered as a solid
            // fill that blacked out the glyph on some OEM fonts, making
            // tier labels invisible for the player's current + past tiers.
            // We drop textShadow entirely and rely on a solid dark fill
            // behind every tab so white text always has high contrast.
            return (
              <TouchableOpacity
                key={t.key}
                onLayout={(e) => { tabLayouts.current[t.key] = e.nativeEvent.layout; }}
                onPress={() => setActiveTier(t.key)}
                activeOpacity={0.8}
                style={[
                  styles.tab,
                  isActive
                    ? { backgroundColor: t.color, borderColor: '#fff', borderBottomColor: t.accent }
                    : { backgroundColor: 'rgba(15,23,42,0.85)', borderColor: t.accent, borderBottomColor: 'rgba(0,0,0,0.55)' },
                ]}
              >
                <Text style={styles.tabEmoji} allowFontScaling={false}>
                  {tabLocked ? '🔒' : t.emoji}
                </Text>
                <Text
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                >
                  {t.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={[styles.tierHero, { backgroundColor: tier.color, borderColor: tier.accent }]}>
          <TierBadge tierKey={tier.key} size={IS_SMALL ? 54 : 64} animated={isMyTier} showLabel={false} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.heroName}>{tier.name} {tier.emoji}</Text>
            <Text style={styles.heroRange}>
              {tier.minScore} – {TIERS[tier.rank]?.minScore ? (TIERS[tier.rank].minScore - 1) : '∞'} points
            </Text>
            {isMyTier ? (
              <Text style={styles.heroMine}>✨ You are here · {myScore} pts</Text>
            ) : locked ? (
              <Text style={styles.heroLockedHint}>🔒 Locked — see how to unlock</Text>
            ) : (
              <Text style={styles.heroPastHint}>You climbed past this · {myScore} pts</Text>
            )}
          </View>
        </View>

        {locked ? (
          // LOCKED-TIER SCREEN — kid-safe motivational chain ("finish X
          // first, then Y, then this one"). NO ranking shown.
          <LockedTierMessage tier={tier} myTier={myTier} myScore={myScore} />
        ) : loading ? (
          <ActivityIndicator color={tier.accent} style={{ marginTop: 40 }} size="large" />
        ) : data.top.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>👻</Text>
            <Text style={styles.emptyTitle}>No players in {tier.name} yet</Text>
            <Text style={styles.emptySub}>Be the first to climb!</Text>
          </View>
        ) : (
          <FlatList
            data={data.top}
            keyExtractor={(item) => String(item.userId)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#fff" />}
            renderItem={({ item }) => (
              <Row row={item} isMe={item.userId === user?.id} accent={tier.accent} />
            )}
          />
        )}

        {!locked && data.me && data.me.rank > 25 ? (
          <View style={[styles.meFooter, { borderColor: tier.accent }]}>
            {data.aboveMe ? (
              <Text style={styles.meCompete}>
                {data.aboveMe.displayName} is ahead with {data.aboveMe.totalScore} pts — just{' '}
                {Math.max(1, (data.aboveMe.totalScore - data.me.totalScore))} more to overtake!
              </Text>
            ) : null}
            <Text style={[styles.meFooterText, { color: tier.accent }]}>Your rank: #{data.me.rank} · {data.me.totalScore} pts</Text>
          </View>
        ) : !locked && isMyTier && data.aboveMe && data.me ? (
          <View style={[styles.meFooter, { borderColor: tier.accent }]}>
            <Text style={styles.meCompete}>
              {data.aboveMe.displayName} is just {Math.max(1, data.aboveMe.totalScore - data.me.totalScore)} pts ahead — go!
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    </ImageBackground>
  );
}

// Friendly, kid-safe message when a player taps a tier they haven't
// reached yet. Lists every tier BELOW the target they still need to
// finish. The chain ("Bronze → Silver → Gold first") explains the order.
function LockedTierMessage({ tier, myTier, myScore }) {
  const chain = TIERS.filter((t) => t.rank > myTier.rank && t.rank < tier.rank);
  const previous = TIERS.find((t) => t.rank === tier.rank - 1) || TIERS[0];
  const pointsNeeded = Math.max(0, (previous.minScore || 0) + ((tier.minScore - (previous.minScore || 0))) - myScore);
  return (
    <ScrollView contentContainerStyle={styles.lockedWrap}>
      <View style={styles.lockedHero}>
        <Text style={styles.lockedEmoji}>🔒</Text>
        <Text style={styles.lockedTitle}>{tier.name} tier is still locked</Text>
        <Text style={styles.lockedSub}>
          Finish <Text style={{ color: previous.accent, fontWeight: '900' }}>{previous.name}</Text> first, then this tier opens for you.
        </Text>
      </View>

      <View style={styles.chainCard}>
        <Text style={styles.chainTitle}>YOUR PATH TO {tier.name.toUpperCase()}</Text>
        <View style={styles.chainRow}>
          <Pill label={`You · ${myTier.name}`} color={myTier.color} accent={myTier.accent} />
          <Text style={styles.chainArrow}>›</Text>
          {chain.map((t, i) => (
            <React.Fragment key={t.key}>
              <Pill label={t.name} color={t.color} accent={t.accent} />
              {i < chain.length || chain.length === 0 ? <Text style={styles.chainArrow}>›</Text> : null}
            </React.Fragment>
          ))}
          <Pill label={tier.name} color={tier.color} accent={tier.accent} highlight />
        </View>
        <Text style={styles.chainHint}>
          Keep playing Quick Play, 1v1 and Continue Learning — points add up automatically and your tier climbs.
        </Text>
      </View>

    </ScrollView>
  );
}

function Pill({ label, color, accent, highlight }) {
  return (
    <View style={[styles.pill, { backgroundColor: color, borderColor: accent }, highlight && styles.pillHighlight]}>
      <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Row({ row, isMe, accent }) {
  const initials = (row.displayName || '?').slice(0, 2).toUpperCase();
  const isTop3 = row.rank <= 3;
  return (
    <View style={[styles.row, isMe && { backgroundColor: 'rgba(168,85,247,0.18)', borderColor: accent }]}>
      <Text style={[styles.rankBig, isTop3 && styles.rankBigTop3]}>{row.rank}</Text>
      <View style={[styles.avatar, { backgroundColor: row.avatarColor || '#7c3aed' }]}>
        {row.avatarUrl
          ? <Image source={{ uri: row.avatarUrl }} style={styles.avatarPhoto} />
          : row.avatarEmoji
            ? <Text style={styles.avatarEmoji}>{row.avatarEmoji}</Text>
            : <Text style={styles.avatarText}>{initials}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.username} numberOfLines={1}>{row.displayName}{isMe ? ' (you)' : ''}</Text>
        <Text style={styles.metaLine}>High {row.highScore} · {row.totalGames} games</Text>
      </View>
      <View style={styles.scorePill}>
        <Text style={styles.starIcon}>⭐</Text>
        <Text style={styles.scoreNum}>{row.totalScore}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bgTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(76,29,149,0.78)' },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#4c1d95',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlate: { flex: 1 },
  title: {
    color: '#fff', fontSize: rfs(22), fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  subtitle: { color: '#fbcfe8', fontSize: rfs(11), marginTop: 2, fontWeight: '800', letterSpacing: 0.4 },

  tabScroll: { flexGrow: 0, height: 60 },
  tabRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 10, alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    minWidth: 88,
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 4,
    flexShrink: 0,
  },
  tabEmoji: { fontSize: 16 },
  tabText: {
    color: '#ffffff', fontWeight: '900', fontSize: 13,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  tabTextActive: { fontSize: 14, color: '#ffffff' },

  tierHero: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 14, borderRadius: 22,
    borderWidth: 3, borderBottomWidth: 9, borderBottomColor: 'rgba(0,0,0,0.45)',
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  heroName: {
    color: '#fff', fontSize: rfs(22), fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  heroRange: { color: 'rgba(255,255,255,0.88)', fontSize: rfs(12), marginTop: 2, fontWeight: '700' },
  heroMine: {
    color: '#fef9c3', fontWeight: '900', marginTop: 6, fontSize: rfs(12),
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  heroLockedHint: { color: '#fbcfe8', fontWeight: '900', marginTop: 6, fontSize: rfs(12) },
  heroPastHint: { color: '#bbf7d0', fontWeight: '900', marginTop: 6, fontSize: rfs(12) },

  // Locked-tier screen
  lockedWrap: { padding: 16, paddingBottom: 60 },
  lockedHero: {
    alignItems: 'center', padding: 22, borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#facc15',
    borderBottomWidth: 9, borderBottomColor: '#78350f',
    marginBottom: 14,
  },
  lockedEmoji: { fontSize: 60 },
  lockedTitle: {
    color: '#fff', fontSize: rfs(20), fontWeight: '900', marginTop: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  lockedSub: {
    color: '#fde68a', fontSize: rfs(13), marginTop: 8, textAlign: 'center', fontWeight: '700', lineHeight: 19,
  },
  chainCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 18, padding: 14,
    borderWidth: 3, borderColor: '#38bdf8',
    borderBottomWidth: 7, borderBottomColor: '#082f49',
    marginBottom: 14,
  },
  chainTitle: { color: '#7dd3fc', fontWeight: '900', fontSize: rfs(11), letterSpacing: 1.2, marginBottom: 10 },
  chainRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chainArrow: { color: '#fcd34d', fontSize: 22, fontWeight: '900' },
  chainHint: { color: '#bae6fd', fontSize: rfs(12), marginTop: 12, lineHeight: 18, fontWeight: '700' },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 2, borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.4)',
  },
  pillHighlight: {
    shadowColor: '#fcd34d', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  pillText: {
    color: '#fff', fontWeight: '900', fontSize: rfs(11), letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  tipsCard: {
    backgroundColor: 'rgba(20,83,45,0.85)',
    borderRadius: 18, padding: 14,
    borderWidth: 3, borderColor: '#22c55e',
    borderBottomWidth: 7, borderBottomColor: '#14532d',
  },
  tipTitle: { color: '#bbf7d0', fontWeight: '900', fontSize: rfs(13), marginBottom: 4 },
  tipText: { color: '#dcfce7', fontSize: rfs(13), lineHeight: 19, fontWeight: '600' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 22, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  rankBig: {
    color: '#fff', fontWeight: '900', fontSize: 26, width: 50, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  rankBigTop3: { color: '#facc15', fontSize: 30 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarEmoji: { fontSize: 22 },
  avatarPhoto: { width: '100%', height: '100%' },
  username: {
    color: '#fff', fontWeight: '900', fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
  },
  metaLine: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2, fontWeight: '700' },
  scorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  starIcon: { fontSize: 14 },
  scoreNum: { color: '#facc15', fontWeight: '900', fontSize: 15 },

  empty: { alignItems: 'center', padding: 50 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 12 },
  emptySub: { color: '#94a3b8', fontSize: 12, marginTop: 4 },

  meFooter: { margin: 16, padding: 14, borderRadius: 14, borderWidth: 2, alignItems: 'center', backgroundColor: '#0f172a' },
  meCompete: { color: '#cbd5e1', fontSize: 12, textAlign: 'center', marginBottom: 6 },
  meFooterText: { fontWeight: '900', letterSpacing: 0.5 },
});
