import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ActivityIndicator, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/auth';
import { battleGetMatch, battleSubmitResult, battleTimeoutMatch } from '../utils/api';
import { TIERS } from '../utils/tiers';
import WordGrid from '../components/WordGrid';
import WordList from '../components/WordList';
import { playBgm, stopBgm, playSfx } from '../utils/sound';

const BG = require('../../home_design/home_bg.jpeg');
const DURATION_MS = 60 * 1000;
const PALETTE = { text: '#f4f6fb', muted: '#cbd5e1', accent: '#22c55e', warn: '#f59e0b' };

export default function BattleScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const { user } = useAuth();
  const [match, setMatch] = useState(null);
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState([]);
  const [foundCells, setFoundCells] = useState([]);
  const [selected, setSelected] = useState([]);
  const selectedRef = useRef([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const submittedRef = useRef(false);
  const timerAnim = useRef(new Animated.Value(1)).current;
  const pollRef = useRef(null);

  // Pull match data once it's ready (the match row was created when the queue matched both players).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let m = null;
      for (let i = 0; i < 30 && !cancelled; i++) {
        const r = await battleGetMatch(matchId);
        if (r?.ok && r.match?.words?.length) { m = r.match; break; }
        await new Promise((res) => setTimeout(res, 1500));
      }
      if (!cancelled && m) {
        setMatch(m);
        playBgm('battle', { volume: 0.3 });
        Animated.timing(timerAnim, { toValue: 0, duration: DURATION_MS, useNativeDriver: false }).start();
        // Set up a 1s tick for UI countdown.
        const start = Date.now();
        const t = setInterval(() => {
          const sec = Math.max(0, Math.ceil((DURATION_MS - (Date.now() - start)) / 1000));
          setTimeLeft(sec);
          if (sec <= 0) { clearInterval(t); finish(); }
        }, 250);
        // Start polling opponent's score for live feed.
        pollRef.current = setInterval(refreshMatch, 2500);
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      stopBgm();
    };
  }, [matchId]);

  async function refreshMatch() {
    const r = await battleGetMatch(matchId);
    if (r?.ok && r.match) {
      setMatch((cur) => ({ ...cur, ...r.match }));
      if (r.match.status === 'done') {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!submittedRef.current) submittedRef.current = true;
        navigation.replace('BattleResult', { matchId });
      }
    }
  }

  async function finish() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    await battleSubmitResult({ matchId, userId: user.id, score, wordsFound: foundWords.length });
    // Give opponent up to 30s to also submit, else force-timeout.
    setTimeout(async () => {
      const r = await battleGetMatch(matchId);
      if (r?.ok && r.match?.status === 'active') await battleTimeoutMatch(matchId);
      navigation.replace('BattleResult', { matchId });
    }, 30000);
    // Poll faster after finishing.
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await battleGetMatch(matchId);
      if (r?.ok && r.match?.status === 'done') {
        clearInterval(pollRef.current);
        navigation.replace('BattleResult', { matchId });
      }
    }, 1500);
  }

  const wordList = match?.words || [];
  const grid = useMemo(() => Array.isArray(match?.grid) ? match.grid : [], [match]);
  const positions = useMemo(() => Array.isArray(match?.word_positions) ? match.word_positions : [], [match]);

  function findWordPositionCells(word) {
    const upper = word.toUpperCase();
    const p = positions.find((x) => String(x.word).toUpperCase() === upper);
    if (!p) return null;
    const cells = [];
    const dr = Math.sign(p.endRow - p.startRow);
    const dc = Math.sign(p.endCol - p.startCol);
    const len = Math.max(Math.abs(p.endRow - p.startRow), Math.abs(p.endCol - p.startCol)) + 1;
    for (let i = 0; i < len; i++) {
      cells.push({ r: p.startRow + dr * i, c: p.startCol + dc * i });
    }
    return cells;
  }

  function tryWord(cells) {
    if (!cells || cells.length < 2) return false;
    const attempt = cells.map((c) => c.letter).join('').toUpperCase();
    const reversed = [...cells].reverse().map((c) => c.letter).join('').toUpperCase();
    let matchWord = null;
    let matchCells = null;
    if (wordList.includes(attempt) && !foundWords.includes(attempt)) {
      matchWord = attempt; matchCells = cells;
    } else if (wordList.includes(reversed) && !foundWords.includes(reversed)) {
      matchWord = reversed; matchCells = [...cells].reverse();
    }
    if (!matchWord) return false;
    const cellsForWord = findWordPositionCells(matchWord) || matchCells;
    setFoundWords((prev) => [...prev, matchWord]);
    setFoundCells((prev) => {
      const seen = new Set(prev.map((c) => `${c.r}-${c.c}`));
      const merged = [...prev];
      for (const c of cellsForWord) {
        if (!seen.has(`${c.r}-${c.c}`)) merged.push(c);
      }
      return merged;
    });
    setScore((s) => s + matchWord.length * 10);
    playSfx('correct', { volume: 0.85 });
    setSelected([]);
    selectedRef.current = [];
    return true;
  }

  const onLineUpdate = useCallback((cells) => {
    if (!cells || !cells.length) return;
    setSelected(cells);
    selectedRef.current = cells;
    const attempt = cells.map((c) => c.letter).join('').toUpperCase();
    const reversed = [...cells].reverse().map((c) => c.letter).join('').toUpperCase();
    if (wordList.includes(attempt) || wordList.includes(reversed)) {
      tryWord(cells);
    }
  }, [wordList, foundWords, positions]);

  const onSelectionEnd = useCallback((wasDrag) => {
    const cells = selectedRef.current || [];
    if (!cells.length) return;
    if (wasDrag) {
      if (!tryWord(cells)) { setSelected([]); selectedRef.current = []; }
      return;
    }
    // Tap mode — keep selection visible; validate if it spells a word.
    tryWord(cells);
  }, [wordList, foundWords, positions]);

  function handleCellEnter(r, c, letter) {
    const cur = selectedRef.current || [];
    const idx = cur.findIndex((p) => p.r === r && p.c === c);
    if (idx >= 0) return;
    const next = [...cur, { r, c, letter }];
    selectedRef.current = next;
    setSelected(next);
    const attempt = next.map((p) => p.letter).join('').toUpperCase();
    const reversed = [...next].reverse().map((p) => p.letter).join('').toUpperCase();
    if (wordList.includes(attempt) || wordList.includes(reversed)) {
      tryWord(next);
    }
  }

  if (!match || !match.words?.length) {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tealTint} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <ActivityIndicator color={PALETTE.accent} size="large" />
            <Text style={styles.loadingText}>Loading match…</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const isA = match.player_a === user.id;
  const myName = isA ? match.display_a : match.display_b;
  const myColor = isA ? match.avatar_a : match.avatar_b;
  const oppName = isA ? match.display_b : match.display_a;
  const oppColor = isA ? match.avatar_b : match.avatar_a;
  const oppScore = isA ? match.score_b : match.score_a;
  const oppWords = isA ? match.words_b : match.words_a;
  const oppDone = isA ? match.finished_b : match.finished_a;

  const widthPct = timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topRow}>
          <PlayerCard name={myName} color={myColor} score={score} words={foundWords.length} totalWords={wordList.length} mine />
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <PlayerCard name={oppName} color={oppColor} score={oppScore || 0} words={oppWords || 0} totalWords={wordList.length} done={oppDone} />
        </View>

        <View style={styles.timerWrap}>
          <View style={styles.timerBar}>
            <Animated.View style={[styles.timerFill, { width: widthPct, backgroundColor: timeLeft <= 10 ? PALETTE.warn : PALETTE.accent }]} />
          </View>
          <View style={[styles.timerPill, timeLeft <= 10 && styles.timerPillWarn]}>
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>
        </View>

        <WordGrid
          grid={grid}
          selectedCells={selected}
          foundCells={foundCells}
          justFoundCells={[]}
          hintedCells={[]}
          goldCells={[]}
          onCellEnter={handleCellEnter}
          onSelectionEnd={onSelectionEnd}
          onLineUpdate={onLineUpdate}
        />

        <WordList words={wordList} foundWords={foundWords} currentSelection="" />
      </SafeAreaView>
    </ImageBackground>
  );
}

