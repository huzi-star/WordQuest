import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  Vibration, BackHandler, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import WordGrid from '../components/WordGrid';
import WordList from '../components/WordList';
import Timer from '../components/Timer';
import ConfirmModal from '../components/ConfirmModal';
import ScorePopup from '../components/ScorePopup';
import Confetti from '../components/Confetti';
import WordDetailCard from '../components/WordDetailCard';
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_HINTS_PER_DIFFICULTY,
  fetchPracticeRound,
} from '../utils/practice';
import {
  recordPracticeRound,
  setPracticeDifficulty,
} from '../utils/storage';
import { initSound, playSfx, playBgm, stopBgm } from '../utils/sound';
import { useSettings } from '../utils/settings';
import { trace } from '../utils/trace';
import { validateWord } from '../utils/api';

export default function PracticeScreen({ navigation, route }) {
  const { settings } = useSettings();
  const startingDifficulty = route.params?.difficulty || 'easy';
  // Hints are now PER-ROUND (not session-wide) and scale with the current
  // difficulty — easy 1 · medium 2 · hard 3 — same rule as Pakistan Quest.
  const initialHintsLeft = PRACTICE_HINTS_PER_DIFFICULTY[startingDifficulty] || 1;
  const lastCategory = route.params?.lastCategory || '';
  // Session-scoped stats for Chaalbaaz tune. Carried via route.params across rounds.
  const sessionStats = route.params?.sessionStats || {
    roundsPlayed: 0, currentStreak: 0, avgWordsFound: 0, avgTimeLeft: 0,
    totalWordsFound: 0, totalTimeLeft: 0,
  };

  const [difficulty, setDifficulty] = useState(startingDifficulty);
  const [level, setLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [foundCells, setFoundCells] = useState([]);
  const [foundWords, setFoundWords] = useState([]);
  const [detailWord, setDetailWord] = useState(null);
  // Holds round-complete args if the round ends while the learning card
  // is still open. Navigation fires only when the user taps "Continue".
  const pendingFinishRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [popups, setPopups] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [justFoundCells, setJustFoundCells] = useState([]);
  const [hintsLeft, setHintsLeft] = useState(initialHintsLeft);
  const [revealedHints, setRevealedHints] = useState([]);
  const [exitOpen, setExitOpen] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  const timeLeftRef = useRef(0);
  // Imperative handle for the Timer so we can grant the +3s hard-difficulty
  // bonus per word found (mirrors Pakistan Quest / Quick Play).
  const timerRef = useRef(null);
  const popupIdRef = useRef(0);
  const finishedRef = useRef(false);

  const cfg = PRACTICE_DIFFICULTIES[difficulty] || PRACTICE_DIFFICULTIES.easy;
  const wordList = useMemo(
    () => (level?.words || []).map((w) => String(w).toUpperCase()),
    [level?.words],
  );

  useEffect(() => {
    initSound();
    playBgm('game', { volume: 0.22 });
    return () => { stopBgm(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      // Thread the userId so the backend guardrail's per-kid repeat
      // window keeps science-y / too-hard words from coming back twice.
      let uid = null;
      try {
        const { supabase } = require('../utils/supabase');
        if (supabase) { const u = await supabase.auth.getUser(); uid = u?.data?.user?.id || null; }
      } catch (_) {}
      const res = await fetchPracticeRound({ difficulty, lastCategory, playerStats: sessionStats, userId: uid });
      if (cancelled) return;
      if (res?.ok && res.result?.grid) {
        setLevel(res.result);
        timeLeftRef.current = res.result.timeLimit;
        await setPracticeDifficulty(difficulty);
        trace('practice', `round-start ${difficulty}`, {
          difficulty,
          category: res.result.category,
          wordCount: res.result.wordCount,
        });
      } else {
        setLoadError(res?.error || 'Could not load practice round');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [difficulty]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPaused(true);
      setExitOpen(true);
      return true;
    });
    return () => sub.remove();
  }, []);

  function spawnPopup(text, x, y, color = '#22c55e') {
    const id = ++popupIdRef.current;
    setPopups((arr) => [...arr, { id, text, x, y, color }]);
    setTimeout(() => setPopups((arr) => arr.filter((p) => p.id !== id)), 1500);
  }

  function shakeGrid() {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function clearSelection() { setSelected([]); }

  function useHint() {
    if (hintsLeft <= 0) return;
    const unfound = (level?.wordPositions || []).filter(
      (p) => !foundWords.includes(String(p.word).toUpperCase()),
    );
    if (!unfound.length) return;
    const pick = unfound[Math.floor(Math.random() * unfound.length)];
    const wordCells = [];
    const dr = pick.direction === 'horizontal' ? 0
      : pick.direction === 'vertical' ? 1
      : pick.direction === 'diagonalDR' ? 1
      : 1;
    const dc = pick.direction === 'horizontal' ? 1
      : pick.direction === 'vertical' ? 0
      : pick.direction === 'diagonalDR' ? 1
      : -1;
    for (let i = 0; i < pick.word.length; i++) {
      wordCells.push({ r: pick.startRow + dr * i, c: pick.startCol + dc * i });
    }
    const stillHidden = wordCells.filter(
      (cell) => !revealedHints.some((h) => h.r === cell.r && h.c === cell.c),
    );
    const reveal = stillHidden[0] || wordCells[0];
    setRevealedHints((arr) => [...arr, reveal]);
    setHintsLeft((n) => n - 1);
    Vibration.vibrate(40);
    spawnPopup(`💡 Hint`, 180, 360, '#f97316');
  }

  const DIR_STEPS = {
    horizontal: { dr: 0, dc: 1 },
    vertical:   { dr: 1, dc: 0 },
    diagonalDR: { dr: 1, dc: 1 },
    diagonalDL: { dr: 1, dc: -1 },
  };

  function findWordPositionCells(word) {
    const pos = (level?.wordPositions || []).find(
      (p) => String(p.word).toUpperCase() === word,
    );
    if (!pos) return [];
    const { dr = 0, dc = 1 } = DIR_STEPS[pos.direction] || DIR_STEPS.horizontal;
    const cells = [];
    for (let i = 0; i < word.length; i++) {
      cells.push({ r: pos.startRow + dr * i, c: pos.startCol + dc * i });
    }
    return cells;
  }

  function attemptValidation(currentLetters) {
    const upper = currentLetters.map((s) => s.letter).join('');
    // Fire-and-forget refereeAgent telemetry so every Practice word
    // attempt (valid or invalid) appears in the admin pipeline.
    try {
      validateWord({
        word: upper,
        validWords: wordList,
        timeLeftSec: 999,
        streak: 0,
        currentScore: 0,
      }).catch(() => {});
    } catch (_) {}
    if (!wordList.includes(upper) || foundWords.includes(upper)) {
      shakeGrid();
      if (settings.sound) playSfx('wrong', { volume: 0.5 });
      Vibration.vibrate(120);
      clearSelection();
      return;
    }

    const cellsForWord = findWordPositionCells(upper);
    const mergedCells = [...foundCells, ...cellsForWord];
    const newFoundWords = [...foundWords, upper];
    setFoundCells(mergedCells);
    setFoundWords(newFoundWords);
    setDetailWord(upper);
    setJustFoundCells(cellsForWord);
    setTimeout(() => setJustFoundCells([]), 900);

    if (settings.vibration) Vibration.vibrate(40);
    if (settings.sound) playSfx('word_found', { volume: 1.0 });

    // Per-word time bonus — ONLY on hard difficulty (+3 sec). Easy and
    // Medium get no bonus (matches Pakistan Quest's rule). Practice is
    // unranked, so this just gives a tiny breathing room on the hardest tier.
    if (difficulty === 'hard') {
      try { timerRef.current?.addSeconds && timerRef.current.addSeconds(3); } catch (_) {}
    }

    // Practice mode is purely for skill building — no point award, no
    // high score, no tier, no leaderboard. Nothing about the player's
    // ranked profile is touched by a Practice word find.

    clearSelection();

    if (newFoundWords.length === wordList.length) {
      if (settings.sound) playSfx('win', { volume: 1.0 });
      // Hold the round-complete navigation until the player closes the
      // learning card for the last word. The card is still on screen
      // right now (we just opened it for `upper`).
      pendingFinishRef.current = { passed: true, wordsFound: newFoundWords.length };
    }
  }

  function isValidLine(cells) {
    if (cells.length <= 1) return true;
    const dr = cells[1].r - cells[0].r;
    const dc = cells[1].c - cells[0].c;
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return false;
    if (dr === 0 && dc === 0) return false;
    for (let i = 1; i < cells.length; i++) {
      const er = cells[i - 1].r + dr;
      const ec = cells[i - 1].c + dc;
      if (cells[i].r !== er || cells[i].c !== ec) return false;
    }
    return true;
  }

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  function onCellEnter(r, c, letter) {
    const current = selectedRef.current;
    const alreadyIdx = current.findIndex((s) => s.r === r && s.c === c);
    if (alreadyIdx >= 0) return;
    const candidate = [...current, { r, c, letter }];
    const next = isValidLine(candidate) ? candidate : [{ r, c, letter }];
    setSelected(next);
    selectedRef.current = next;
    const attempt = next.map((s) => s.letter).join('');
    if (wordList.includes(attempt)) attemptValidation(next);
  }

  function onLineUpdate(cells) {
    if (!cells || !cells.length) return;
    setSelected(cells);
    selectedRef.current = cells;
    const attempt = cells.map((s) => s.letter).join('');
    if (wordList.includes(attempt)) {
      attemptValidation(cells);
      return;
    }
    const reversed = [...cells].reverse().map((s) => s.letter).join('');
    if (wordList.includes(reversed)) {
      attemptValidation([...cells].reverse());
    }
  }

  function onSelectionEnd(wasDrag) {
    const current = selectedRef.current;
    if (!wasDrag || current.length < 2) return;
    const attempt = current.map((s) => s.letter).join('');
    if (wordList.includes(attempt)) attemptValidation(current);
    else clearSelection();
  }

  function onTick(t) { timeLeftRef.current = t; }

  function onTimeUp() {
    if (paused || finishedRef.current) return;
    // If the learning card is still on screen when the timer expires,
    // defer navigation so the player can finish reading + tap Continue.
    if (detailWord) {
      pendingFinishRef.current = { passed: false, wordsFound: foundWords.length };
      return;
    }
    finishRound({ passed: false, wordsFound: foundWords.length });
  }

  async function finishRound({ passed, wordsFound }) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPaused(true);
    if (passed) setShowConfetti(true);

    await recordPracticeRound({ won: !!passed });
    trace('practice', passed ? 'round-pass' : 'round-fail', {
      difficulty,
      category: level?.category,
      wordsFound,
      total: wordList.length,
    });

    // (learningPathAgent removed — practice rounds no longer feed memory.)

    // Update session stats for Chaalbaaz on the NEXT round.
    const rounds = (sessionStats.roundsPlayed || 0) + 1;
    const totalWordsFound = (sessionStats.totalWordsFound || 0) + wordsFound;
    const totalTimeLeft = (sessionStats.totalTimeLeft || 0) + (timeLeftRef.current || 0);
    const nextSessionStats = {
      roundsPlayed: rounds,
      currentStreak: passed ? (sessionStats.currentStreak || 0) + 1 : 0,
      totalWordsFound,
      totalTimeLeft,
      avgWordsFound: totalWordsFound / rounds,
      avgTimeLeft: totalTimeLeft / rounds,
    };

    setTimeout(() => {
      navigation.replace('PracticeResult', {
        passed,
        wordsFound,
        totalWords: wordList.length,
        currentDifficulty: difficulty,
        category: level?.category,
        categoryEmoji: level?.categoryEmoji,
        sessionStats: nextSessionStats,
      });
    }, passed ? 1400 : 500);
  }

  if (loading) {
    return <PracticeLoading difficulty={difficulty} cfg={cfg} />;
  }

  if (loadError || !level) {
    return (
      <ImageBackground source={BG} style={styles.bgFull} resizeMode="cover">
        <View style={styles.tealTint} />
        <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
          <Text style={styles.loadingTitle}>😕 Couldn't load round</Text>
          <Text style={styles.loadingSub}>{loadError || 'Unknown error'}</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnHint, { marginTop: 20, paddingHorizontal: 30, flex: 0 }]}
            onPress={() => navigation.replace('Home')}
          >
            <Text style={styles.btnText}>← Back to Home</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const currentSelection = selected.map((s) => s.letter).join('');

  return (
    <ImageBackground source={BG} style={styles.bgFull} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={styles.container}>
        {level?.chaalbaazActive ? (
          <View style={styles.chaalbaazBanner}>
            <Text style={styles.chaalbaazTitle}>😏 ADVERSARY ACTIVATED</Text>
            <Text style={styles.chaalbaazSub}>
              {level.chaalbaazReason || 'Chaalbaaz cranked up the difficulty!'}
            </Text>
          </View>
        ) : null}
        <View style={styles.topBar}>
          <View style={[styles.diffBadge, { backgroundColor: cfg.color }]}>
            <Text style={styles.diffBadgeText}>{cfg.label}</Text>
          </View>
          <View style={styles.topCenter}>
            <Text style={styles.topLabel}>TIME</Text>
            <Timer
              ref={timerRef}
              timeLimit={cfg.timeLimit}
              onTimeUp={onTimeUp}
              onTick={onTick}
              paused={paused || !!detailWord}
            />
          </View>
          <View style={styles.hintCol}>
            <Text style={styles.topLabel}>HINTS</Text>
            <Text style={styles.hintCount}>💡 {hintsLeft}</Text>
          </View>
        </View>

        <View style={styles.catRow}>
          <View style={styles.catPill}>
            <Text style={styles.catText}>
              Category: {level.category} {level.categoryEmoji}
            </Text>
          </View>
          <View style={styles.unrankedPill}>
            <Text style={styles.unrankedText}>UNRANKED</Text>
          </View>
        </View>

        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <WordGrid
            grid={level.grid}
            onCellEnter={onCellEnter}
            onSelectionEnd={onSelectionEnd}
            onLineUpdate={onLineUpdate}
            selectedCells={selected}
            foundCells={foundCells}
            justFoundCells={justFoundCells}
            hintedCells={revealedHints}
            goldCells={[]}
          />
        </Animated.View>

        <WordList words={wordList} foundWords={foundWords} currentSelection={currentSelection} />

        <View style={styles.actions}>
          {hintsLeft > 0 ? (
            <TouchableOpacity style={[styles.btn, styles.btnHint]} onPress={useHint}>
              <Text style={styles.btnText}>💡 Hint ({hintsLeft})</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.btn, styles.btnHintDisabled]}>
              <Text style={styles.btnTextMuted}>No hints remaining</Text>
            </View>
          )}
          <TouchableOpacity style={[styles.btn, styles.btnClear]} onPress={clearSelection}>
            <Text style={styles.btnText}>✕ Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnQuit]}
            onPress={() => { setPaused(true); setExitOpen(true); }}
          >
            <Text style={styles.btnText}>End</Text>
          </TouchableOpacity>
        </View>

        {popups.map((p) => (
          <ScorePopup key={p.id} text={p.text} x={p.x} y={p.y} color={p.color} />
        ))}
        <Confetti visible={showConfetti} onDone={() => setShowConfetti(false)} />

        <ConfirmModal
          visible={exitOpen}
          icon="🦉"
          title="End Practice?"
          message="Your practice session will end. High score gains are saved. No rank is affected."
          cancelText="Keep Practising"
          confirmText="End Session"
          confirmVariant="danger"
          onCancel={() => { setExitOpen(false); setPaused(false); }}
          onConfirm={() => { setExitOpen(false); navigation.replace('Home'); }}
        />

        <WordDetailCard
          visible={!!detailWord}
          word={detailWord || ''}
          tier="bronze"
          category={level?.category}
          onClose={() => {
            setDetailWord(null);
            // If the round was held pending this card close, finish now.
            const pending = pendingFinishRef.current;
            if (pending) {
              pendingFinishRef.current = null;
              finishRound(pending);
            }
          }}
        />
      </SafeAreaView>
    </ImageBackground>
  );
}

