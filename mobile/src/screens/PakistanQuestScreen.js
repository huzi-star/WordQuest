import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, ImageBackground, BackHandler, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/auth';
import { pkQuestCategories, pkQuestLevel, pkQuestResult, validateWord } from '../utils/api';
import { playSfx } from '../utils/sound';
import WordGrid from '../components/WordGrid';
import WordList from '../components/WordList';
import Timer from '../components/Timer';
import WordDetailCard from '../components/WordDetailCard';

const BG = require('../../home_design/home_bg.jpeg');

// Visual labels for the AI-picked difficulty chip on the play screen.
const DIFF_LABEL = {
  easy:   { label: 'EASY',   color: '#16a34a', shadow: '#14532d', sub: '7×7 · 4 words · 90s' },
  medium: { label: 'MEDIUM', color: '#d97706', shadow: '#7c2d12', sub: '9×9 · 6 words · 75s' },
  hard:   { label: 'HARD',   color: '#dc2626', shadow: '#7f1d1d', sub: '11×11 · 8 words · 60s' },
};

// Hints per round — scales with the AI-picked difficulty.
const HINTS_PER_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

export default function PakistanQuestScreen({ navigation }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('pick'); // pick | play | done
  const [categories, setCategories] = useState([]);
  const [picked, setPicked] = useState({ category: null, difficulty: 'easy' });
  const [level, setLevel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [foundWords, setFoundWords] = useState([]);
  const [foundCells, setFoundCells] = useState([]);
  // Short-lived "just found" cells drive the reveal-line animation that
  // sweeps through the word's characters right after it's found, matching
  // the feedback already wired up in Quick Play / Practice / Battle.
  const [justFoundCells, setJustFoundCells] = useState([]);
  const [selected, setSelected] = useState([]);
  const selectedRef = useRef([]);
  // Pakistan Quest is a pure learning mode — no score, no points, no
  // bonuses. The found-word count + the learning card carry the value.
  // The found-word learning card (meaning, example, synonym, antonym, TTS,
  // English ↔ Urdu Nastaliq). Same UX as Quick Play / Practice but with
  // the language toggle restricted to Urdu only.
  const [detailWord, setDetailWord] = useState(null);
  // If the round ends while the learning card is up, defer navigation
  // until the player explicitly taps "Continue" on the card.
  const pendingFinishRef = useRef(null);
  // Hint counter (per round) + cells already revealed by hints so we never
  // re-reveal the same letter twice.
  const [hintsLeft, setHintsLeft] = useState(0);
  const [revealedHints, setRevealedHints] = useState([]);
  const resultSentRef = useRef(false);
  const timerRef = useRef(null);

  // Load category list on mount.
  useEffect(() => {
    (async () => {
      const r = await pkQuestCategories();
      if (r?.ok) setCategories(r.categories || []);
    })();
  }, []);

  // Hardware back: while in PLAY phase, return to picker (one press). The
  // note modal handles its own dismissal — so we only intercept back when
  // the modal isn't currently visible.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // The learning card itself swallows hardware back (must tap Continue),
      // so a real back press here means the user wants to leave the round.
      if (phase === 'play') { backToPicker(); return true; }
      if (phase === 'done') { backToPicker(); return true; }
      return false; // pick → let nav pop normally
    });
    return () => sub.remove();
  }, [phase]);  // eslint-disable-line

  // One-tap category start — server adapts difficulty per section memory.
  async function startCategory(categoryKey) {
    if (loading) return;
    setLoading(true);
    const r = await pkQuestLevel({ category: categoryKey, userId: user?.id });
    setLoading(false);
    if (!r?.ok || !r.level?.words?.length) return;
    const chosenDifficulty = (r.adaptive && r.adaptive.chosenDifficulty) || r.level.difficulty || 'easy';
    setLevel(r.level);
    setPicked({ category: categoryKey, difficulty: chosenDifficulty });
    setFoundWords([]); setFoundCells([]); setJustFoundCells([]); setSelected([]);
    // Hints scale with the difficulty the server just picked.
    setHintsLeft(HINTS_PER_DIFFICULTY[chosenDifficulty] || 1);
    setRevealedHints([]);
    selectedRef.current = [];
    resultSentRef.current = false;
    setPhase('play');
  }

  // Persist the finished round so the next /level call adapts to it. Fires
  // at most once per round — flag prevents double-submit on win+timer race.
  async function submitResult(passed) {
    if (resultSentRef.current) return;
    resultSentRef.current = true;
    if (!user?.id || !picked.category || !words.length) return;
    try {
      await pkQuestResult({
        userId: user.id,
        category: picked.category,
        difficulty: picked.difficulty,
        passed: !!passed,
        words,
      });
    } catch (_) { /* result POST is best-effort, never block UX */ }
  }

  function backToPicker() {
    setPhase('pick');
    setLevel(null);
    setDetailWord(null);
    setRevealedHints([]);
    setHintsLeft(0);
    pendingFinishRef.current = null;
  }

  const grid = useMemo(() => Array.isArray(level?.grid) ? level.grid : [], [level]);
  const positions = useMemo(() => Array.isArray(level?.wordPositions) ? level.wordPositions : [], [level]);
  const words = useMemo(() => (level?.words || []).map((w) => String(w).toUpperCase()), [level]);

  // Direction → step delta. Mirrors what Quick Play / Practice / Battle use,
  // because the level generator emits a `direction` field (and start row/col)
  // — it never emits endRow/endCol, so the old Math.sign(endRow-startRow)
  // logic always produced NaN cells and the green highlight never rendered.
  const DIR_STEPS = {
    horizontal: { dr: 0, dc: 1 },
    vertical:   { dr: 1, dc: 0 },
    diagonalDR: { dr: 1, dc: 1 },
    diagonalDL: { dr: 1, dc: -1 },
  };

  function findCellsFor(word) {
    const upper = String(word || '').toUpperCase();
    if (!upper) return [];
    const p = positions.find((x) => x && String(x.word || '').toUpperCase() === upper);
    if (!p) return [];
    const { dr = 0, dc = 1 } = DIR_STEPS[p.direction] || DIR_STEPS.horizontal;
    const cells = [];
    for (let i = 0; i < upper.length; i++) {
      cells.push({ r: (p.startRow || 0) + dr * i, c: (p.startCol || 0) + dc * i });
    }
    return cells;
  }

  // Reveal one letter of a random still-unfound word. Picks the first
  // cell of that word that hasn't already been hinted, so successive hints
  // on the same word reveal forward instead of repeating the same letter.
  function useHint() {
    if (hintsLeft <= 0) return;
    const unfound = (positions || []).filter(
      (p) => !foundWords.includes(String(p.word || '').toUpperCase()),
    );
    if (!unfound.length) return;
    const pick = unfound[Math.floor(Math.random() * unfound.length)];
    const wordCells = findCellsFor(String(pick.word || '').toUpperCase());
    if (!wordCells.length) return;
    const stillHidden = wordCells.filter(
      (cell) => !revealedHints.some((h) => h.r === cell.r && h.c === cell.c),
    );
    const reveal = stillHidden[0] || wordCells[0];
    setRevealedHints((arr) => [...arr, reveal]);
    setHintsLeft((n) => n - 1);
    try { Vibration.vibrate(40); } catch (_) {}
    try { playSfx('correct', { volume: 0.4 }); } catch (_) {}
  }

  function tryWord(cells) {
    if (!cells || cells.length < 2) return false;
    const attempt = cells.map((c) => c.letter).join('').toUpperCase();
    const reversed = [...cells].reverse().map((c) => c.letter).join('').toUpperCase();
    // Fire-and-forget refereeAgent telemetry — every PK Quest word
    // attempt (valid or invalid) appears in the admin pipeline.
    try {
      validateWord({
        word: attempt,
        validWords: words,
        timeLeftSec: 999,
        streak: 0,
        currentScore: 0,
      }).catch(() => {});
    } catch (_) {}
    let target = null;
    if (words.includes(attempt) && !foundWords.includes(attempt)) target = attempt;
    else if (words.includes(reversed) && !foundWords.includes(reversed)) target = reversed;
    if (!target) return false;
    const fromPositions = findCellsFor(target);
    const wordCells = (fromPositions && fromPositions.length) ? fromPositions : cells;
    const nextFound = [...foundWords, target];
    setFoundWords(nextFound);
    setFoundCells((prev) => {
      const seen = new Set(prev.map((c) => `${c.r}-${c.c}`));
      const merged = [...prev];
      for (const c of wordCells) if (!seen.has(`${c.r}-${c.c}`)) merged.push({ ...c, color: '#16a34a' });
      return merged;
    });
    // Trigger the sweep-line animation across the freshly-found cells,
    // then clear after 900ms (same timing as Quick Play / Practice).
    setJustFoundCells(wordCells);
    setTimeout(() => setJustFoundCells([]), 900);
    // Per-word time bonus: ONLY on hard difficulty (+3 sec). Easy/Medium
    // get no bonus — the base timer already covers it. No score change.
    if (picked.difficulty === 'hard' && timerRef.current?.addSeconds) {
      timerRef.current.addSeconds(3);
    }
    setSelected([]); selectedRef.current = [];
    playSfx('correct', { volume: 0.85 });
    // Pop the rich learning card — meaning, example, synonym, antonym,
    // TTS read-aloud, plus English ↔ Urdu (Nastaliq) toggle. Same UX as
    // Quick Play / Practice; the card stays up until the user taps
    // "Continue" so the round can't race past the learning moment.
    setDetailWord(target);
    if (nextFound.length >= words.length) {
      // Hold the result POST and the "done" transition until the player
      // closes the learning card for this last word.
      pendingFinishRef.current = { passed: true };
    }
    return true;
  }

  const onLineUpdate = useCallback((cells) => {
    setSelected(cells);
    selectedRef.current = cells;
    const a = cells.map((c) => c.letter).join('').toUpperCase();
    const rev = [...cells].reverse().map((c) => c.letter).join('').toUpperCase();
    if (words.includes(a) || words.includes(rev)) tryWord(cells);
  }, [words, foundWords, positions]);

  const onSelectionEnd = useCallback((wasDrag) => {
    const cells = selectedRef.current || [];
    if (!cells.length) return;
    if (wasDrag) { if (!tryWord(cells)) { setSelected([]); selectedRef.current = []; } return; }
    tryWord(cells);
  }, [words, foundWords, positions]);

  function handleCellEnter(r, c, letter) {
    const cur = selectedRef.current || [];
    if (cur.find((p) => p.r === r && p.c === c)) return;
    const next = [...cur, { r, c, letter }];
    selectedRef.current = next;
    setSelected(next);
    const a = next.map((p) => p.letter).join('').toUpperCase();
    const rev = [...next].reverse().map((p) => p.letter).join('').toUpperCase();
    if (words.includes(a) || words.includes(rev)) tryWord(next);
  }

  // ============== RENDER ==============

  if (phase === 'pick') {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tint} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.titlePlate}>
              <Text style={styles.titlePlateText}>🇵🇰 PAKISTAN QUEST</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.intro}>Pick a category, then a difficulty. Every word teaches you something about Pakistan — with English + Roman Urdu notes.</Text>
            {categories.map((c) => (
              <View key={c.key} style={styles.catCard}>
                <View style={styles.catHeader}>
                  <Text style={styles.catEmoji}>{c.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catName}>{c.name}</Text>
                    <Text style={styles.catDesc}>{c.description}</Text>
                    <Text style={styles.catCount}>{c.wordCount} curated words</Text>
                  </View>
                </View>
                {/* Single tap → server picks the right difficulty for THIS
                    section based on this player's last 10 games in it. */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.playBtn}
                  onPress={() => startCategory(c.key)}
                  disabled={loading}
                >
                  <Text style={styles.playBtnText}>▶  PLAY</Text>
                </TouchableOpacity>
              </View>
            ))}
            {loading ? <ActivityIndicator color="#fbbf24" size="large" style={{ marginTop: 30 }} /> : null}
          </ScrollView>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (phase === 'done') {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tint} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }}>
          <View style={styles.donePlate}>
            <Text style={styles.doneEmoji}>🏆</Text>
            <Text style={styles.doneTitle}>QUEST COMPLETE!</Text>
            <Text style={styles.doneSub}>{level?.category}</Text>
            <Text style={styles.doneCount}>{foundWords.length} / {words.length} words learnt</Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={backToPicker} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>← Pick Another Category</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryBtn, styles.ghostBtn]} onPress={() => navigation.popToTop()} activeOpacity={0.9}>
            <Text style={styles.ghostBtnText}>Home</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // PHASE: play
  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1, padding: 10 }}>
        <View style={styles.playTop}>
          <TouchableOpacity onPress={backToPicker} style={styles.backBtnSmall}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.titlePill}>
            <Text style={styles.titlePillText}>{level?.emoji} {level?.category}</Text>
          </View>
          <Timer
            ref={timerRef}
            timeLimit={(level && level?.timeLimit) || 90}
            paused={!!detailWord}
            onTimeUp={() => {
              const passed = foundWords.length >= words.length;
              // If the learning card is up when time hits 0, hold the
              // transition so the player can finish reading + tap Continue.
              if (detailWord) {
                pendingFinishRef.current = { passed };
                return;
              }
              submitResult(passed);
              setPhase('done');
            }}
          />
        </View>
        <View style={styles.scoreBar}>
          <Text style={styles.progressText}>{foundWords.length} / {words.length} learnt</Text>
        </View>
        <WordGrid
          grid={grid}
          selectedCells={selected}
          foundCells={foundCells}
          justFoundCells={justFoundCells}
          hintedCells={revealedHints}
          goldCells={[]}
          onCellEnter={handleCellEnter}
          onSelectionEnd={onSelectionEnd}
          onLineUpdate={onLineUpdate}
        />
        <WordList words={words} foundWords={foundWords} currentSelection="" />
        <View style={styles.hintRow}>
          {hintsLeft > 0 ? (
            <TouchableOpacity style={styles.hintBtn} onPress={useHint} activeOpacity={0.85}>
              <Text style={styles.hintBtnText}>💡 Hint ({hintsLeft})</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.hintBtn, styles.hintBtnDisabled]}>
              <Text style={styles.hintBtnTextMuted}>No hints left</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <WordDetailCard
        visible={!!detailWord}
        word={detailWord || ''}
        tier="bronze"
        category={picked.category}
        userId={user?.id}
        // Pakistan Quest: only English + real Urdu (Nastaliq) — no Roman
        // Urdu, no Hindi/Arabic/Spanish/French. The language toggle on the
        // card respects this `langs` filter.
        langs={['urdu']}
        onClose={() => {
          setDetailWord(null);
          // If the round was held pending this card close, finalize now.
          const pending = pendingFinishRef.current;
          if (pending) {
            pendingFinishRef.current = null;
            submitResult(!!pending.passed);
            setTimeout(() => setPhase('done'), 250);
          }
        }}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.78)' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#14532d',
  },
  backBtnSmall: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlate: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 6, borderBottomColor: '#14532d',
  },
  titlePlateText: { color: '#fff', fontWeight: '900', letterSpacing: 1.4, fontSize: 14 },
  titlePill: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18,
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  titlePillText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },

  intro: { color: '#cbd5e1', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  catCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: 2, borderColor: 'rgba(22,163,74,0.4)',
    borderBottomWidth: 6, borderBottomColor: '#14532d',
  },
  catHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  catEmoji: { fontSize: 30 },
  catName: { color: '#fff', fontWeight: '900', fontSize: 16 },
  catDesc: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  catCount: { color: '#16a34a', fontSize: 10, marginTop: 4, fontWeight: '700', letterSpacing: 0.8 },
  playBtn: {
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14,
    backgroundColor: '#16a34a',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 6, borderBottomColor: '#14532d',
  },
  playBtnText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1.4 },
  playBtnSub: { color: '#bbf7d0', fontSize: 10, marginTop: 2, fontWeight: '700' },
  diffChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4,
  },
  diffChipText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  adaptiveLine: {
    color: '#bbf7d0', fontSize: 11, fontStyle: 'italic',
    marginBottom: 6, paddingHorizontal: 8,
  },
  hintRow: {
    marginTop: 10, alignItems: 'center',
  },
  hintBtn: {
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999,
    backgroundColor: '#f59e0b',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: '#78350f',
  },
  hintBtnDisabled: {
    backgroundColor: '#475569',
    borderColor: '#94a3b8',
    borderBottomColor: '#0f172a',
  },
  hintBtnText: {
    color: '#fff', fontWeight: '900', letterSpacing: 0.8, fontSize: 13,
  },
  hintBtnTextMuted: {
    color: '#cbd5e1', fontWeight: '800', fontSize: 12,
  },

  playTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  scoreBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 10, marginBottom: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  progressText: { color: '#cbd5e1', fontWeight: '700', fontSize: 12 },

  donePlate: {
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 18,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 9, borderBottomColor: '#78350f',
  },
  doneEmoji: { fontSize: 60 },
  doneTitle: { color: '#fff', fontWeight: '900', fontSize: 24, letterSpacing: 2, marginTop: 8 },
  doneSub: { color: '#16a34a', fontSize: 14, fontWeight: '900', marginTop: 4, letterSpacing: 1 },
  doneCount: { color: '#bbf7d0', fontSize: 14, fontWeight: '800', marginTop: 12, letterSpacing: 0.6 },
  primaryBtn: {
    paddingVertical: 14, paddingHorizontal: 24, borderRadius: 999,
    backgroundColor: '#16a34a',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#14532d',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  ghostBtn: { backgroundColor: 'rgba(15,23,42,0.6)', borderColor: 'rgba(255,255,255,0.3)', borderBottomColor: 'rgba(0,0,0,0.6)' },
  ghostBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.8 },
});
