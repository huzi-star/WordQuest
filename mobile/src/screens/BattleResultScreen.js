import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing, ImageBackground, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/auth';
import { battleGetMatch } from '../utils/api';
import { supabase } from '../utils/supabase';
import { trace } from '../utils/trace';
import Confetti from '../components/Confetti';

const BG = require('../../home_design/home_bg.jpeg');
const PALETTE = { text: '#f4f6fb', muted: '#cbd5e1', win: '#22c55e', lose: '#ef4444', draw: '#f59e0b' };

export default function BattleResultScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const { user } = useAuth();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState({ me: null, opp: null });
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    try { navigation.setOptions({ gestureEnabled: false }); } catch (_) {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Poll until status=done.
      for (let i = 0; i < 30 && !cancelled; i++) {
        const r = await battleGetMatch(matchId);
        if (r?.ok && r.match?.status === 'done') {
          setMatch(r.match);
          // Pull both players' avatar profiles for the victory card.
          try {
            if (supabase) {
              const ids = [r.match.player_a, r.match.player_b].filter(Boolean);
              const { data: rows } = await supabase
                .from('wq_user_leaderboard')
                .select('user_id, avatar_color, avatar_emoji, avatar_url')
                .in('user_id', ids);
              const byId = {};
              (rows || []).forEach((x) => { byId[x.user_id] = x; });
              const myId = r.match.player_a === user?.id ? r.match.player_a : r.match.player_b;
              const oppId = myId === r.match.player_a ? r.match.player_b : r.match.player_a;
              if (!cancelled) setProfiles({ me: byId[myId] || null, opp: byId[oppId] || null });
            }
          } catch (_) {}
          // Trace the final outcome so /dashboard's Battle tab shows wins/losses.
          const winner = r.match?.winnerUserId;
          const outcome = !winner ? 'draw' : winner === user?.id ? 'win' : 'loss';
          trace('battle-result', `${outcome} · match ${String(matchId).slice(0,8)}…`, {
            matchId, outcome, winnerUserId: winner,
          }, { userId: user?.id });
          break;
        }
        if (r?.ok) setMatch(r.match);
        await new Promise((res) => setTimeout(res, 1500));
      }
      setLoading(false);
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  if (loading || !match) {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tealTint} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <ActivityIndicator color={PALETTE.win} size="large" />
            <Text style={styles.loadingText}>Calculating result…</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const isA = match.player_a === user.id;
  const result = match.result || {};
  const meSide = isA ? 'a' : 'b';
  const oppSide = isA ? 'b' : 'a';
  const winSide = result.winner;
  const isWin = winSide === meSide;
  const isLoss = winSide === oppSide;
  const isDraw = !winSide;

  const headerColor = isWin ? PALETTE.win : isLoss ? PALETTE.lose : PALETTE.draw;
  const headerText = isWin ? 'VICTORY!' : isLoss ? 'DEFEAT' : 'DRAW';
  const headerEmoji = isWin ? '🏆' : isLoss ? '💔' : '🤝';
  const tintColor = isWin ? 'rgba(11,61,23,0.78)' : isLoss ? 'rgba(59,10,10,0.78)' : 'rgba(58,44,5,0.78)';
  const myName = isA ? match.display_a : match.display_b;
  const oppName = isA ? match.display_b : match.display_a;
  const myColor = isA ? match.avatar_a : match.avatar_b;
  const oppColor = isA ? match.avatar_b : match.avatar_a;
  const me = result[meSide] || {};
  const opp = result[oppSide] || {};

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={[styles.tealTint, { backgroundColor: tintColor }]} />
      <SafeAreaView style={styles.safe}>
        {isWin ? <Confetti visible count={70} duration={3000} /> : null}
        <ScrollView contentContainerStyle={styles.center} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.headlinePlate, { borderColor: headerColor, transform: [{ scale }] }]}>
            <Text style={styles.headlineEmoji}>{headerEmoji}</Text>
            <Text style={[styles.headline, { color: '#fff' }]}>{headerText}</Text>
          </Animated.View>
          {/* Clear, prominent banner for the loser — match-over moment. */}
          {isLoss ? (
            <Text style={styles.lossBanner}>
              {oppName} won the match!
            </Text>
          ) : null}
          {/* rewardAgent line on a win · coachAgent line on a loss · friendly fallback on draw */}
          <Text style={styles.sub}>
            {isWin
              ? (result.winnerLine || 'Well played!')
              : isLoss
                ? (result.loserLine || 'Keep practising!')
                : 'A close one!'}
          </Text>
          {/* Speed-bonus chip — only the winner sees it, only if they earned anything. */}
          {isWin && result.speedBonus ? (
            <View style={styles.speedChip}>
              <Text style={styles.speedChipText}>
                ⚡ Speed bonus +{result.speedBonus} pts · finished in {result.elapsedSec}s
              </Text>
            </View>
          ) : null}

          <View style={styles.cards}>
            <ScoreCard name={myName} color={myColor} avatarUrl={profiles.me?.avatar_url} avatarEmoji={profiles.me?.avatar_emoji} score={me.score} words={me.words} mmrDelta={me.mmrDelta} newMmr={me.newMmr} highlight={isWin ? '#22c55e' : null} />
            <View style={styles.vsDivider}>
              <Text style={styles.vsDividerText}>VS</Text>
            </View>
            <ScoreCard name={oppName} color={oppColor} avatarUrl={profiles.opp?.avatar_url} avatarEmoji={profiles.opp?.avatar_emoji} score={opp.score} words={opp.words} mmrDelta={opp.mmrDelta} newMmr={opp.newMmr} highlight={isLoss ? '#ef4444' : null} />
          </View>

          <View style={styles.mmrPlate}>
            <Text style={styles.mmrLine}>
              {me.mmrDelta >= 0 ? '+' : ''}{me.mmrDelta || 0} MMR · You're now at {me.newMmr || '—'}
            </Text>
          </View>

          {/* COACH AGENT — long-term-memory diagnosis on a LOSS only.
              Shows the next 3 rounds the agent recommends + how to fix
              the weaknesses it spotted from the last 10 games. */}
          {isLoss && result.coach && Array.isArray(result.coach.howToFix) && result.coach.howToFix.length ? (
            <View style={styles.coachCard}>
              <Text style={styles.coachLabel}>🎓 COACH · WHAT TO FIX</Text>
              {result.coach.howToFix.map((tip, i) => (
                <Text key={'fix' + i} style={styles.coachFix}>↳ {tip}</Text>
              ))}
            </View>
          ) : null}

          {isLoss && result.coach && Array.isArray(result.coach.nextRounds) && result.coach.nextRounds.length ? (
            <View style={styles.coachCard}>
              <Text style={styles.coachLabel}>📋 NEXT 3 ROUNDS — PERSONALISED PLAN</Text>
              {result.coach.nextRounds.map((r, i) => (
                <TouchableOpacity
                  key={'nr' + i}
                  activeOpacity={0.85}
                  style={styles.coachNextItem}
                  onPress={() => {
                    if (r.mode === 'practice') {
                      navigation.replace('Practice', {
                        difficulty: r.difficulty || 'easy',
                        lastCategory: r.category || null,
                      });
                    } else if (r.mode === '1v1') {
                      navigation.replace('BattleQueue');
                    } else if (r.mode === 'tutor') {
                      navigation.replace('Tutor');
                    } else {
                      navigation.popToTop();
                    }
                  }}
                >
                  <Text style={styles.coachNextStep}>{i + 1}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coachNextTitle}>{r.title}</Text>
                    <Text style={styles.coachNextWhy}>{r.rationale}</Text>
                  </View>
                  <Text style={styles.coachNextArrow}>▸</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity activeOpacity={0.9} style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.popToTop()}>
            <Text style={styles.btnText}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} style={[styles.btn, styles.btnPrimary]} onPress={() => navigation.replace('BattleQueue')}>
            <Text style={styles.btnText}>⚔  Battle Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

function ScoreCard({ name, color, avatarUrl, avatarEmoji, score, words, mmrDelta, newMmr, highlight }) {
  return (
    <View style={[styles.scoreCard, highlight && { borderColor: highlight, borderBottomColor: highlight }]}>
      <View style={[styles.avatar, { backgroundColor: color || '#3b82f6' }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
        ) : avatarEmoji ? (
          <Text style={{ fontSize: 22 }}>{avatarEmoji}</Text>
        ) : (
          <Text style={styles.avatarText}>{(name || '?').slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
      <Text style={styles.cardScore}>{score || 0}</Text>
      <Text style={styles.cardWords}>{words || 0} words</Text>
      <Text style={[styles.cardMmr, { color: (mmrDelta || 0) >= 0 ? '#86efac' : '#fca5a5' }]}>
        {mmrDelta >= 0 ? '+' : ''}{mmrDelta || 0}  {newMmr || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  safe: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 22, paddingBottom: 30 },
  loadingText: { color: '#fde68a', marginTop: 12, fontWeight: '800' },

  headlinePlate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 4, borderColor: '#fbbf24',
    borderBottomWidth: 9, borderBottomColor: '#451a03',
    alignItems: 'center', flexDirection: 'row', gap: 12,
  },
  headlineEmoji: { fontSize: 36 },
  headline: {
    fontSize: 36, fontWeight: '900', letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 4,
  },
  sub: {
    color: '#fde68a', fontSize: 15, marginTop: 12, marginBottom: 12, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
    textAlign: 'center', paddingHorizontal: 14,
  },
  lossBanner: {
    color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 14, marginBottom: 6,
    backgroundColor: 'rgba(127,29,29,0.85)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14,
    borderWidth: 2, borderColor: '#fca5a5',
    borderBottomWidth: 5, borderBottomColor: '#7f1d1d',
    overflow: 'hidden', letterSpacing: 0.6,
  },
  speedChip: {
    marginTop: 4, marginBottom: 14,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#16a34a',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  speedChipText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },

  cards: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 16 },
  vsDivider: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: '#7f1d1d',
    alignSelf: 'center',
  },
  vsDividerText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  scoreCard: {
    flex: 1, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20, padding: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#0f172a',
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  cardName: {
    color: '#fff', fontWeight: '900', fontSize: 13, marginTop: 8, maxWidth: 120,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  cardScore: {
    color: '#fde68a', fontWeight: '900', fontSize: 30, marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  cardWords: { color: '#cbd5e1', fontSize: 11, marginTop: 2, fontWeight: '700' },
  cardMmr: { fontWeight: '900', fontSize: 11, marginTop: 8, letterSpacing: 0.4 },

  mmrPlate: {
    marginTop: 6,
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2, borderColor: '#fbbf24',
  },
  mmrLine: { color: '#fde68a', fontSize: 13, fontWeight: '800' },

  coachCard: {
    alignSelf: 'stretch', marginTop: 14,
    backgroundColor: 'rgba(8,47,73,0.85)',
    borderRadius: 18, padding: 14,
    borderWidth: 3, borderColor: '#38bdf8',
    borderBottomWidth: 7, borderBottomColor: '#082f49',
  },
  coachLabel: {
    color: '#7dd3fc', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 8,
  },
  coachFix: { color: '#bae6fd', fontSize: 13, fontWeight: '600', lineHeight: 19, marginBottom: 4 },
  coachNextItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(8,47,73,0.7)',
    borderRadius: 12, padding: 10,
    borderWidth: 2, borderColor: 'rgba(56,189,248,0.35)',
    marginBottom: 6,
  },
  coachNextStep: { color: '#7dd3fc', fontSize: 16, fontWeight: '900', width: 22 },
  coachNextTitle: { color: '#fff', fontWeight: '900', fontSize: 13 },
  coachNextWhy: { color: '#bae6fd', fontSize: 11, marginTop: 1 },
  coachNextArrow: { color: '#fcd34d', fontSize: 22, fontWeight: '900' },

  actions: { padding: 20, flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8,
  },
  btnSecondary: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderBottomColor: '#0f172a',
  },
  btnPrimary: {
    backgroundColor: '#22c55e',
    borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  btnText: {
    color: '#fff', fontWeight: '900', letterSpacing: 1, fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
});
