import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ActivityIndicator, ImageBackground, BackHandler, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/auth';
import {
  battleGetMatch,
  battleSubmitResult,
  battleTimeoutMatch,
  battleClaimWord,
  battleForfeitMatch,
} from '../utils/api';
import { supabase } from '../utils/supabase';
import { TIERS } from '../utils/tiers';
import WordGrid from '../components/WordGrid';
import WordList from '../components/WordList';
import { playBgm, stopBgm, playSfx } from '../utils/sound';

const BG = require('../../home_design/home_bg.jpeg');
const DEFAULT_DURATION_MS = 60 * 1000;
const PALETTE = { text: '#f4f6fb', muted: '#cbd5e1', accent: '#22c55e', warn: '#f59e0b' };
const MY_COLOR = '#22c55e';
const OPP_COLOR = '#ef4444';

export default function BattleScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const { user } = useAuth();
  const [match, setMatch] = useState(null);
  const [profiles, setProfiles] = useState({ me: null, opp: null });
  const [selected, setSelected] = useState([]);
  const selectedRef = useRef([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const finishedRef = useRef(false);
  const timerAnim = useRef(new Animated.Value(1)).current;
  const pollRef = useRef(null);
  const channelRef = useRef(null);
  const matchRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => { matchRef.current = match; }, [match]);

  // -------- initial load + timer + realtime subscription --------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let m = null;
      for (let i = 0; i < 30 && !cancelled; i++) {
        const r = await battleGetMatch(matchId);
        if (r?.ok && r.match?.words?.length) { m = r.match; break; }
        await new Promise((res) => setTimeout(res, 1500));
      }
      if (cancelled || !m) return;
      setMatch(m);
      // Pull both players' leaderboard avatar rows so we can render their
      // actual profile pictures (not just initials). Best-effort.
      try {
        if (supabase) {
          const myId = m.player_a === user?.id ? m.player_a : m.player_b;
          const oppId = myId === m.player_a ? m.player_b : m.player_a;
          const { data: rows } = await supabase
            .from('wq_user_leaderboard')
            .select('user_id, display_name, avatar_color, avatar_emoji, avatar_url')
            .in('user_id', [myId, oppId]);
          const byId = {};
          (rows || []).forEach((r) => { byId[r.user_id] = r; });
          if (!cancelled) {
            setProfiles({ me: byId[myId] || null, opp: byId[oppId] || null });
            console.log('[Battle] avatars resolved:',
              { me: byId[myId]?.avatar_url || byId[myId]?.avatar_emoji || 'initials',
                opp: byId[oppId]?.avatar_url || byId[oppId]?.avatar_emoji || 'initials' });
          }
        }
      } catch (_) {}
      const durationMs = (m.time_limit || 60) * 1000;
      setTimeLeft(m.time_limit || 60);
      playBgm('battle', { volume: 0.3 });
      Animated.timing(timerAnim, { toValue: 0, duration: durationMs, useNativeDriver: false }).start();
      const start = Date.now();
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        const sec = Math.max(0, Math.ceil((durationMs - (Date.now() - start)) / 1000));
        setTimeLeft(sec);
        if (sec <= 0) { clearInterval(tickRef.current); tickRef.current = null; finish(); }
      }, 250);

      // Subscribe to Supabase Realtime so opponent claims flow in instantly.
      try {
        if (supabase && !channelRef.current) {
          const ch = supabase
            .channel(`match-${m.id}`)
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'wq_matches', filter: `id=eq.${m.id}` },
              (payload) => {
                const next = payload?.new;
                if (!next) return;
                setMatch((cur) => ({ ...(cur || {}), ...next }));
                if (next.status === 'done' && !finishedRef.current) {
                  finishedRef.current = true;
                  if (pollRef.current) clearInterval(pollRef.current);
                  navigation.replace('BattleResult', { matchId });
                }
              }
            )
            .subscribe();
          channelRef.current = ch;
        }
      } catch (_) {}

      // Fallback poll — every 1.5s in case Realtime drops.
      pollRef.current = setInterval(refreshMatch, 1500);
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      if (channelRef.current && supabase) {
        try { supabase.removeChannel(channelRef.current); } catch (_) {}
        channelRef.current = null;
      }
      stopBgm();
      // If the user navigates away mid-match, forfeit so the other player
      // is auto-declared the winner.
      if (!finishedRef.current && matchRef.current && matchRef.current.status === 'active') {
        try { battleForfeitMatch({ matchId, userId: user.id }); } catch (_) {}
      }
    };
  }, [matchId]); // eslint-disable-line

  // Lock back gesture + Android hardware back. The ONLY way out is the
  // explicit Quit button (which routes through `confirmQuit`).
  useEffect(() => {
    try { navigation.setOptions({ gestureEnabled: false }); } catch (_) {}
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmQuit();
      return true;
    });
    return () => sub.remove();
  }, []); // eslint-disable-line

  function confirmQuit() {
    Alert.alert(
      'Quit battle?',
      'You will forfeit this match.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Forfeit',
          style: 'destructive',
          onPress: async () => {
            if (finishedRef.current) { navigation.replace('Home'); return; }
            finishedRef.current = true;
            try { await battleForfeitMatch({ matchId, userId: user.id }); } catch (_) {}
            navigation.replace('Home');
          },
        },
      ],
      { cancelable: true },
    );
  }

  function clearSelection() {
    setSelected([]);
    selectedRef.current = [];
  }

  async function refreshMatch() {
    const r = await battleGetMatch(matchId);
    if (!r?.ok || !r.match) return;
    setMatch((cur) => ({ ...(cur || {}), ...r.match }));
    if (r.match.status === 'done' && !finishedRef.current) {
      finishedRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      navigation.replace('BattleResult', { matchId });
    }
  }

  async function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Submit current score so finalize accounts for it; finalize itself
    // prefers the claims ledger but this also marks the player finished.
    const claimsCount = countClaimsForMe();
    await battleSubmitResult({ matchId, userId: user.id, score: myScore(), wordsFound: claimsCount });
    setTimeout(async () => {
      const r = await battleGetMatch(matchId);
      if (r?.ok && r.match?.status === 'active') await battleTimeoutMatch(matchId);
      if (!finishedRef.current) finishedRef.current = true;
      navigation.replace('BattleResult', { matchId });
    }, 8000);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await battleGetMatch(matchId);
      if (r?.ok && r.match?.status === 'done') {
        clearInterval(pollRef.current);
        navigation.replace('BattleResult', { matchId });
      }
    }, 1500);
  }

  // -------- derived state --------
  const wordList = match?.words || [];
  const grid = useMemo(() => Array.isArray(match?.grid) ? match.grid : [], [match]);
  const positions = useMemo(() => Array.isArray(match?.word_positions) ? match.word_positions : [], [match]);
  const claims = match?.claims && typeof match.claims === 'object' ? match.claims : {};
  const isA = match?.player_a === user?.id;
  const mySide = isA ? 'a' : 'b';
  const oppSide = isA ? 'b' : 'a';

  function countClaimsForMe() {
    const c = matchRef.current?.claims || {};
    let n = 0; for (const v of Object.values(c)) if (v === mySide) n++;
    return n;
  }
  function myScore() {
    return isA ? (matchRef.current?.score_a || 0) : (matchRef.current?.score_b || 0);
  }

  // Direction → cell-step lookup. Mirrors GameScreen's working logic so
  // battle grid highlights actually appear (the previous endRow/endCol
  // version never matched because the level generator emits a `direction`
  // field, not absolute end coordinates).
  const DIR_STEPS = {
    horizontal: { dr: 0, dc: 1 },
    vertical:   { dr: 1, dc: 0 },
    diagonalDR: { dr: 1, dc: 1 },
    diagonalDL: { dr: 1, dc: -1 },
  };
  function findWordPositionCells(word) {
    const W = String(word || '').toUpperCase();
    if (!W) return [];
    const pos = positions.find((x) => x && String(x.word || '').toUpperCase() === W);
    if (!pos) return [];
    const { dr = 0, dc = 1 } = DIR_STEPS[pos.direction] || DIR_STEPS.horizontal;
    const cells = [];
    for (let i = 0; i < W.length; i++) {
      cells.push({ r: (pos.startRow || 0) + dr * i, c: (pos.startCol || 0) + dc * i });
    }
    console.log('[Battle] findWordPositionCells', W, 'direction:', pos.direction, 'cells:', cells.length);
    return cells;
  }

  // Cells already locked by ME and by OPPONENT — color-coded.
  const myFoundCells = useMemo(() => {
    const out = [];
    for (const [w, who] of Object.entries(claims)) {
      if (who !== mySide) continue;
      const cells = findWordPositionCells(w);
      if (cells) for (const cell of cells) out.push(cell);
    }
    return out;
  }, [claims, mySide, positions]);
  const oppFoundCells = useMemo(() => {
    const out = [];
    for (const [w, who] of Object.entries(claims)) {
      if (who !== oppSide) continue;
      const cells = findWordPositionCells(w);
      if (cells) for (const cell of cells) out.push(cell);
    }
    return out;
  }, [claims, oppSide, positions]);
  const foundCells = useMemo(() => {
    const merged = [];
    const seen = new Set();
    for (const c of myFoundCells) {
      const k = `${c.r}-${c.c}`;
      if (!seen.has(k)) { seen.add(k); merged.push({ ...c, color: MY_COLOR }); }
    }
    for (const c of oppFoundCells) {
      const k = `${c.r}-${c.c}`;
      if (!seen.has(k)) { seen.add(k); merged.push({ ...c, color: OPP_COLOR }); }
    }
    return merged;
  }, [myFoundCells, oppFoundCells]);

  // -------- selection / claim flow --------
  async function tryClaim(cells) {
    if (!cells || cells.length < 2) return false;
    const attempt = cells.map((c) => c.letter).join('').toUpperCase();
    const reversed = [...cells].reverse().map((c) => c.letter).join('').toUpperCase();
    let target = null;
    if (wordList.map((w) => String(w).toUpperCase()).includes(attempt)) target = attempt;
    else if (wordList.map((w) => String(w).toUpperCase()).includes(reversed)) target = reversed;
    if (!target) return false;
    // Already locked? Don't even POST.
    if (claims[target]) {
      setSelected([]); selectedRef.current = [];
      return false;
    }
    setSelected([]); selectedRef.current = [];

    // OPTIMISTIC update — paint the cells in MY colour immediately so the
    // finder sees the highlight the same frame they release. Backend will
    // confirm (or roll back) within ~200ms. The CAS in /claim prevents
    // race-conditions, so worst case is a brief flash then a revert.
    const optimisticInc = target.length + 2;
    setMatch((cur) => {
      if (!cur) return cur;
      const nextClaims = { ...(cur.claims || {}), [target]: mySide };
      const sf = isA ? 'score_a' : 'score_b';
      const wf = isA ? 'words_a' : 'words_b';
      return {
        ...cur,
        claims: nextClaims,
        [sf]: (cur[sf] || 0) + optimisticInc,
        [wf]: (cur[wf] || 0) + 1,
      };
    });
    playSfx('correct', { volume: 0.85 });
    console.log('[Battle] optimistic claim:', target, '+', optimisticInc, 'pts');

    const r = await battleClaimWord({ matchId, userId: user.id, word: target });
    if (r?.ok && r.claimed) {
      // Server confirmed — sync to authoritative state.
      if (r.match) setMatch((cur) => ({ ...(cur || {}), ...r.match }));
      if (r.allDone) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          navigation.replace('BattleResult', { matchId });
        }
      }
      return true;
    }
    // Lost the race — server rejected. Revert optimistic update.
    console.log('[Battle] claim rejected by server, reverting:', target);
    if (r?.claims || r?.match) {
      setMatch((cur) => ({ ...(cur || {}), claims: r.claims || cur?.claims, ...(r.match || {}) }));
    } else {
      // Hard rollback if server gave us nothing — just remove our optimistic entry.
      setMatch((cur) => {
        if (!cur) return cur;
        const nextClaims = { ...(cur.claims || {}) };
        if (nextClaims[target] === mySide) delete nextClaims[target];
        return { ...cur, claims: nextClaims };
      });
    }
    return false;
  }

  const onLineUpdate = useCallback((cells) => {
    if (!cells || !cells.length) return;
    setSelected(cells);
    selectedRef.current = cells;
    const attempt = cells.map((c) => c.letter).join('').toUpperCase();
    const reversed = [...cells].reverse().map((c) => c.letter).join('').toUpperCase();
    const upList = wordList.map((w) => String(w).toUpperCase());
    if (upList.includes(attempt) || upList.includes(reversed)) tryClaim(cells);
  }, [wordList, claims, positions]);

  const onSelectionEnd = useCallback((wasDrag) => {
    const cells = selectedRef.current || [];
    if (!cells.length) return;
    if (wasDrag) {
      if (!tryClaim(cells)) { setSelected([]); selectedRef.current = []; }
      return;
    }
    tryClaim(cells);
  }, [wordList, claims, positions]);

  function handleCellEnter(r, c, letter) {
    const cur = selectedRef.current || [];
    const idx = cur.findIndex((p) => p.r === r && p.c === c);
    if (idx >= 0) return;
    const next = [...cur, { r, c, letter }];
    selectedRef.current = next;
    setSelected(next);
    const attempt = next.map((p) => p.letter).join('').toUpperCase();
    const reversed = [...next].reverse().map((p) => p.letter).join('').toUpperCase();
    const upList = wordList.map((w) => String(w).toUpperCase());
    if (upList.includes(attempt) || upList.includes(reversed)) tryClaim(next);
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

  const myName = isA ? match.display_a : match.display_b;
  const myAvatarColor = isA ? match.avatar_a : match.avatar_b;
  const oppName = isA ? match.display_b : match.display_a;
  const oppAvatarColor = isA ? match.avatar_b : match.avatar_a;

  let myWords = 0, oppWords = 0;
  for (const v of Object.values(claims)) {
    if (v === mySide) myWords++;
    else if (v === oppSide) oppWords++;
  }
  const myCurrentScore = isA ? (match.score_a || 0) : (match.score_b || 0);
  const oppCurrentScore = isA ? (match.score_b || 0) : (match.score_a || 0);

  const widthPct = timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topRow}>
          <PlayerCard
            name={myName}
            color={myAvatarColor}
            avatarUrl={profiles.me?.avatar_url}
            avatarEmoji={profiles.me?.avatar_emoji}
            score={myCurrentScore} words={myWords} totalWords={wordList.length} mine
          />
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <PlayerCard
            name={oppName}
            color={oppAvatarColor}
            avatarUrl={profiles.opp?.avatar_url}
            avatarEmoji={profiles.opp?.avatar_emoji}
            score={oppCurrentScore} words={oppWords} totalWords={wordList.length}
          />
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

        <WordList
          words={wordList}
          claims={claims}
          mySide={mySide}
          myColor={MY_COLOR}
          oppColor={OPP_COLOR}
          currentSelection=""
        />

        <View style={styles.actions}>
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={clearSelection}
            style={[styles.btn, styles.btnClear]}
          >
            <Text style={styles.btnText}>✕ Clear</Text>
          </View>
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={confirmQuit}
            style={[styles.btn, styles.btnQuit]}
          >
            <Text style={styles.btnText}>Quit</Text>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

function PlayerCard({ name, color, avatarUrl, avatarEmoji, score, words, totalWords, mine }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.pCard, mine && styles.pCardMine]}>
      <View style={[styles.avatar, { backgroundColor: color || '#3b82f6' }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
        ) : avatarEmoji ? (
          <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pName} numberOfLines={1}>{name}{mine ? ' (you)' : ''}</Text>
        <Text style={styles.pStat}>{score} pts · {words}/{totalWords}</Text>
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
  pCardMine: { borderColor: '#facc15', borderBottomColor: '#78350f' },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarEmoji: { fontSize: 18 },
  actions: {
    flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 4,
  },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 6,
  },
  btnClear: { backgroundColor: '#475569', borderBottomColor: '#0f172a' },
  btnQuit:  { backgroundColor: '#dc2626', borderBottomColor: '#7f1d1d' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  pName: {
    color: '#fff', fontWeight: '900', fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  pStat: { color: '#cbd5e1', fontSize: 10, marginTop: 2, fontWeight: '700' },

  vsBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 5, borderBottomColor: '#7f1d1d',
  },
  vsText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  timerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
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
