import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Animated, Easing, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../utils/settings';

const { width: SCREEN_W } = Dimensions.get('window');
const BG = require('../../home_design/home_bg.jpeg');

const SLIDES = [
  {
    key: 'welcome',
    title: 'Welcome to WordQuest!',
    body: 'The fun way to learn English words — play, discover, and level up!',
  },
  {
    key: 'find',
    title: 'Find Hidden Words!',
    body: 'Swipe across the letters — horizontal, vertical, or diagonal — to find words. The faster you find them, the more points you earn!',
  },
  {
    key: 'tiers',
    title: 'Climb the Tiers & Battle!',
    body: 'Rise from Bronze to Master. Challenge players in 1v1 battles and dominate the leaderboard!',
  },
];

// ------------------------------------------------------------ floating stars
function FloatingStars() {
  const items = useRef(
    Array.from({ length: 18 }, () => ({
      x: Math.random() * 100,
      y: new Animated.Value(Math.random() * 800),
      delay: Math.random() * 5000,
      size: 8 + Math.random() * 14,
      char: ['✦', '✧', '⋆', '✨', '·', '★'][Math.floor(Math.random() * 6)],
      color: ['#a78bfa', '#67e8f9', '#fde68a', '#86efac', '#f9a8d4', '#fb923c'][Math.floor(Math.random() * 6)],
    })),
  ).current;

  useEffect(() => {
    const loops = items.map((a) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(a.delay),
          Animated.timing(a.y, {
            toValue: -100, duration: 9000 + Math.random() * 5000,
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
            color: a.color, fontSize: a.size, opacity: 0.7,
          }}
        >{a.char}</Animated.Text>
      ))}
    </View>
  );
}

// ------------------------------------------------------------ illustrations
function IllustrationWelcome() {
  // Child holding a glowing book + floating A B C
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ])).start();
  }, []);
  const ty = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={styles.illoBox}>
      <Animated.Text style={[styles.floatA, { transform: [{ translateY: ty }] }]}>A</Animated.Text>
      <Animated.Text style={[styles.floatB, { transform: [{ translateY: ty }] }]}>B</Animated.Text>
      <Animated.Text style={[styles.floatC, { transform: [{ translateY: ty }] }]}>C</Animated.Text>
      <Text style={styles.bigEmoji}>👧</Text>
      <View style={styles.bookGlow}>
        <Text style={styles.bookEmoji}>📖</Text>
      </View>
    </View>
  );
}

function IllustrationFind() {
  // Hand swiping across a colorful word grid, stars popping
  // Cycle: horizontal vertical diagonal — so the user sees all 3 directions.
  const swipe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(swipe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(swipe, { toValue: 2, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(swipe, { toValue: 3, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(swipe, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const tx = swipe.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [-50,  50, -50,  50] });
  const ty = swipe.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [  0,   0, -40,  40] });

  const tiles = ['W', 'O', 'R', 'D', 'P', 'L', 'A', 'Y', 'F'];
  const tileColors = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#84cc16'];

  return (
    <View style={styles.illoBox}>
      <View style={styles.gridWrap}>
        {tiles.map((c, i) => (
          <View key={i} style={[styles.gridTile, { backgroundColor: tileColors[i] }]}>
            <Text style={styles.gridLetter}>{c}</Text>
          </View>
        ))}
      </View>
      <Animated.Text style={[styles.swipeHand, { transform: [{ translateX: tx }, { translateY: ty }] }]}>👆</Animated.Text>
      <Text style={[styles.starPop, { top: 18,  left: 16  }]}>✨</Text>
      <Text style={[styles.starPop, { top: 10,  right: 22 }]}>⭐</Text>
      <Text style={[styles.starPop, { bottom: 14, left: 24 }]}>✨</Text>
    </View>
  );
}

function IllustrationDaily() {
  // Calendar + star badge + owl with quiz paper, with confetti burst
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(burst, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 0, duration: 600, useNativeDriver: true }),
    ])).start();
  }, []);
  const scale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] });
  const opacity = burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={styles.illoBox}>
      <Animated.Text style={[styles.confetti, { top: 8,   left: 18, opacity, transform: [{ scale }] }]}>🎉</Animated.Text>
      <Animated.Text style={[styles.confetti, { top: 0,   right: 14, opacity, transform: [{ scale }] }]}>✨</Animated.Text>
      <Animated.Text style={[styles.confetti, { bottom: 22, right: 28, opacity, transform: [{ scale }] }]}>🎊</Animated.Text>

      <View style={styles.row}>
        <View style={styles.calendarCard}>
          <Text style={styles.calendarTop}>JUN</Text>
          <Text style={styles.calendarDay}>01</Text>
          <Text style={styles.calendarStar}>★</Text>
        </View>
        <View style={{ width: 14 }} />
        <Text style={styles.bigEmoji}>🦉</Text>
      </View>
      <Text style={styles.quizPaper}>📝</Text>
    </View>
  );
}