// ---------------------------------------------------------------- Loading

const LOADING_TIPS = [
  'Swipe across letters to find hidden words!',
  'Complete all words to move to the next level!',
  'Use hints wisely — only 3 per session!',
  'Practice here, shine in Quick Play!',
  'Every word you find builds your vocabulary!',
];

function FloatingLetters() {
  const items = useRef(
    Array.from({ length: 14 }).map((_, i) => ({
      key: i,
      char: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      x: Math.random() * 100,
      size: 18 + Math.random() * 22,
      duration: 9000 + Math.random() * 7000,
      delay: Math.random() * 3000,
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
            left: `${a.x}%`,
            top: -40,
            fontSize: a.size,
            color: '#facc15',
            opacity: 0.55,
            fontWeight: '900',
            textShadowColor: 'rgba(0,0,0,0.7)',
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 4,
            transform: [
              {
                translateY: a.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 900],
                }),
              },
              {
                rotate: a.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-15deg', '15deg'],
                }),
              },
            ],
          }}
        >
          {a.char}
        </Animated.Text>
      ))}
    </View>
  );
}

function PracticeLoading({ difficulty, cfg }) {
  const blink = useRef(new Animated.Value(1)).current;
  const bubble = useRef(new Animated.Value(0.6)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    // Eye blink — close briefly every 2s.
    Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]),
    ).start();
    // Thinking bubble pulse.
    Animated.loop(
      Animated.sequence([
        Animated.timing(bubble, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(bubble, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
    // Loading bar sweep.
    Animated.loop(
      Animated.timing(bar, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: false }),
    ).start();
    // Sparkle rotate.
    Animated.loop(
      Animated.timing(sparkle, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    // Rotate tips every 2s.
    const id = setInterval(() => setTipIdx((i) => (i + 1) % LOADING_TIPS.length), 2000);
    return () => clearInterval(id);
  }, []);

  const tip = LOADING_TIPS[tipIdx];

  return (
    <View style={loadingStyles.container}>
      <FloatingLetters />

      <View style={loadingStyles.card}>
        {/* Cartoon owl */}
        <View style={loadingStyles.owlWrap}>
          <Animated.View
            style={[
              loadingStyles.thoughtBubble,
              {
                opacity: bubble,
                transform: [
                  {
                    scale: bubble.interpolate({
                      inputRange: [0.5, 1],
                      outputRange: [0.85, 1.05],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={loadingStyles.thoughtDots}>•••</Text>
          </Animated.View>
          <View style={loadingStyles.owlBody}>
            <Text style={loadingStyles.owlBrow}>⌒    ⌒</Text>
            <View style={loadingStyles.owlEyesRow}>
              <View style={loadingStyles.owlEye}>
                <Animated.View
                  style={[
                    loadingStyles.owlPupil,
                    { transform: [{ scaleY: blink }] },
                  ]}
                />
              </View>
              <View style={loadingStyles.owlEye}>
                <Animated.View
                  style={[
                    loadingStyles.owlPupil,
                    { transform: [{ scaleY: blink }] },
                  ]}
                />
              </View>
            </View>
            <Text style={loadingStyles.owlBeak}>♦</Text>
          </View>
        </View>

        {/* Difficulty badge */}
        <View style={[loadingStyles.diffBadge, { backgroundColor: cfg.color }]}>
          <Text style={loadingStyles.diffBadgeText}>{cfg.label} Round</Text>
        </View>

        {/* Loading text */}
        <Text style={loadingStyles.loadingText}>Getting your puzzle ready…</Text>

        {/* Loading bar with rotating sparkles */}
        <View style={loadingStyles.barRow}>
          <Animated.Text
            style={[
              loadingStyles.sparkle,
              {
                transform: [
                  {
                    rotate: sparkle.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            ✦
          </Animated.Text>
          <View style={loadingStyles.barTrack}>
            <Animated.View
              style={[
                loadingStyles.barFill,
                {
                  width: bar.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ['10%', '70%', '100%'],
                  }),
                  opacity: bar.interpolate({
                    inputRange: [0, 0.9, 1],
                    outputRange: [1, 1, 0],
                  }),
                },
              ]}
            />
          </View>
          <Animated.Text
            style={[
              loadingStyles.sparkle,
              {
                transform: [
                  {
                    rotate: sparkle.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['360deg', '0deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            ✦
          </Animated.Text>
        </View>
      </View>

      <View style={loadingStyles.tipBox}>
        <Text style={loadingStyles.tipText}>💡 {tip}</Text>
      </View>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    overflow: 'hidden',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 26,
    paddingTop: 36, paddingBottom: 24, paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#a78bfa',
    borderBottomWidth: 10, borderBottomColor: '#4c1d95',
    shadowColor: '#a78bfa',
    shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  owlWrap: {
    width: 130, height: 130,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  thoughtBubble: {
    position: 'absolute', top: -10, right: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#fff', borderRadius: 999,
    borderWidth: 2, borderColor: '#a78bfa',
  },
  thoughtDots: { color: '#4c1d95', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  owlBody: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#fde68a',
    borderBottomWidth: 8, borderBottomColor: '#4c1d95',
  },
  owlBrow: {
    color: '#fde68a', fontSize: 18, fontWeight: '900',
    marginBottom: -2,
  },
  owlEyesRow: { flexDirection: 'row', gap: 10, marginVertical: 2 },
  owlEye: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0f172a',
  },
  owlPupil: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0f172a' },
  owlBeak: { color: '#fbbf24', fontSize: 14, marginTop: 2 },

  diffBadge: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999,
    borderWidth: 2.5, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  diffBadgeText: {
    color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  loadingText: {
    color: '#e0e7ff', fontSize: 14, fontWeight: '700',
    marginTop: 16, textAlign: 'center',
  },

  barRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 16, alignSelf: 'stretch',
  },
  sparkle: {
    color: '#fde68a', fontSize: 20, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  barTrack: {
    flex: 1, height: 12, borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.25)',
    overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(196,181,253,0.5)',
  },
  barFill: {
    height: '100%', borderRadius: 999,
    backgroundColor: '#22c55e',
  },

  tipBox: {
    marginTop: 22,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderWidth: 2, borderColor: 'rgba(253,224,71,0.55)',
    borderBottomWidth: 5, borderBottomColor: 'rgba(120,53,15,0.45)',
    shadowColor: '#fde68a',
    shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    maxWidth: 320,
  },
  tipText: {
    color: '#fde68a',
    fontSize: 13, fontWeight: '800', letterSpacing: 0.4,
    textAlign: 'center', lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});

const styles = StyleSheet.create({
  bgFull: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,80,80,0.6)' },
  container: { flex: 1, paddingHorizontal: 12, paddingTop: 18, paddingBottom: 12 },

  chaalbaazBanner: {
    backgroundColor: 'rgba(127, 29, 29, 0.55)',
    borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#f97316',
  },
  chaalbaazTitle: { color: '#fcd34d', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  chaalbaazSub: { color: '#fed7aa', marginTop: 4, fontSize: 13 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#0c4a6e',
    borderWidth: 3, borderColor: '#38bdf8',
    borderBottomWidth: 7, borderBottomColor: '#082f49',
  },
  diffBadge: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  diffBadgeText: {
    color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  topCenter: { alignItems: 'center', flex: 1 },
  hintCol: { alignItems: 'flex-end' },
  topLabel: { color: '#bae6fd', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  hintCount: {
    color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 },
  catPill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#38bdf8',
    borderBottomWidth: 5, borderBottomColor: '#082f49',
  },
  catText: { color: '#e0f2fe', fontSize: 13, fontWeight: '900' },
  unrankedPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: '#7c3aed',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#4c1d95',
  },
  unrankedText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },

  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 16, alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  btnHint: {
    backgroundColor: '#f59e0b',
    borderBottomWidth: 7, borderBottomColor: '#78350f',
  },
  btnHintDisabled: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.4)',
  },
  btnClear: {
    backgroundColor: '#475569',
    borderBottomWidth: 7, borderBottomColor: '#1e293b',
  },
  btnQuit: {
    backgroundColor: '#ef4444',
    borderBottomWidth: 7, borderBottomColor: '#7f1d1d',
  },
  btnText: {
    color: '#fff', fontWeight: '900', fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  btnTextMuted: { color: '#94a3b8', fontWeight: '900', fontSize: 12 },

  loadingTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  loadingSub: { color: '#cbd5e1', fontSize: 13, marginTop: 8, textAlign: 'center' },
});
