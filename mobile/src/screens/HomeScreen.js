import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Animated, Easing, ImageBackground, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { speakSmooth } from '../utils/voice';
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
import { trace } from '../utils/trace';
import { rfs } from '../utils/responsive';

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
  // 3D yaw rotation for the hero logo (perspective tilt feel).
  const heroYaw = useRef(new Animated.Value(0)).current;
  // Orbital ring spin around the hero.
  const heroOrbit = useRef(new Animated.Value(0)).current;
  // Shine sweep across Quick Play.
  const playShineSweep = useRef(new Animated.Value(0)).current;
  // Continuous gentle Y-bob shared across secondary cards.
  const cardFloat = useRef(new Animated.Value(0)).current;
  // Tilt sway on stat cards.
  const statTilt = useRef(new Animated.Value(0)).current;
  // Press-squish scale for big CTAs.
  const playPress = useRef(new Animated.Value(1)).current;
  const practicePress = useRef(new Animated.Value(1)).current;

  // Staggered entrance animations — each card fades in + slides up.
  const entries = useRef({
    header:   new Animated.Value(0),
    logo:     new Animated.Value(0),
    stats:    new Animated.Value(0),
    practice: new Animated.Value(0),
    play:     new Animated.Value(0),
    learn:    new Animated.Value(0),
    modes:    new Animated.Value(0),
  }).current;
  const practiceGlow = useRef(new Animated.Value(0.4)).current;
  const playGlow = useRef(new Animated.Value(0.4)).current;
  const learnGlow = useRef(new Animated.Value(0.45)).current;
  const wodSparkle = useRef(new Animated.Value(0)).current;

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

    // Bouncier staggered card entrance — lower friction = overshoot bounce.
    Animated.stagger(95, [
      Animated.spring(entries.header,   { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.spring(entries.logo,     { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.spring(entries.stats,    { toValue: 1, friction: 5, tension: 75, useNativeDriver: true }),
      Animated.spring(entries.practice, { toValue: 1, friction: 5, tension: 75, useNativeDriver: true }),
      Animated.spring(entries.play,     { toValue: 1, friction: 4, tension: 85, useNativeDriver: true }),
      Animated.spring(entries.learn,    { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.spring(entries.modes,    { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
    ]).start();

    // Soft glow pulses (Practice purple, Quick Play green, Continue Learning amber).
    const mkPulse = (val, lo, hi, dur) =>
      Animated.loop(Animated.sequence([
        Animated.timing(val, { toValue: hi, duration: dur, useNativeDriver: true }),
        Animated.timing(val, { toValue: lo, duration: dur, useNativeDriver: true }),
      ])).start();
    mkPulse(practiceGlow, 0.35, 0.85, 1400);
    mkPulse(playGlow, 0.4, 0.95, 1100);
    mkPulse(learnGlow, 0.45, 1, 1500);

    // Word of the Day sparkle pulse.
    Animated.loop(Animated.sequence([
      Animated.timing(wodSparkle, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(wodSparkle, { toValue: 0, duration: 900, useNativeDriver: true }),
    ])).start();
    // Hero 3D yaw rotation — gentle left-right tilt for depth.
    Animated.loop(Animated.sequence([
      Animated.timing(heroYaw, { toValue: 1,  duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(heroYaw, { toValue: -1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(heroYaw, { toValue: 0,  duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    // Hero orbital ring — continuous slow rotation behind the logo.
    Animated.loop(
      Animated.timing(heroOrbit, { toValue: 1, duration: 11000, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    // Quick Play shine sweep — diagonal white band traverses left›right repeatedly.
    Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(playShineSweep, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(playShineSweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
    // Shared card float — used by Practice / Pakistan / Recommended / Modes etc.
    Animated.loop(Animated.sequence([
      Animated.timing(cardFloat, { toValue: -4, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardFloat, { toValue:  0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    // Stat card sway — barely-there ±2deg tilt for cartoony life.
    Animated.loop(Animated.sequence([
      Animated.timing(statTilt, { toValue:  1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(statTilt, { toValue: -1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, []);

  // Squish helpers for press-down feedback on the two biggest CTAs.
  function pressIn(val) {
    Animated.spring(val, { toValue: 0.94, useNativeDriver: true, friction: 6, tension: 200 }).start();
  }
  function pressOut(val) {
    Animated.spring(val, { toValue: 1, useNativeDriver: true, friction: 4, tension: 180 }).start();
  }

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
          // 24-HOUR PER-USER CACHE for the Word of the Day. We bind the
          // cache key to the user so a phone shared by two kids still
          // shows each kid their own daily word. After 24h since the
          // last fetch we re-pull from the server and rewrite the cache.
          const wodKey = `wod:cache:${user?.id || 'guest'}:${tier.key}`;
          let cached = null;
          try {
            const raw = await AsyncStorage.getItem(wodKey);
            if (raw) cached = JSON.parse(raw);
          } catch (_) {}
          const now = Date.now();
          const ageMs = cached?.ts ? (now - cached.ts) : Infinity;
          if (cached?.word && ageMs < 24 * 60 * 60 * 1000) {
            if (!cancelled) setWod(cached);
          } else {
            const w = await fetchWordOfDay(tier.key);
            if (!cancelled && w?.ok && w.word) {
              const fresh = { ...w, ts: now };
              setWod(fresh);
              try { await AsyncStorage.setItem(wodKey, JSON.stringify(fresh)); } catch (_) {}
            } else if (!cancelled && cached?.word) {
              // Backend down but we have a stale cache — keep showing it
              // rather than the hard-coded fallback word.
              setWod(cached);
            }
          }
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
    trace('quick-play', 'started', { tier: tierForScore(stats.totalScoreEver || 0).key }, { userId: user?.id });
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
    // Friendly female voice speaks the word + meaning (+ example if any)
    // in one smooth utterance. Tap reacts instantly — no awkward pause.
    speakSmooth(
      `${wod.word}. ${wod.meaning || ''}${wod.example ? `. ${wod.example}` : ''}`,
      { language: 'english' },
    );
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
      {/* Sky-gradient tint stack: deep navy at top emerald wash at bottom.
          Three layered overlays simulate a vertical gradient without a
          dependency on react-native-linear-gradient. */}
      <View style={styles.tintTop} pointerEvents="none" />
      <View style={styles.tintMid} pointerEvents="none" />
      <View style={styles.tintBottom} pointerEvents="none" />
      <FloatingLetters />
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

          {/* HERO LOGO — 3D cartoonish: pulsing halo, orbital sparkle ring,
              continuous yaw tilt for depth. */}
          <Animated.View style={[styles.heroWrap, entryStyle('logo')]}>
            <Animated.View style={[styles.heroHalo, { opacity: haloOpacity, transform: [{ scale: pulse }] }]} />
            {/* Orbital ring with 4 sparkles, rotating continuously. */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.heroOrbit,
                { transform: [{ rotate: heroOrbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
              ]}
            >
              <Text style={[styles.heroOrbitDot, styles.heroOrbitN]}>✦</Text>
              <Text style={[styles.heroOrbitDot, styles.heroOrbitE]}>✧</Text>
              <Text style={[styles.heroOrbitDot, styles.heroOrbitS]}>✦</Text>
              <Text style={[styles.heroOrbitDot, styles.heroOrbitW]}>✧</Text>
            </Animated.View>
            <Animated.View
              style={{
                transform: [
                  { perspective: 800 },
                  { rotateY: heroYaw.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) },
                  { scale: pulse },
                ],
              }}
            >
              <View style={styles.heroOuter}>
                <View style={styles.heroInner}>
                  <Image source={APP_LOGO} style={styles.heroLogo} />
                </View>
                {/* Top-left gloss highlight for cartoonish 3D ball look. */}
                <View pointerEvents="none" style={styles.heroGloss} />
              </View>
            </Animated.View>
          </Animated.View>
          <Animated.Text style={[styles.brand, entryStyle('logo')]}>WordQuest</Animated.Text>
          <Animated.View style={[styles.brandPill, entryStyle('logo')]}>
            <Text style={styles.brandPillText}>AI-POWERED · WORLD THEMED</Text>
          </Animated.View>

          {/* STATS ROW — gentle continuous sway gives a cartoon-toy feel. */}
          <Animated.View
            style={[
              styles.statsRow,
              entryStyle('stats'),
              { transform: [...entryStyle('stats').transform, { rotate: statTilt.interpolate({ inputRange: [-1, 1], outputRange: ['-1.4deg', '1.4deg'] }) }] },
            ]}
          >
            <StatCard icon={ICO_TROPHY} label="HIGH SCORE" value={stats.highScore} color="#ef4444" shadow="#7f1d1d" />
            <StatCard icon={ICO_STREAK} label="STREAK" value={stats.bestStreak} color="#f97316" shadow="#7c2d12" />
            <StatCard icon={ICO_TARGET} label="PERFECT" value={stats.perfectRounds} color="#a855f7" shadow="#581c87" />
          </Animated.View>

          {/* Recommended For You section removed (learningPathAgent retired). */}

          {/* PRACTICE — unranked, AI-adaptive. Continuous gentle float +
              press-squish for a 3D cartoonish button feel. */}
          <Animated.View
            style={[
              entryStyle('practice'),
              {
                position: 'relative',
                transform: [
                  ...entryStyle('practice').transform,
                  { translateY: cardFloat },
                  { scale: practicePress },
                ],
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.practiceGlow, { opacity: practiceGlow }]}
            />
            <TouchableOpacity
              activeOpacity={0.92}
              delayPressIn={50}
              onPressIn={() => pressIn(practicePress)}
              onPressOut={() => pressOut(practicePress)}
              onPress={() => { tapSfx(); navigation.navigate('Practice'); }}
              style={styles.practiceCard}
            >
              <View style={styles.practiceShine} />
              <View style={styles.practiceLeft}>
                <Text style={styles.practiceOwl}>🦉</Text>
              </View>
              <View style={styles.practiceBody}>
                <Text style={styles.practiceTitle}>PRACTICE</Text>
                <Text style={styles.practiceSub}>Build your skills · No pressure, no rank</Text>
              </View>
              <View style={styles.practiceUnranked}>
                <Text style={styles.practiceUnrankedText}>UNRANKED</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* PAKISTAN CULTURE QUEST — green-flag themed card with gentle float. */}
          <Animated.View
            style={[
              entryStyle('play'),
              { transform: [...entryStyle('play').transform, { translateY: cardFloat }] },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.92}
              delayPressIn={50}
              onPress={() => { tapSfx(); navigation.navigate('PakistanQuest'); }}
              style={styles.pkCard}
            >
              <View style={styles.pkStar} />
              <View style={styles.pkBody}>
                <Text style={styles.pkFlag}>🇵🇰</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.pkTitle}>PAKISTAN QUEST</Text>
                  <Text style={styles.pkSub}>7 packs · English + Roman Urdu</Text>
                </View>
                <View style={styles.pkBadge}>
                  <Text style={styles.pkBadgeText}>NEW</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* QUICK PLAY — bobbing, glowing, press-squishing, with an animated
              diagonal shine sweep crossing the surface. */}
          <Animated.View
            style={[
              entryStyle('play'),
              {
                transform: [
                  ...entryStyle('play').transform,
                  { translateY: playBob },
                  { scale: playPress },
                ],
                position: 'relative',
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.playGlow, { opacity: playGlow }]}
            />
            <TouchableOpacity
              activeOpacity={0.92}
              delayPressIn={50}
              onPressIn={() => pressIn(playPress)}
              onPressOut={() => pressOut(playPress)}
              onPress={startAdaptive}
              style={styles.playCard}
            >
              <View style={styles.playShine} />
              {/* Animated diagonal white sweep — pure visual flair. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.playSweep,
                  {
                    transform: [
                      { translateX: playShineSweep.interpolate({ inputRange: [0, 1], outputRange: [-260, 380] }) },
                      { rotate: '-18deg' },
                    ],
                  },
                ]}
              />
              <Text style={styles.playTitle}>QUICK PLAY</Text>
              <View style={styles.playArrow}>
                <Text style={styles.playArrowText}>▶</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* CONTINUE LEARNING — amber pulsing border glow + gentle float. */}
          <Animated.View
            style={[
              entryStyle('learn'),
              {
                position: 'relative',
                transform: [...entryStyle('learn').transform, { translateY: cardFloat }],
              },
            ]}
          >
          <Animated.View
            pointerEvents="none"
            style={[styles.learnGlow, { opacity: learnGlow }]}
          />
          <View style={styles.learnCard}>
            <Image source={ICO_UNIT_CASTLE} style={styles.learnCastle} resizeMode="contain" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.learnLabel}>★ CONTINUE LEARNING</Text>
              <Text style={styles.learnTitle} numberOfLines={1}>{unitTitle}</Text>
              <Text style={styles.learnSub}>Stage {unitStage} · {unitsDone}/{totalUnits} units complete</Text>
              {/* Thicker progress bar with yellow›green gradient simulated via 2 layered fills */}
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
              <Animated.Text
                style={[
                  styles.wodHeader,
                  {
                    opacity: wodSparkle.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                    transform: [{ scale: wodSparkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
                  },
                ]}
              >
                ✨ Word of the Day
              </Animated.Text>
              <View style={styles.wodScroll}>
                <Text style={styles.wodWord} numberOfLines={1}>{(wod?.word || 'BRAVE').toUpperCase()}</Text>
                <Text style={styles.wodMeaning} numberOfLines={3}>{wod?.meaning || 'Showing courage in difficult moments.'}</Text>
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

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// Colorful 3D-feel letter rain — drifting A-Z glyphs that rotate, scale,
// and fade as they float up the screen. Replaces the older plain-star
// particles to give the home screen a word-puzzle cartoonish vibe.
function FloatingLetters() {
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const COLORS = ['#fde047', '#f59e0b', '#fb923c', '#ef4444', '#22c55e', '#0ea5e9', '#a855f7', '#ec4899'];
  const items = useRef(
    Array.from({ length: 14 }).map((_, i) => ({
      key: i,
      char: LETTERS[Math.floor(Math.random() * LETTERS.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      x: Math.random() * 100,
      size: 14 + Math.random() * 22,
      drift: (Math.random() * 60) - 30,
      duration: 9000 + Math.random() * 8000,
      delay: Math.random() * 5000,
      spinDir: Math.random() > 0.5 ? 1 : -1,
      anim: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    items.forEach((a) => {
      const loop = () => {
        a.anim.setValue(0);
        Animated.timing(a.anim, {
          toValue: 1,
          duration: a.duration,
          delay: a.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(loop);
      };
      loop();
    });
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((a) => (
        <Animated.Text
          key={a.key}
          style={{
            position: 'absolute',
            bottom: -50,
            left: `${a.x}%`,
            fontSize: a.size,
            fontWeight: '900',
            color: a.color,
            textShadowColor: 'rgba(0,0,0,0.55)',
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 4,
            opacity: a.anim.interpolate({
              inputRange: [0, 0.15, 0.85, 1],
              outputRange: [0, 0.85, 0.55, 0],
            }),
            transform: [
              { translateY: a.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -760] }) },
              { translateX: a.anim.interpolate({ inputRange: [0, 1], outputRange: [0, a.drift] }) },
              { rotate: a.anim.interpolate({ inputRange: [0, 1], outputRange: [`0deg`, `${a.spinDir * 360}deg`] }) },
              { scale: a.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 0.7] }) },
            ],
          }}
        >
          {a.char}
        </Animated.Text>
      ))}
    </View>
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
  bg: { flex: 1, backgroundColor: '#0d1b2a' },
  // Three-layer vertical gradient: navy mid emerald wash.
  tintTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
    backgroundColor: 'rgba(13,27,42,0.65)',
  },
  tintMid: {
    position: 'absolute', top: '35%', left: 0, right: 0, height: '35%',
    backgroundColor: 'rgba(26,39,68,0.40)',
  },
  tintBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
    backgroundColor: 'rgba(0,80,55,0.32)',
  },
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
  // Top-left highlight to mimic a glossy 3D ball.
  heroGloss: {
    position: 'absolute',
    top: 6, left: 6,
    width: 44, height: 28,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.55)',
    transform: [{ rotate: '-22deg' }],
  },
  // Orbital ring around the hero — rotates continuously with 4 sparkles.
  heroOrbit: {
    position: 'absolute',
    width: 200, height: 200,
    alignItems: 'center', justifyContent: 'center',
  },
  heroOrbitDot: {
    position: 'absolute',
    fontSize: 18,
    color: '#fde047',
    textShadowColor: 'rgba(250,204,21,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  heroOrbitN: { top: -2 },
  heroOrbitE: { right: -2 },
  heroOrbitS: { bottom: -2 },
  heroOrbitW: { left: -2 },

  brand: {
    color: '#dbeafe', fontSize: rfs(38), fontWeight: '900',
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
    color: '#fff', fontSize: rfs(26), fontWeight: '900', marginTop: 4,
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
  // Diagonal white sweep that traverses the Quick Play card every cycle.
  playSweep: {
    position: 'absolute',
    top: -30, bottom: -30,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  playTitle: {
    color: '#fff', fontSize: rfs(26), fontWeight: '900', letterSpacing: 1,
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

  // Premium Practice card — full-width gradient-feel, blue›purple base.
  recCard: {
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderRadius: 22, padding: 14, marginBottom: 14,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 8, borderBottomColor: '#78350f',
    shadowColor: '#fbbf24', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  recHeader: { marginBottom: 10 },
  recTitle: { color: '#fde68a', fontWeight: '900', fontSize: 13, letterSpacing: 1.4 },
  recSub: { color: '#cbd5e1', fontSize: 11, marginTop: 2, fontWeight: '700' },
  recWeakRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  recWeakChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(220,38,38,0.18)',
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.45)',
  },
  recWeakText: { color: '#fca5a5', fontSize: 10, fontWeight: '800' },
  recItems: { gap: 8 },
  recItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 2, borderColor: 'rgba(251,191,36,0.35)',
  },
  recItemNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  recItemNumText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  recItemTitle: { color: '#fff', fontWeight: '900', fontSize: 13 },
  recItemRationale: { color: '#cbd5e1', fontSize: 10, marginTop: 2, lineHeight: 14 },
  recItemArrow: { color: '#fde68a', fontWeight: '900', fontSize: 18, marginRight: 6 },

  pkCard: {
    backgroundColor: '#15803d',
    borderRadius: 22, padding: 14, marginBottom: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#052e16',
    shadowColor: '#16a34a', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    position: 'relative', overflow: 'hidden',
  },
  pkStar: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -20, right: -10,
  },
  pkBody: { flexDirection: 'row', alignItems: 'center' },
  pkFlag: { fontSize: 38 },
  pkTitle: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 1 },
  pkSub: { color: '#bbf7d0', fontSize: 11, marginTop: 2, fontWeight: '700' },
  pkBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: '#fbbf24',
    borderRadius: 8,
    borderWidth: 2, borderColor: '#fff',
  },
  pkBadgeText: { color: '#78350f', fontWeight: '900', fontSize: 10, letterSpacing: 0.8 },

  practiceGlow: {
    position: 'absolute', left: 8, right: 8, top: 4, bottom: 4,
    borderRadius: 26, backgroundColor: '#7c4dff',
    shadowColor: '#7c4dff', shadowOpacity: 1, shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 }, elevation: 14,
  },
  practiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16, paddingHorizontal: 16, borderRadius: 24,
    backgroundColor: '#1e1b4b',
    borderWidth: 3, borderColor: '#7c4dff',
    borderBottomWidth: 9, borderBottomColor: '#311b92',
    overflow: 'hidden',
    marginBottom: 14,
  },
  practiceShine: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  practiceLeft: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#3b0d70',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#a78bfa',
    borderBottomWidth: 5, borderBottomColor: '#1e1b4b',
  },
  practiceOwl: { fontSize: 30 },
  practiceBody: { flex: 1, gap: 2 },
  practiceTitle: {
    color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.6,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  practiceSub: { color: '#c4b5fd', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  practiceUnranked: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: '#475569',
    borderWidth: 2, borderColor: '#94a3b8',
    borderBottomWidth: 4, borderBottomColor: '#0f172a',
  },
  practiceUnrankedText: {
    color: '#e2e8f0', fontSize: 9, fontWeight: '900', letterSpacing: 1.2,
  },

  // Quick Play pulsing green glow.
  playGlow: {
    position: 'absolute', left: 6, right: 6, top: 4, bottom: 4,
    borderRadius: 28, backgroundColor: '#00e676',
    shadowColor: '#00e676', shadowOpacity: 1, shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 }, elevation: 14,
  },

  // Continue Learning amber border pulse.
  learnGlow: {
    position: 'absolute', left: 4, right: 4, top: 2, bottom: 2,
    borderRadius: 24, backgroundColor: '#ffd700',
    shadowColor: '#ffd700', shadowOpacity: 0.9, shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
});
