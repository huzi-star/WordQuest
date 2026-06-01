import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Animated, Easing, ImageBackground, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { loadStats } from '../utils/storage';
import { useAuth } from '../utils/auth';
import { playBgm, tap as tapSfx } from '../utils/sound';
import { tierForScore, nextTier, tierUpDelta } from '../utils/tiers';

// Module-scoped guard: even if `lastSeenTier` mysteriously fails to persist
// (e.g. a syncDown race), only fire the catch-up TierUp once per app launch.
let HOME_TIERUP_SHOWN = false;
import { fetchWordOfDay, learnGetPath } from '../utils/api';
import { usePlan, canUseDaily } from '../utils/plan';
import { useSettings } from '../utils/settings';

const BG = require('../../home_design/home_bg.jpeg');
const ICO_TROPHY = require('../../home_design/tropy.png');
const ICO_STREAK = require('../../home_design/streak.png');
const ICO_TARGET = require('../../home_design/perpect-target.png');
const ICO_TIER_CASTLE = require('../../home_design/tire-castle.png');
const ICO_UNIT_CASTLE = require('../../home_design/unit-castle.png');
const ICO_BATTLE = require('../../home_design/1v1-battle.png');
const APP_LOGO = require('../../app-logo.jpeg');

export default function HomeScreen({ navigation }) {
  const { user, syncDown } = useAuth();
  const { plan, usage, features, bump, refresh: refreshPlan } = usePlan();
  const { settings } = useSettings();
  const [stats, setStats] = useState({
    highScore: 0, bestStreak: 0, perfectRounds: 0, totalScoreEver: 0,
  });
  const [wod, setWod] = useState(null);
  const [unit, setUnit] = useState(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0.45)).current;
  const playBob = useRef(new Animated.Value(0)).current;
  const swordShake = useRef(new Animated.Value(0)).current;

  // Staggered entrance animations — each card fades in + slides up.
  const entries = useRef({
    header: new Animated.Value(0),
    logo:   new Animated.Value(0),
    stats:  new Animated.Value(0),
    play:   new Animated.Value(0),
    learn:  new Animated.Value(0),
    modes:  new Animated.Value(0),
    daily:  new Animated.Value(0),
  }).current;

  useEffect(() => {
    // Logo pulse + halo glow pulse.
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 1300, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 1300, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(haloOpacity, { toValue: 0.9,  duration: 1300, useNativeDriver: true }),
      Animated.timing(haloOpacity, { toValue: 0.35, duration: 1300, useNativeDriver: true }),
    ])).start();
    // Quick Play gentle bob.
    Animated.loop(Animated.sequence([
      Animated.timing(playBob, { toValue: -6, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(playBob, { toValue:  0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    // 1v1 Battle sword shake — small periodic shimmy.
    Animated.loop(Animated.sequence([
      Animated.delay(2400),
      Animated.timing(swordShake, { toValue: 1,  duration: 70, useNativeDriver: true }),
      Animated.timing(swordShake, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(swordShake, { toValue: 1,  duration: 70, useNativeDriver: true }),
      Animated.timing(swordShake, { toValue: 0,  duration: 70, useNativeDriver: true }),
    ])).start();

    // Staggered card entrance.
    Animated.stagger(90, [
      Animated.spring(entries.header, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.spring(entries.logo,   { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.spring(entries.stats,  { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.spring(entries.play,   { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.spring(entries.learn,  { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.spring(entries.modes,  { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.spring(entries.daily,  { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  function entryStyle(key) {
    return {
      opacity: entries[key],
      transform: [{ translateY: entries[key].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    };
  }

  useFocusEffect(
    useCallback(() => {
      playBgm('home', { volume: 0.25 });
      refreshPlan();
      let cancelled = false;
      (async () => {
        // Pull fresh stats from Supabase first so total points / tier /
        // streak reflect the cloud state, not stale local cache.
        try { await syncDown(); } catch (_) {}
        if (cancelled) return;
        const s = await loadStats();
        if (cancelled) return;
        setStats({
          highScore: s.highScore || 0,
          bestStreak: s.bestStreak || 0,
          perfectRounds: s.perfectRounds || 0,
          totalScoreEver: s.totalScoreEver || 0,
          lastAdaptiveStats: s.lastAdaptiveStats || null,
        });
        // Catch-up tier-up: if the player earned a new tier (e.g. via cloud
        // sync from another device, or a missed celebration), show it once.
        // The HOME_TIERUP_SHOWN guard prevents an infinite loop if a stale
        // cloud snapshot keeps resetting `lastSeenTier`.
        if (!HOME_TIERUP_SHOWN) {
          const delta = tierUpDelta(s.lastSeenTier || 'bronze', s.totalScoreEver || 0);
          if (delta && !cancelled) {
            HOME_TIERUP_SHOWN = true;
            navigation.navigate('TierUp', delta);
          }
        }
        const tier = tierForScore(s.totalScoreEver || 0);
        try {
          const w = await fetchWordOfDay(tier.key);
          if (!cancelled && w?.ok && w.word) setWod(w);
        } catch (_) {}
        if (user?.id) {
          try {
            const p = await learnGetPath(user.id);
            if (!cancelled && p?.ok) setUnit(p);
          } catch (_) {}
        }
      })();
      return () => { cancelled = true; };
    }, [user?.id]),
  );

  function startAdaptive() {
    tapSfx();
    if (!canUseDaily(plan, usage, 'quick_play')) {
      navigation.navigate('Paywall', { reason: `Daily limit reached (${features.qpPerDay} / day). Upgrade to play unlimited.` });
      return;
    }
    bump('quick_play');
    const resumed = stats.lastAdaptiveStats || {
      roundsPlayed: 0, avgWordsFound: 0, avgTimeLeft: 0, currentStreak: 0, lastCategory: '',
    };
    navigation.navigate('Category', {
      playerStats: resumed,
      sessionStats: {
        score: 0, round: 1, streak: 0, badges: [], history: [],
        highScore: stats.highScore, bestStreak: stats.bestStreak,
      },
    });
  }

  function speakWord() {
    if (!wod?.word) return;
    try {
      Speech.stop();
      Speech.speak(`${wod.word}. ${wod.meaning || ''}`, { language: 'en-US', rate: 0.9 });
    } catch (_) {}
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Player';
  const totalScore = stats.totalScoreEver || 0;
  const tier = tierForScore(totalScore);
  const nxt = nextTier(tier.key) || tier;
  const toNext = Math.max(0, (nxt.minScore || 0) - totalScore);
  // Derive current unit + progress from the path returned by /api/learn/path.
  // The API returns `path` (UNITS array with status) + `progress` (raw row).
  const path = Array.isArray(unit?.path) ? unit.path : [];
  const currentFromPath = path.find((u) => u.status === 'current');
  const currentFromId = unit?.progress?.current_unit_id
    ? path.find((u) => u.id === unit.progress.current_unit_id)
    : null;
  const currentUnitObj = currentFromPath || currentFromId || path[0] || null;
  const unitsDone = path.length
    ? path.filter((u) => u.status === 'done').length
    : (unit?.progress?.completed_units?.length || 0);
  const totalUnits = path.length || 32;
  const unitTitle = currentUnitObj
    ? `Unit ${currentUnitObj.id}: ${currentUnitObj.title}`
    : 'Unit 1: Greetings';
  const unitStage = currentUnitObj?.stage || 'A1';
  const unitPct = Math.max(0.04, Math.min(1, unitsDone / totalUnits));

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* TOP BAR */}
          <Animated.View style={[styles.topBar, entryStyle('header')]}>
            <View style={styles.row}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Avatar')}>
                {/* Tier-colored glowing ring around the avatar */}
                <View style={[styles.avatarRing, { borderColor: tier.accent || '#facc15', shadowColor: tier.accent || '#facc15' }]}>
                  <View style={[styles.avatarTile, settings.avatarColor && { backgroundColor: settings.avatarColor }]}>
                    {settings.avatarUrl
                      ? <Image source={{ uri: settings.avatarUrl }} style={styles.avatarPhoto} />
                      : settings.avatarEmoji
                        ? <Text style={styles.avatarEmoji}>{settings.avatarEmoji}</Text>
                        : <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>}
                  </View>
                </View>
              </TouchableOpacity>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.welcomeLabel}>WELCOME</Text>
                <Text style={styles.welcomeName} numberOfLines={1}>{displayName}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <TouchableOpacity activeOpacity={0.85} style={[styles.topIcon, { backgroundColor: '#f97316', borderBottomColor: '#7c2d12' }]} onPress={() => { tapSfx(); navigation.navigate('Stats'); }}>
                <Text style={styles.topIconEmoji}>📊</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} style={[styles.topIcon, { backgroundColor: '#8b5cf6', marginLeft: 8, borderBottomColor: '#4c1d95' }]} onPress={() => { tapSfx(); navigation.navigate('Settings'); }}>
                <Text style={styles.topIconEmoji}>⚙️</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* HERO LOGO with pulsing soft glow halo */}
          <Animated.View style={[styles.heroWrap, entryStyle('logo')]}>
            <Animated.View style={[styles.heroHalo, { opacity: haloOpacity, transform: [{ scale: pulse }] }]} />
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <View style={styles.heroOuter}>
                <View style={styles.heroInner}>
                  <Image source={APP_LOGO} style={styles.heroLogo} />
                </View>
              </View>
            </Animated.View>
          </Animated.View>
          <Animated.Text style={[styles.brand, entryStyle('logo')]}>WordQuest</Animated.Text>
          <Animated.View style={[styles.brandPill, entryStyle('logo')]}>
            <Text style={styles.brandPillText}>AI-POWERED · WORLD THEMED</Text>
          </Animated.View>

          {/* STATS ROW */}
          <Animated.View style={[styles.statsRow, entryStyle('stats')]}>
            <StatCard icon={ICO_TROPHY} label="HIGH SCORE" value={stats.highScore} color="#ef4444" shadow="#7f1d1d" />
            <StatCard icon={ICO_STREAK} label="STREAK" value={stats.bestStreak} color="#f97316" shadow="#7c2d12" />
            <StatCard icon={ICO_TARGET} label="PERFECT" value={stats.perfectRounds} color="#a855f7" shadow="#581c87" />
          </Animated.View>

          {/* QUICK PLAY — bobbing button */}
          <Animated.View style={[entryStyle('play'), { transform: [...entryStyle('play').transform, { translateY: playBob }] }]}>
            <TouchableOpacity activeOpacity={0.92} onPress={startAdaptive} style={styles.playCard}>
              <View style={styles.playShine} />
              <Text style={styles.playTitle}>QUICK PLAY</Text>
              <View style={styles.playArrow}>
                <Text style={styles.playArrowText}>▶</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* CONTINUE LEARNING */}
          <Animated.View style={[styles.learnCard, entryStyle('learn')]}>
            <Image source={ICO_UNIT_CASTLE} style={styles.learnCastle} resizeMode="contain" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.learnLabel}>★ CONTINUE LEARNING</Text>
              <Text style={styles.learnTitle} numberOfLines={1}>{unitTitle}</Text>
              <Text style={styles.learnSub}>Stage {unitStage} · {unitsDone}/{totalUnits} units complete</Text>
              {/* Thicker progress bar with yellow→green gradient simulated via 2 layered fills */}
              <View style={styles.learnTrack}>
                <View style={[styles.learnFillYellow, { width: `${unitPct * 100}%` }]} />
                <View style={[styles.learnFillGreen,  { width: `${unitPct * 100}%`, opacity: Math.min(1, unitPct * 1.5) }]} />
              </View>
              <View style={styles.learnBtnRow}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => { tapSfx(); navigation.navigate('LearningPath'); }} style={[styles.learnBtn, { backgroundColor: '#ef4444', borderBottomColor: '#7f1d1d' }]}>
                  <Text style={styles.learnBtnText}>≫ Full Path</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} onPress={() => {
                  tapSfx();
                  if (currentUnitObj?.id) navigation.navigate('Lesson', { unitId: currentUnitObj.id });
                  else navigation.navigate('LearningPath');
                }} style={[styles.learnBtn, { backgroundColor: '#facc15', borderBottomColor: '#a16207' }]}>
                  <Text style={[styles.learnBtnText, { color: '#7c2d12' }]}>▶ Start Lesson</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          {/* GAME MODES LABEL with joystick */}
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionJoystick}>🕹️</Text>
            <Text style={styles.sectionLabel}>GAME MODES</Text>
          </View>

          {/* 3-up row: Tier / WordOfDay / Battle */}
          <Animated.View style={[styles.modesRow, entryStyle('modes')]}>
            {/* Tier card */}
            <TouchableOpacity activeOpacity={0.9} onPress={() => { tapSfx(); navigation.navigate('TierLeaderboard'); }} style={[styles.modeBox, styles.modeBoxGlow, { backgroundColor: '#5b21b6', borderBottomColor: '#2e1065', shadowColor: '#a855f7' }]}>
              <Image source={ICO_TIER_CASTLE} style={styles.modeIcon} resizeMode="contain" />
              <View style={[styles.tierBadgeChip, { backgroundColor: tier.accent || '#facc15' }]}>
                <Text style={styles.tierBadgeChipText}>{tier.emoji || '🏆'}</Text>
              </View>
              <Text style={styles.modeTitle} numberOfLines={1}>{tier.name} Tier</Text>
              <Text style={styles.modeSub} numberOfLines={2}>{toNext > 0 ? `${toNext} points to ${nxt.name}` : 'Max tier reached'}</Text>
              <View style={[styles.modePill, { backgroundColor: '#facc15' }]}>
                <Text style={styles.modePillText}>top-25 leaderboard</Text>
              </View>
            </TouchableOpacity>

            {/* Word of the Day */}
            <TouchableOpacity activeOpacity={0.9} onPress={speakWord} style={[styles.modeBox, styles.modeBoxGlow, { backgroundColor: '#8b5cf6', borderBottomColor: '#4c1d95', shadowColor: '#c4b5fd' }]}>
              <Text style={styles.wodHeader}>✨ Word of the Day</Text>
              <View style={styles.wodScroll}>
                <Text style={styles.wodWord} numberOfLines={1}>{(wod?.word || 'BRAVE').toUpperCase()}</Text>
                <Text style={styles.wodMeaning} numberOfLines={3}>{wod?.meaning || 'Showing courage in difficult moments.'}</Text>
                <Text style={styles.wodTap}>Tap for example →</Text>
              </View>
              <View style={styles.wodSpeaker}><Text style={styles.wodSpeakerIcon}>🔊</Text></View>
            </TouchableOpacity>

            {/* 1v1 Battle — sword icon shakes periodically */}
            <TouchableOpacity activeOpacity={0.9} onPress={() => {
              tapSfx();
              if (!features.battle) {
                navigation.navigate('Paywall', { reason: 'Battle 1v1 is a Pro feature. Upgrade to play real opponents.' });
                return;
              }
              navigation.navigate('BattleQueue');
            }} style={[styles.modeBox, styles.modeBoxGlow, { backgroundColor: '#dc2626', borderBottomColor: '#7f1d1d', shadowColor: '#fb7185' }]}>
              <Animated.View style={{ transform: [{ rotate: swordShake.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) }] }}>
                <Image source={ICO_BATTLE} style={styles.modeIcon} resizeMode="contain" />
              </Animated.View>
              <Text style={styles.modeTitle} numberOfLines={1}>⚔️ 1v1 Battle</Text>
              <Text style={styles.modeSub} numberOfLines={3}>Match a player in your tier... wins</Text>
              <Text style={styles.modeMeta}>Real-time MMR ranked</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Daily + Quiz pair */}
          <Animated.View style={[styles.dailyRow, entryStyle('daily')]}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => {
              tapSfx();
              if (!canUseDaily(plan, usage, 'daily')) {
                navigation.navigate('Paywall', { reason: `Daily Challenge limit reached. Upgrade for unlimited.` });
                return;
              }
              bump('daily');
              navigation.navigate('DailyChallenge');
            }} style={[styles.smallTile, { backgroundColor: '#facc15', borderBottomColor: '#a16207', shadowColor: '#facc15' }]}>
              <Text style={styles.smallEmoji}>📅</Text>
              <Text style={[styles.smallName, { color: '#7c2d12' }]}>Daily</Text>
              <Text style={[styles.smallSub, { color: '#7c2d12' }]}>Today's puzzle</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} onPress={() => {
              tapSfx();
              if (!canUseDaily(plan, usage, 'quiz')) {
                navigation.navigate('Paywall', { reason: `Quiz limit reached today (${features.quizPerDay}/day). Upgrade for unlimited.` });
                return;
              }
              bump('quiz');
              navigation.navigate('Quiz');
            }} style={[styles.smallTile, { backgroundColor: '#ef4444', borderBottomColor: '#7f1d1d', shadowColor: '#fb7185' }]}>
              <Text style={styles.smallEmoji}>❓</Text>
              <Text style={[styles.smallName, { color: '#fff' }]}>Quiz</Text>
              <Text style={[styles.smallSub, { color: '#fee2e2' }]}>Test yourself</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function StatCard({ icon, label, value, color, shadow }) {
  return (
    <View style={styles.statWrap}>
      <Image source={icon} style={styles.statIcon} resizeMode="contain" />
      <View style={[styles.statCard, { backgroundColor: color, borderBottomColor: shadow, shadowColor: color }]}>
        {/* Soft gloss highlight on the top half */}
        <View style={styles.statGloss} />
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.28)' },
  scroll: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  avatarRing: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    shadowOpacity: 0.85, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatarTile: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#60a5fa',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    overflow: 'hidden',
  },
  avatarLetter: { color: '#fff', fontSize: 18, fontWeight: '900' },
  avatarEmoji: { fontSize: 22 },
  avatarPhoto: { width: '100%', height: '100%' },
  welcomeLabel: {
    color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  welcomeName: {
    color: '#fff', fontSize: 18, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  topIcon: {
    width: 46, height: 46, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 6,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  topIconEmoji: { fontSize: 22 },

  // Hero
  heroWrap: { alignItems: 'center', marginTop: 6 },
  heroHalo: {
    position: 'absolute',
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#facc15',
  },
  heroOuter: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 5, borderColor: '#facc15',
    shadowColor: '#0ea5e9', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  heroInner: {
    width: 116, height: 116, borderRadius: 58,
    overflow: 'hidden',
    borderWidth: 3, borderColor: '#fff',
  },
  heroLogo: { width: '100%', height: '100%' },

  brand: {
    color: '#dbeafe', fontSize: 40, fontWeight: '900',
    textAlign: 'center', marginTop: 8, letterSpacing: 0.5,
    textShadowColor: '#0ea5e9', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14,
  },
  brandPill: {
    alignSelf: 'center', marginTop: 4, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 2, borderColor: 'rgba(252,211,77,0.6)',
  },
  brandPillText: {
    color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 2,
  },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 22, marginBottom: 14 },
  statWrap: { flex: 1, alignItems: 'center' },
  statIcon: {
    width: 72, height: 72,
    marginBottom: -26, zIndex: 2,
  },
  statCard: {
    width: '100%', borderRadius: 22, paddingTop: 30, paddingBottom: 14,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 10,
    shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    overflow: 'hidden',
  },
  statGloss: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  statIcon2: { width: 72, height: 72 },
  statLabel: {
    color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1,
  },
  statValue: {
    color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 3,
  },

  // Quick Play
  playCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#22c55e',
    borderRadius: 30, paddingVertical: 18, paddingHorizontal: 24,
    borderWidth: 4, borderColor: '#fff',
    borderBottomWidth: 12, borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 14,
    overflow: 'hidden',
  },
  playShine: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  playTitle: {
    color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  playArrow: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#14532d',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  playArrowText: { color: '#15803d', fontSize: 18, fontWeight: '900', marginLeft: 3 },

  // Continue Learning
  learnCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 20, padding: 12, marginTop: 14,
    borderWidth: 3, borderColor: '#fcd34d',
    borderBottomWidth: 8, borderBottomColor: '#78350f',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  learnCastle: { width: 96, height: 96 },
  learnLabel: { color: '#fcd34d', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  learnTitle: {
    color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  learnSub: { color: '#cbd5e1', fontSize: 11, marginTop: 2, fontWeight: '700' },
  learnTrack: {
    height: 12, backgroundColor: '#1e293b', borderRadius: 6, marginTop: 8, overflow: 'hidden',
    borderWidth: 2, borderColor: '#475569',
  },
  learnFillYellow: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    backgroundColor: '#facc15',
  },
  learnFillGreen: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    backgroundColor: '#22c55e',
  },
  learnBtnRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  learnBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 12, alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 5,
  },
  learnBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  // Section
  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 18, marginBottom: 10, marginLeft: 4,
  },
  sectionJoystick: { fontSize: 16 },
  sectionLabel: {
    color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },

  // Modes row (3-up)
  modesRow: { flexDirection: 'row', gap: 6 },
  modeBox: {
    flex: 1, borderRadius: 18, padding: 8,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8,
    minHeight: 172,
  },
  modeBoxGlow: {
    shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tierBadgeChip: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  tierBadgeChipText: { fontSize: 12 },
  modeIcon: { width: 56, height: 56, marginTop: -4 },
  modeTitle: {
    color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 4, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  modeSub: { color: 'rgba(255,255,255,0.92)', fontSize: 9, marginTop: 2, fontWeight: '700', textAlign: 'center' },
  modeMeta: { color: '#fde68a', fontSize: 9, marginTop: 4, fontWeight: '900', textAlign: 'center' },
  modePill: {
    marginTop: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1, borderColor: '#fff',
  },
  modePillText: { color: '#7c2d12', fontSize: 8, fontWeight: '900' },

  // Word of Day
  wodHeader: {
    color: '#fde68a', fontSize: 10, fontWeight: '900', marginTop: 2,
  },
  wodScroll: {
    flex: 1, width: '100%', marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10, padding: 6,
    borderWidth: 2, borderColor: '#fbbf24',
  },
  wodWord: { color: '#7c2d12', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  wodMeaning: { color: '#1f2937', fontSize: 8, marginTop: 3, fontWeight: '700', textAlign: 'center' },
  wodTap: { color: '#a16207', fontSize: 8, marginTop: 4, fontWeight: '900', textAlign: 'center' },
  wodSpeaker: {
    position: 'absolute', right: 4, bottom: 4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#4c1d95',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  wodSpeakerIcon: { fontSize: 12 },

  // Daily + Quiz
  dailyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallTile: {
    flex: 1, borderRadius: 18, paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7,
    shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  smallEmoji: { fontSize: 30 },
  smallName: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  smallSub: { fontSize: 9, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
});