function PlayerCard({ name, color, score, words, totalWords, mine, done }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.pCard, mine && styles.pCardMine]}>
      <View style={[styles.avatar, { backgroundColor: color || '#3b82f6' }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pName} numberOfLines={1}>{name}{mine ? ' (you)' : ''}</Text>
        <Text style={styles.pStat}>{score} pts · {words}/{totalWords}</Text>
        {done ? <Text style={styles.pDone}>✓ DONE</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  safe: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: {
    color: '#fde68a', marginTop: 12, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  pCardMine: {
    borderColor: '#facc15',
    borderBottomColor: '#78350f',
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  pName: {
    color: '#fff', fontWeight: '900', fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  pStat: { color: '#cbd5e1', fontSize: 10, marginTop: 2, fontWeight: '700' },
  pDone: { color: '#22c55e', fontSize: 10, fontWeight: '900', marginTop: 2, letterSpacing: 1 },

  vsBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: '#7f1d1d',
  },
  vsText: {
    color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  timerWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  timerBar: {
    flex: 1, height: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 7, overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#0f172a',
  },
  timerFill: { height: '100%' },
  timerPill: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#22c55e',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#14532d',
    minWidth: 56, alignItems: 'center',
  },
  timerPillWarn: { backgroundColor: '#f59e0b', borderBottomColor: '#78350f' },
  timerText: { color: '#fff', fontWeight: '900', fontSize: 13 },
});
