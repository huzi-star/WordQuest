import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../utils/auth';
import { loadStats } from '../utils/storage';
import { fetchTierLeaderboard } from '../utils/api';
import { TIERS, tierForScore } from '../utils/tiers';
import TierBadge from '../components/TierBadge';

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

  // Auto-scroll the tier tab row so the active tier is always visible — without
  // this, players in Diamond/Elite/Master tier can't see/tap their own tab.
  useEffect(() => {
    const layout = tabLayouts.current[activeTier];
    if (layout && tabScrollRef.current) {
      const x = Math.max(0, layout.x - 60);
      tabScrollRef.current.scrollTo({ x, animated: true });
    }
  }, [activeTier]);

  const tier = TIERS.find((t) => t.key === activeTier) || TIERS[0];
  const isMyTier = tierForScore(myScore).key === tier.key;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#4c1d95' }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏆 Tier Leaderboard</Text>
        <Text style={styles.subtitle}>Top 25 players per tier</Text>
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
          const myTier = tierForScore(myScore);
          const locked = t.rank > myTier.rank;
          return (
            <TouchableOpacity
              key={t.key}
              onLayout={(e) => { tabLayouts.current[t.key] = e.nativeEvent.layout; }}
              onPress={() => !locked && setActiveTier(t.key)}
              activeOpacity={locked ? 1 : 0.7}
              style={[
                styles.tab,
                activeTier === t.key && !locked && { backgroundColor: t.color, borderColor: t.accent },
                locked && { opacity: 0.45 },
              ]}
            >
              <Text style={styles.tabEmoji}>{locked ? '🔒' : t.emoji}</Text>
              <Text style={[styles.tabText, activeTier === t.key && !locked && { color: '#fff' }]}>{t.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.tierHero, { backgroundColor: tier.bg, borderColor: tier.accent }]}>
        <TierBadge tierKey={tier.key} size={64} animated={isMyTier} showLabel={false} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.heroName}>{tier.name}</Text>
          <Text style={styles.heroRange}>
            {tier.minScore}{' '}–{' '}
            {TIERS[tier.rank]?.minScore - 1 ?? '∞'} points
          </Text>
          {isMyTier ? (
            <Text style={[styles.heroMine, { color: tier.accent }]}>You are here · {myScore} pts</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
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

      {data.me && data.me.rank > 25 ? (
        <View style={[styles.meFooter, { borderColor: tier.accent }]}>
          {data.aboveMe ? (
            <Text style={styles.meCompete}>
              {data.aboveMe.displayName} is ahead with {data.aboveMe.totalScore} pts — just{' '}
              {Math.max(1, (data.aboveMe.totalScore - data.me.totalScore))} more to overtake!
            </Text>
          ) : null}
          <Text style={[styles.meFooterText, { color: tier.accent }]}>Your rank: #{data.me.rank} · {data.me.totalScore} pts</Text>
        </View>
      ) : isMyTier && data.aboveMe && data.me ? (
        <View style={[styles.meFooter, { borderColor: tier.accent }]}>
          <Text style={styles.meCompete}>
            {data.aboveMe.displayName} is just {Math.max(1, data.aboveMe.totalScore - data.me.totalScore)} pts ahead — go!
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
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
  header: { paddingHorizontal: 20, paddingBottom: 6 },
  backBtn: { paddingVertical: 6 },
  backText: { color: '#94a3b8', fontWeight: '700' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  tabScroll: { flexGrow: 0, maxHeight: 54 },
  tabRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8, alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.85)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)', marginRight: 8,
    flexShrink: 0,
  },
  tabEmoji: { fontSize: 13 },
  tabText: { color: '#94a3b8', fontWeight: '800', fontSize: 11, letterSpacing: 0.4 },

  tierHero: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 14, borderRadius: 18, borderWidth: 2,
    marginBottom: 12,
  },
  heroName: { color: '#fff', fontSize: 20, fontWeight: '900' },
  heroRange: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  heroMine: { fontWeight: '800', marginTop: 6, fontSize: 12 },

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