function IllustrationTiers() {
  // Podium of tier badges + cartoon character celebrating on top
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, []);
  const ty = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });

  return (
    <View style={styles.illoBox}>
      <Animated.Text style={[styles.champ, { transform: [{ translateY: ty }] }]}>🦸</Animated.Text>
      <View style={styles.podiumRow}>
        <View style={[styles.podiumBlock, styles.podiumSilver]}>
          <Text style={styles.podiumMedal}>🥈</Text>
          <Text style={styles.podiumLabel}>SILVER</Text>
        </View>
        <View style={[styles.podiumBlock, styles.podiumGold]}>
          <Text style={styles.podiumMedal}>🏆</Text>
          <Text style={styles.podiumLabel}>GOLD</Text>
        </View>
        <View style={[styles.podiumBlock, styles.podiumBronze]}>
          <Text style={styles.podiumMedal}>🥉</Text>
          <Text style={styles.podiumLabel}>BRONZE</Text>
        </View>
      </View>
    </View>
  );
}

const ILLOS = {
  welcome: IllustrationWelcome,
  find:    IllustrationFind,
  daily:   IllustrationDaily,
  tiers:   IllustrationTiers,
};

// ------------------------------------------------------------ slide
function Slide({ item, isActive }) {
  const illoY = useRef(new Animated.Value(80)).current;
  const titleOp = useRef(new Animated.Value(0)).current;
  const bodyOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) {
      illoY.setValue(80); titleOp.setValue(0); bodyOp.setValue(0);
      return;
    }
    Animated.sequence([
      Animated.spring(illoY, { toValue: 0, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(titleOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(bodyOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [isActive]);

  const Illo = ILLOS[item.key];

  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Animated.View style={{ transform: [{ translateY: illoY }] }}>
        <Illo />
      </Animated.View>
      <Animated.Text style={[styles.title, { opacity: titleOp }]}>{item.title}</Animated.Text>
      <Animated.Text style={[styles.body, { opacity: bodyOp }]}>{item.body}</Animated.Text>
    </View>
  );
}

// ------------------------------------------------------------ main
export default function OnboardingScreen({ navigation }) {
  const { setSetting } = useSettings();
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  // Bouncy START button on the final slide.
  const startBounce = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (index === SLIDES.length - 1) {
      Animated.loop(Animated.sequence([
        Animated.timing(startBounce, { toValue: 1.06, duration: 500, useNativeDriver: true }),
        Animated.timing(startBounce, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start();
    }
  }, [index]);

  function go(i) {
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  }

  function finish() {
    // eslint-disable-next-line global-require
    const { markOnboardingSeen } = require('../utils/storage');
    markOnboardingSeen().catch(() => {});
    setSetting('hasSeenOnboarding', true);
    navigation.replace('Home');
  }

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <FloatingStars />
      {/* Soft glowing orbs */}
      <View style={[styles.orb, { backgroundColor: '#a855f7', top: -120, right: -80 }]} />
      <View style={[styles.orb, { backgroundColor: '#22c55e', bottom: -140, left: -100, opacity: 0.18 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <View />
          <TouchableOpacity onPress={finish} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => `s${i}`}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setIndex(i);
          }}
          renderItem={({ item, index: i }) => <Slide item={item} isActive={i === index} />}
        />

        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: ['#475569', '#475569', '#475569', '#475569'][i] },
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.bottomRow}>
          {index < SLIDES.length - 1 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.nextBtn}
              onPress={() => go(Math.min(SLIDES.length - 1, index + 1))}
            >
              <Text style={styles.nextText}>Next </Text>
            </TouchableOpacity>
          ) : (
            <Animated.View style={{ transform: [{ scale: startBounce }] }}>
              <TouchableOpacity activeOpacity={0.9} style={styles.startBtn} onPress={finish}>
                <Text style={styles.startText}>▶  START</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ------------------------------------------------------------ styles
const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,10,50,0.78)' },
  orb: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.22 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  skipBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 2, borderColor: '#22c55e',
  },
  skipText: { color: '#86efac', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },

  slide: { alignItems: 'center', justifyContent: 'center', padding: 28, flex: 1 },
  title: {
    color: '#fde68a', fontSize: 28, fontWeight: '900', marginTop: 32, textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: '#7c3aed', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8,
  },
  body: {
    color: '#e2e8f0', fontSize: 15, textAlign: 'center', marginTop: 14, lineHeight: 22,
    paddingHorizontal: 6, fontWeight: '600',
  },

  // Illustration shared
  illoBox: {
    width: 220, height: 220, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)', borderRadius: 110,
    borderWidth: 4, borderColor: '#a855f7',
    shadowColor: '#a855f7', shadowOpacity: 0.7, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    overflow: 'hidden',
  },
  bigEmoji: { fontSize: 80 },
  row: { flexDirection: 'row', alignItems: 'center' },

  // Welcome
  bookGlow: {
    position: 'absolute', bottom: 26,
    width: 70, height: 70, borderRadius: 35,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(252,211,77,0.25)',
    borderWidth: 3, borderColor: '#fde047',
    shadowColor: '#fde047', shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  bookEmoji: { fontSize: 36 },
  floatA: { position: 'absolute', top: 14, left: 22, fontSize: 28, fontWeight: '900', color: '#fb7185' },
  floatB: { position: 'absolute', top: 26, right: 26, fontSize: 32, fontWeight: '900', color: '#22d3ee' },
  floatC: { position: 'absolute', top: 70, right: 14, fontSize: 26, fontWeight: '900', color: '#facc15' },

  // Find
  gridWrap: {
    width: 150, height: 150, flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  gridTile: {
    width: 42, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.4)',
  },
  gridLetter: { color: '#fff', fontSize: 18, fontWeight: '900' },
  swipeHand: { position: 'absolute', fontSize: 50, bottom: 28 },
  starPop: { position: 'absolute', fontSize: 22 },

  // Daily
  confetti: { position: 'absolute', fontSize: 22 },
  calendarCard: {
    width: 80, height: 92, borderRadius: 14,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#f59e0b', borderBottomWidth: 7, borderBottomColor: '#7c2d12',
  },
  calendarTop: {
    backgroundColor: '#ef4444', color: '#fff',
    paddingHorizontal: 12, paddingVertical: 2, fontSize: 10, fontWeight: '900',
    borderRadius: 6, position: 'absolute', top: 6,
  },
  calendarDay: { color: '#0f172a', fontSize: 28, fontWeight: '900', marginTop: 14 },
  calendarStar: { color: '#facc15', fontSize: 22, position: 'absolute', bottom: 6, right: 10 },
  quizPaper: { position: 'absolute', bottom: 14, fontSize: 36 },

  // Tiers
  champ: { fontSize: 56, marginBottom: 6 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  podiumBlock: {
    width: 52, alignItems: 'center', justifyContent: 'flex-end',
    paddingTop: 6, paddingBottom: 4,
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 5,
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
  },
  podiumGold:   { height: 80, backgroundColor: '#facc15', borderBottomColor: '#a16207' },
  podiumSilver: { height: 64, backgroundColor: '#cbd5e1', borderBottomColor: '#475569' },
  podiumBronze: { height: 52, backgroundColor: '#d97706', borderBottomColor: '#7c2d12' },
  podiumMedal: { fontSize: 22 },
  podiumLabel: { color: '#0f172a', fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  // Dots
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: '#22c55e', width: 24 },

  bottomRow: { paddingHorizontal: 24, paddingBottom: 22 },
  nextBtn: {
    paddingVertical: 18, borderRadius: 999, alignItems: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 8, borderBottomColor: '#14532d',
  },
  nextText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  startBtn: {
    paddingVertical: 22, borderRadius: 999, alignItems: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 4, borderColor: '#fff', borderBottomWidth: 10, borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.8, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  startText: {
    color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
});
