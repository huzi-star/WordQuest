import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ImageBackground, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import {
  PRACTICE_DIFFICULTIES,
  nextPracticeDifficulty,
} from '../utils/practice';

export default function PracticeResultScreen({ navigation, route }) {
  const {
    passed = false,
    wordsFound = 0,
    totalWords = 0,
    currentDifficulty = 'easy',
    category = '',
    categoryEmoji = '',
    sessionStats = null,
  } = route.params || {};

  const nextDiff = nextPracticeDifficulty(currentDifficulty, passed);
  const nextCfg = PRACTICE_DIFFICULTIES[nextDiff];
  const curCfg = PRACTICE_DIFFICULTIES[currentDifficulty];

  const fade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -5, duration: 600, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const title = passed ? 'Round Complete! ✅' : 'Round Failed! ⏱';
  // Practice is rank-free — no points / no high score messaging.
  const message = passed
    ? `Nice work! Next round: ${nextCfg.label}`
    : `Difficulty going down. Next round: ${nextCfg.label}`;

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={[styles.tint, { backgroundColor: passed ? 'rgba(13,80,80,0.62)' : 'rgba(80,30,30,0.72)' }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View
            style={[
              styles.titleWrap,
              { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
            ]}
          >
            <View style={[styles.titlePlate, passed ? styles.titlePass : styles.titleFail]}>
              <Text style={styles.titleText}>{title}</Text>
            </View>
            <View style={styles.unrankedChip}>
              <Text style={styles.unrankedText}>🦉 PRACTICE · UNRANKED</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.card,
              { opacity: fade, transform: [{ scale: cardScale }] },
            ]}
          >
            <Text style={styles.message}>{message}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>WORDS LEARNT</Text>
                <Text style={styles.statVal}>{wordsFound}/{totalWords}</Text>
              </View>
            </View>

            <View style={styles.diffRow}>
              <View style={styles.diffCol}>
                <Text style={styles.diffLabel}>THIS ROUND</Text>
                <View style={[styles.diffBadge, { backgroundColor: curCfg.color }]}>
                  <Text style={styles.diffBadgeText}>{curCfg.label}</Text>
                </View>
              </View>
              <Text style={styles.arrow}>{passed ? '⬆' : '⬇'}</Text>
              <View style={styles.diffCol}>
                <Text style={styles.diffLabel}>NEXT ROUND</Text>
                <View style={[styles.diffBadge, { backgroundColor: nextCfg.color }]}>
                  <Text style={styles.diffBadgeText}>{nextCfg.label}</Text>
                </View>
              </View>
            </View>

            {category ? (
              <Text style={styles.catLine}>Category: {category} {categoryEmoji}</Text>
            ) : null}

            <View style={styles.disclaimerPill}>
              <Text style={styles.disclaimerText}>
                Practice mode never affects your tier or ranking.
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={{ transform: [{ translateY: bob }], marginTop: 22 }}>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.85}
              onPress={() => {
                navigation.replace('Practice', {
                  difficulty: nextDiff,
                  // Hints reset per round, scaled to the next difficulty.
                  lastCategory: category,
                  sessionStats,
                });
              }}
            >
              <Text style={styles.primaryText}>▶ NEXT ROUND</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.endBtn}
            activeOpacity={0.85}
            onPress={() => navigation.replace('Home')}
          >
            <Text style={styles.endText}>🏠 End Practice</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  tint: { ...StyleSheet.absoluteFillObject },
  scroll: { padding: 20, paddingTop: 30, gap: 14 },

  titleWrap: { alignItems: 'center', gap: 8 },
  titlePlate: {
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 20, borderWidth: 3,
    borderBottomWidth: 7, borderBottomColor: '#082f49',
  },
  titlePass: { backgroundColor: '#0c4a6e', borderColor: '#38bdf8' },
  titleFail: { backgroundColor: '#7f1d1d', borderColor: '#ef4444', borderBottomColor: '#450a0a' },
  titleText: {
    color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  unrankedChip: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    backgroundColor: '#7c3aed',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#4c1d95',
  },
  unrankedText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  card: {
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 22, padding: 18, gap: 14,
    borderWidth: 3, borderColor: '#38bdf8',
    borderBottomWidth: 9, borderBottomColor: '#082f49',
  },
  message: { color: '#e0f2fe', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1, alignItems: 'center',
    backgroundColor: 'rgba(8,47,73,0.7)',
    borderRadius: 14, padding: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  statLabel: { color: '#bae6fd', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  statVal: {
    color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  diffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  diffCol: { alignItems: 'center' },
  diffLabel: { color: '#bae6fd', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  diffBadge: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  diffBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  arrow: { color: '#fde68a', fontSize: 30, fontWeight: '900' },

  catLine: { color: '#bae6fd', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  disclaimerPill: {
    alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderWidth: 1, borderColor: 'rgba(196,181,253,0.5)',
  },
  disclaimerText: { color: '#ddd6fe', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  primaryBtn: {
    paddingVertical: 18, borderRadius: 999, alignItems: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  primaryText: {
    color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },

  endBtn: {
    paddingVertical: 14, borderRadius: 16, alignItems: 'center', marginTop: 10,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  endText: {
    color: '#fff', fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});
