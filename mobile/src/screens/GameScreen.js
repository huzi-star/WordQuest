import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WordGrid from '../components/WordGrid';
import WordList from '../components/WordList';
import Timer from '../components/Timer';
import AgentThinking from '../components/AgentThinking';
import ScorePopup from '../components/ScorePopup';
import Confetti from '../components/Confetti';
import { validateWord, explainWord } from '../utils/api';
import { playDing, initSound } from '../utils/sound';
import { useSettings } from '../utils/settings';
import { useTheme } from '../utils/theme';

// Local commentary templates — INSTANT, no network round-trip. Backend
// commentary is still available but caused lag + stacking so we drive the
// in-game agent bubble from these templates directly.
const COMMENTARY = {
  english: {
    word_found: ['Nice find!', 'Sharp eyes!', 'Another one!', 'Locked in!', 'Spotted it!'],
    streak:     ['{streak} in a row — on fire!', 'Streak {streak}! Multiplier on.', 'Combo {streak}!'],
    half_time:  ['Half time — {wordsFound}/{totalWords}. Push it!', 'Halfway done — focus.'],
    low_time:   ['Only {timeLeft}s — grab anything!', 'Final stretch — hurry!'],
    idle:       ['Check the diagonals too.', 'Try a rare letter as the start.', 'Stuck? A hint costs 30.'],
    gold:       ['Gold cell! Double points.', 'Bonus square hit!'],
    perfect_round: ['Perfect round! All words found.'],
  },
  urdu: {
    word_found: ['Sahi!', 'Wah!', 'Acha kaam!', 'Ek aur!', 'Keep going!'],
    streak:     ['{streak} in a row — fire pe ho!', 'Streak {streak}! Combo active.', 'Combo {streak} — kamaal!'],
    half_time:  ['Half time — {wordsFound}/{totalWords}. Speed up!', 'Aadha time gaya — focus.'],
    low_time:   ['Sirf {timeLeft}s baqi — jaldi!', 'Final stretch — hurry!'],
    idle:       ['Diagonals bhi try karo.', 'Rare letter se shuru karo.', 'Stuck? Hint sirf 30 ka hai.'],
    gold:       ['Gold cell! Double points.', 'Bonus square mil gaya!'],
    perfect_round: ['Perfect round! Sab mil gaye.'],
  },
};
function pickLine(trigger, language, vars) {
  const lang = language === 'english' ? 'english' : 'urdu';
  const pool = COMMENTARY[lang][trigger] || COMMENTARY[lang].word_found;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

export default function GameScreen({ navigation, route }) {
  const { settings } = useSettings();
  const theme = useTheme();
  const { playerStats, sessionStats, difficulty, level, levelNumber = 0 } = route.params;
  const [selected, setSelected] = useState([]); // [{r,c,letter}]
  const [foundCells, setFoundCells] = useState([]);
  const [foundWords, setFoundWords] = useState([]);
  const [score, setScore] = useState(sessionStats.score || 0);
  const [streak, setStreak] = useState(sessionStats.streak || 0);
  const [agentMsg, setAgentMsg] = useState('');
  const [agentVisible, setAgentVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [popups, setPopups] = useState([]); // { id, text, x, y, color }
  const [showConfetti, setShowConfetti] = useState(false);
  const [justFoundCells, setJustFoundCells] = useState([]);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [revealedHints, setRevealedHints] = useState([]); // cells revealed by hint
  const [hintsUsedThisRound, setHintsUsedThisRound] = useState(0);
  // Random 2 gold cells inside the grid. Words covering them get 2x.
  const [goldCells] = useState(() => {
    const size = (level.grid || []).length || 8;
    const a = { r: Math.floor(Math.random() * size), c: Math.floor(Math.random() * size) };
    let b = { r: Math.floor(Math.random() * size), c: Math.floor(Math.random() * size) };
    if (b.r === a.r && b.c === a.c) b = { r: (a.r + 1) % size, c: (a.c + 1) % size };
    return [a, b];
  });
  const lastWordAtRef = useRef(0);
  const timeLeftRef = useRef(difficulty.timeLimit);
  const shake = useRef(new Animated.Value(0)).current;
  const popupIdRef = useRef(0);

  const wordList = useMemo(() => (level.words || []).map(w => w.toUpperCase()), [level.words]);

  useEffect(() => {
    initSound();
  }, []);

  // Track which milestones we've already commented on this round.
  const firedRef = useRef({ halfTime: false, lowTime: false, lastIdleAt: Date.now(), lastStreak: 0 });

  function maybeFireCommentary(trigger) {
    // Local + instant — no network. AgentThinking handles dedupe / replace.
    const vars = {
      wordsFound: foundWords.length,
      totalWords: wordList.length,
      timeLeft: timeLeftRef.current,
      timeLimit: difficulty.timeLimit,
      streak,
    };
    const line = pickLine(trigger, settings.language, vars);
    if (line) showAgent(`🎙 ${line}`, 2400);
  }

  function onTick(t) {
    timeLeftRef.current = t;
    const f = firedRef.current;
    if (!f.halfTime && t <= Math.floor(difficulty.timeLimit / 2) && t > 15) {
      f.halfTime = true;
      maybeFireCommentary('half_time');
    }
    if (!f.lowTime && t === 15) {
      f.lowTime = true;
      maybeFireCommentary('low_time');
    }
    // Idle: no found word for 20s and selection empty.
    if (
      t > 0 &&
      selected.length === 0 &&
      Date.now() - f.lastIdleAt > 20000 &&
      t > 20
    ) {
      f.lastIdleAt = Date.now();
      maybeFireCommentary('idle');
    }
    if (streak > 0 && streak !== f.lastStreak && (streak === 3 || streak === 5 || streak === 7)) {
      f.lastStreak = streak;
      maybeFireCommentary('streak');
    }
  }

  function showAgent(msg, durationMs = 2400) {
    setAgentMsg(msg);
    setAgentVisible(true);
    setTimeout(() => setAgentVisible(false), durationMs);
  }

  function spawnPopup(text, x, y, color = '#22c55e') {
    const id = ++popupIdRef.current;
    setPopups((arr) => [...arr, { id, text, x, y, color }]);
    setTimeout(() => {
      setPopups((arr) => arr.filter((p) => p.id !== id));
    }, 1500);
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
    if (hintsLeft <= 0) {
      showAgent('Hints khatam — agle round mein milenge', 2200);
      return;
    }
    // Find an unfound word and reveal one of its cells.
    const unfound = (level.wordPositions || []).filter(
      (p) => !foundWords.includes(String(p.word).toUpperCase())
    );
    if (!unfound.length) {
      showAgent('Sab words mil gaye — koi hint nahi chahiye 😄', 2200);
      return;
    }
    const pick = unfound[Math.floor(Math.random() * unfound.length)];
    // Pick the first cell of that word that isn't already revealed.
    const wordCells = [];
    for (let i = 0; i < pick.word.length; i++) {
      if (pick.direction === 'horizontal') {
        wordCells.push({ r: pick.startRow, c: pick.startCol + i });
      } else {
        wordCells.push({ r: pick.startRow + i, c: pick.startCol });
      }
    }
    const stillHidden = wordCells.filter(
      (cell) => !revealedHints.some((h) => h.r === cell.r && h.c === cell.c)
    );
    const reveal = stillHidden[0] || wordCells[0];

    setRevealedHints((arr) => [...arr, reveal]);
    setHintsLeft((n) => n - 1);
    setHintsUsedThisRound((n) => n + 1);
    setScore((s) => Math.max(0, s - 30));
    spawnPopup('-30 💡', 180, 360, '#f97316');
    Vibration.vibrate(60);
    showAgent(`💡 Hint: "${pick.word}" — ${pick.direction === 'horizontal' ? 'horizontal' : 'vertical'} mein, row ${reveal.r + 1} col ${reveal.c + 1}`, 3200);
  }

  const DIR_STEPS = {
    horizontal: { dr: 0, dc: 1 },
    vertical:   { dr: 1, dc: 0 },
    diagonalDR: { dr: 1, dc: 1 },
    diagonalDL: { dr: 1, dc: -1 },
  };

  function findWordPositionCells(word) {
    const pos = (level.wordPositions || []).find(p => p.word.toUpperCase() === word);
    if (!pos) return [];
    const { dr = 0, dc = 1 } = DIR_STEPS[pos.direction] || DIR_STEPS.horizontal;
    const cells = [];
    for (let i = 0; i < word.length; i++) {
      cells.push({ r: pos.startRow + dr * i, c: pos.startCol + dc * i });
    }
    return cells;
  }

  // Pure-local validator — mirrors backend refereeAgent. Instant feedback
  // (no network round-trip), so words validate in the same frame.
  function localValidate(wordAttempt, timeLeftSec, streakValue, currentScore) {
    const upper = String(wordAttempt || '').toUpperCase();
    if (foundWords.includes(upper)) {
      return {
        isValid: false, alreadyFound: true, pointsEarned: 0, newScore: currentScore,
        message: 'Yeh pehle mil gaya tha!',
        breakdown: { basePoints: 0, timeBonus: 0, multiplier: 1 },
      };
    }
    if (!wordList.includes(upper)) {
      return {
        isValid: false, alreadyFound: false, pointsEarned: 0, newScore: currentScore,
        message: 'Yeh list mein nahi',
        breakdown: { basePoints: 0, timeBonus: 0, multiplier: 1 },
      };
    }
    const effectiveStreak = streakValue + 1;
    const multiplier =
      effectiveStreak >= 6 ? 3 : effectiveStreak >= 4 ? 2 : effectiveStreak >= 2 ? 1.5 : 1;
    const basePoints = upper.length * 10;
    const timeBonus = Math.floor(timeLeftSec / 10) * 5;
    const totalPoints = Math.floor((basePoints + timeBonus) * multiplier);
    return {
      isValid: true, alreadyFound: false, pointsEarned: totalPoints,
      newScore: currentScore + totalPoints,
      message: `Zabardast! +${totalPoints} points`,
      breakdown: { basePoints, timeBonus, multiplier, effectiveStreak },
    };
  }

  function attemptValidation(currentLetters) {
    const wordAttempt = currentLetters.map(s => s.letter).join('');
    const r = localValidate(wordAttempt, timeLeftRef.current, streak, score);

    if (r.isValid) {
      const cellsForWord = findWordPositionCells(wordAttempt);
      const mergedCells = [...foundCells, ...cellsForWord];
      const newFoundWords = [...foundWords, wordAttempt];

      // Gold letter bonus: if the found word covers any gold cell, double the
      // points earned for THIS word.
      const hitsGold = cellsForWord.some(
        (c) => goldCells.some((g) => g.r === c.r && g.c === c.c),
      );
      let bonusEarned = 0;
      let goldDouble = 0;
      if (hitsGold) {
        goldDouble = r.pointsEarned; // adds another copy of base earnings
        bonusEarned += goldDouble;
      }
      // Combo speed bonus: word within 5 s of previous word lands a +100.
      const now = Date.now();
      const sinceLast = now - lastWordAtRef.current;
      const isCombo = lastWordAtRef.current > 0 && sinceLast < 5000;
      if (isCombo) bonusEarned += 100;
      lastWordAtRef.current = now;
      const totalEarned = r.pointsEarned + bonusEarned;
      const finalNewScore = score + totalEarned;

      setFoundCells(mergedCells);
      setFoundWords(newFoundWords);
      setScore(finalNewScore);
      setStreak(s => s + 1);
      if (settings.vibration) Vibration.vibrate(40);
      if (settings.sound) playDing();
      r.pointsEarned = totalEarned;
      r.newScore = finalNewScore;

      // Trigger the reveal-wave animation on the just-found word's cells.
      setJustFoundCells(cellsForWord);
      setTimeout(() => setJustFoundCells([]), 900);

      // Score popup with combo / gold tags.
      const tags = [];
      const mult = r.breakdown?.multiplier || 1;
      if (mult > 1) tags.push(`⚡ x${mult}`);
      if (hitsGold) tags.push('✨ GOLD');
      if (isCombo) tags.push('🔥 COMBO +100');
      const popupColor = hitsGold ? '#fcd34d' : isCombo ? '#fb923c' : mult >= 2 ? '#eab308' : '#22c55e';
      spawnPopup(`+${totalEarned}${tags.length ? ' · ' + tags.join(' · ') : ''}`, 180, 360, popupColor);

      // INSTANT feedback: show local commentary line right away, then the
      // tutor explanation comes back later (no UI block).
      const commentVars = {
        wordsFound: newFoundWords.length,
        totalWords: wordList.length,
        timeLeft: timeLeftRef.current,
        streak: streak + 1,
      };
      let triggerType = 'word_found';
      if (hitsGold) triggerType = 'gold';
      else if (newFoundWords.length === wordList.length) triggerType = 'perfect_round';
      else if ((streak + 1) >= 3 && (streak + 1) % 2 === 1) triggerType = 'streak';
      showAgent(`🎙 ${pickLine(triggerType, settings.language, commentVars)}`, 2200);

      explainWord({
        word: wordAttempt,
        category: level.category,
        funFact: level.funFact,
      }).then((tutorRes) => {
        if (tutorRes?.ok && tutorRes.result?.explanation) {
          // Tutor arrives later — replace the bubble with the cultural fact.
          showAgent(`📚 ${tutorRes.result.explanation}`, 3800);
        }
      });

      clearSelection();

      if (newFoundWords.length === wordList.length) {
        setPaused(true);
        setShowConfetti(true);
        Vibration.vibrate([0, 50, 80, 50, 80, 50]);
        setTimeout(() => goToRoundComplete(newFoundWords.length, timeLeftRef.current, r.newScore, streak + 1), 1800);
      }
    } else {
      shakeGrid();
      setStreak(0);
      Vibration.vibrate(120);
      showAgent(r.message);
      clearSelection();
    }
  }

  function isValidLine(cells) {
    if (cells.length <= 1) return true;
    // Determine the direction from the first two cells, then check all cells
    // follow the same step. Supports horizontal, vertical, and both diagonals.
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
    const alreadyIdx = current.findIndex(s => s.r === r && s.c === c);
    let next;
    if (alreadyIdx >= 0) {
      // cell already in selection — keep current, don't toggle (drag through revisit is no-op)
      return;
    }
    const candidate = [...current, { r, c, letter }];
    if (isValidLine(candidate)) {
      next = candidate;
    } else {
      // breaks the line — restart selection from this cell
      next = [{ r, c, letter }];
    }
    setSelected(next);
    selectedRef.current = next;

    const attempt = next.map(s => s.letter).join('');
    const target = wordList.find(w => w === attempt);
    if (target) attemptValidation(next);
  }

  // Replace the entire selection with a straight line (called by WordGrid
   // while the player drags). Diagonal-friendly. Auto-validates once the
   // letters spell out a target word.
  function onLineUpdate(cells) {
    if (!cells || !cells.length) return;
    setSelected(cells);
    selectedRef.current = cells;
    const attempt = cells.map((s) => s.letter).join('');
    if (wordList.includes(attempt)) {
      attemptValidation(cells);
      return;
    }
    // Also try reverse direction (some words placed right-to-left in diagonals).
    const reversed = [...cells].reverse().map((s) => s.letter).join('');
    if (wordList.includes(reversed)) {
      attemptValidation([...cells].reverse());
    }
  }

  function onSelectionEnd(wasDrag) {
    const current = selectedRef.current;
    if (!wasDrag || current.length < 2) return;
    // Drag finished without an auto-validated match — try referee one more
    // time (covers cases where attempt is a valid word length but referee
    // hasn't been called yet), otherwise clear the failed drag.
    const attempt = current.map(s => s.letter).join('');
    if (wordList.includes(attempt)) {
      attemptValidation(current);
    } else {
      clearSelection();
    }
  }

  async function goToRoundComplete(wordsFound, timeLeft, finalScore, finalStreak) {
    const roundNumber = sessionStats.round;
    // Persist adaptive resume state so the next "Quick Play" picks up the
    // difficulty curve where the player left off.
    try {
      const { setLastAdaptiveStats } = require('../utils/storage');
      const newHistoryTmp = [
        ...(sessionStats.history || []),
        { wordsFound, totalWords: wordList.length, timeLeft },
      ];
      const avgW = newHistoryTmp.reduce((a, h) => a + h.wordsFound, 0) / newHistoryTmp.length;
      const avgT = newHistoryTmp.reduce((a, h) => a + h.timeLeft, 0) / newHistoryTmp.length;
      await setLastAdaptiveStats({
        roundsPlayed: roundNumber,
        avgWordsFound: avgW,
        avgTimeLeft: avgT,
        currentStreak: finalStreak,
        lastCategory: level.category,
      });
    } catch {}
    const newHistory = [
      ...(sessionStats.history || []),
      {
        wordsFound,
        totalWords: wordList.length,
        timeLeft,
        scoreDelta: finalScore - (sessionStats.score || 0),
        category: level.category,
        hintsUsed: hintsUsedThisRound,
        timeSpent: Math.max(0, difficulty.timeLimit - timeLeft),
        perfect: wordsFound === wordList.length,
      },
    ];
    const avgWords = newHistory.reduce((a, h) => a + h.wordsFound, 0) / newHistory.length;
    const avgTime = newHistory.reduce((a, h) => a + h.timeLeft, 0) / newHistory.length;

    navigation.replace('RoundComplete', {
      playerStats: {
        roundsPlayed: roundNumber,
        avgWordsFound: avgWords,
        avgTimeLeft: avgTime,
        currentStreak: finalStreak,
        lastCategory: level.category,
      },
      sessionStats: {
        ...sessionStats,
        score: finalScore,
        round: roundNumber + 1,
        streak: finalStreak,
        history: newHistory,
        highScore: Math.max(sessionStats.highScore || 0, finalScore),
        bestStreak: Math.max(sessionStats.bestStreak || 0, finalStreak),
      },
      level,
      difficulty,
      roundResult: {
        wordsFound,
        totalWords: wordList.length,
        timeLeft,
        roundScore: finalScore - (sessionStats.score || 0),
        roundNumber,
        streak: finalStreak,
        category: level.category,
        hintsUsed: hintsUsedThisRound,
        timeSpent: Math.max(0, difficulty.timeLimit - timeLeft),
        levelNumber,
      },
    });
  }

  function onTimeUp() {
    if (paused) return;
    setPaused(true);
    goToRoundComplete(foundWords.length, 0, score, foundWords.length === wordList.length ? streak : 0);
  }

  const currentSelection = selected.map(s => s.letter).join('');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.topBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.topCol}>
          <Text style={styles.topLabel}>SCORE</Text>
          <Text style={[styles.scoreText, { color: theme.accent }]}>💰 {score}</Text>
        </View>
        <View style={styles.topCol}>
          <Text style={styles.topLabel}>TIME</Text>
          <Timer
            timeLimit={difficulty.timeLimit}
            onTimeUp={onTimeUp}
            onTick={onTick}
            paused={paused}
          />
        </View>
        <View style={styles.topCol}>
          <Text style={styles.topLabel}>STREAK</Text>
          <Text style={[styles.streakText, { color: theme.gold }]}>🔥 {streak}</Text>
          {streak >= 2 ? (
            <Text style={styles.comboText}>
              ⚡ {streak >= 6 ? '3x' : streak >= 4 ? '2x' : '1.5x'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.categoryRow}>
        <View style={[styles.categoryPill, { backgroundColor: theme.card, borderColor: theme.accent }]}>
          <Text style={[styles.category, { color: theme.accent }]}>
            {level.categoryEmoji} {level.category}
          </Text>
        </View>
        <View style={[styles.roundPill, { borderColor: theme.border }]}>
          <Text style={styles.roundText}>Round #{sessionStats.round}</Text>
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
          goldCells={goldCells}
        />
      </Animated.View>

      <WordList words={wordList} foundWords={foundWords} currentSelection={currentSelection} />

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.btn,
            { backgroundColor: `${theme.gold}1f`, borderColor: theme.gold, borderWidth: 1 },
            hintsLeft <= 0 && { opacity: 0.4 },
          ]}
          onPress={useHint}
          disabled={hintsLeft <= 0}
        >
          <Text style={[styles.btnText, { color: theme.gold }]}>💡 Hint ({hintsLeft})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
          onPress={clearSelection}
        >
          <Text style={[styles.btnText, { color: '#cbd5e1' }]}>✕ Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#7f1d1d', borderColor: '#ef4444', borderWidth: 1 }]}
          onPress={() => navigation.replace('GameOver', { sessionStats: { ...sessionStats, score, streak } })}
        >
          <Text style={[styles.btnText, { color: '#fecaca' }]}>Quit</Text>
        </TouchableOpacity>
      </View>

      <AgentThinking message={agentMsg} visible={agentVisible} />

      {popups.map((p) => (
        <ScorePopup key={p.id} text={p.text} x={p.x} y={p.y} color={p.color} />
      ))}

      <Confetti visible={showConfetti} onDone={() => setShowConfetti(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 12, paddingTop: 105, paddingBottom: 12 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1,
  },
  topCol: { alignItems: 'center', flex: 1 },
  topLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 2 },
  scoreText: { fontSize: 18, fontWeight: '900' },
  streakText: { fontSize: 18, fontWeight: '900' },
  comboText: { color: '#f97316', fontSize: 10, fontWeight: '900', marginTop: 1 },

  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  categoryPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  category: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  roundPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  roundText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },

  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  btnText: { fontWeight: '900', fontSize: 13 },
});
