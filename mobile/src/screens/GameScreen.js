import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WordGrid from '../components/WordGrid';
import WordList from '../components/WordList';
import Timer from '../components/Timer';
import AgentThinking from '../components/AgentThinking';
import { validateWord } from '../utils/api';

export default function GameScreen({ navigation, route }) {
  const { playerStats, sessionStats, difficulty, level } = route.params;
  const [selected, setSelected] = useState([]); // [{r,c,letter}]
  const [foundCells, setFoundCells] = useState([]);
  const [foundWords, setFoundWords] = useState([]);
  const [score, setScore] = useState(sessionStats.score || 0);
  const [streak, setStreak] = useState(sessionStats.streak || 0);
  const [agentMsg, setAgentMsg] = useState('');
  const [agentVisible, setAgentVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const timeLeftRef = useRef(difficulty.timeLimit);
  const shake = useRef(new Animated.Value(0)).current;

  const wordList = useMemo(() => (level.words || []).map(w => w.toUpperCase()), [level.words]);

  function showAgent(msg) {
    setAgentMsg(msg);
    setAgentVisible(true);
    setTimeout(() => setAgentVisible(false), 2400);
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

  function findWordPositionCells(word) {
    const pos = (level.wordPositions || []).find(p => p.word.toUpperCase() === word);
    if (!pos) return [];
    const cells = [];
    for (let i = 0; i < word.length; i++) {
      if (pos.direction === 'horizontal') cells.push({ r: pos.startRow, c: pos.startCol + i });
      else cells.push({ r: pos.startRow + i, c: pos.startCol });
    }
    return cells;
  }

  async function attemptValidation(currentLetters) {
    const wordAttempt = currentLetters.map(s => s.letter).join('');
    const res = await validateWord({
      word: wordAttempt,
      wordList,
      foundWords,
      timeLeft: timeLeftRef.current,
      score,
    });

    if (!res?.ok) {
      showAgent('Backend nahi mila — selection clear');
      clearSelection();
      return;
    }
    const r = res.result;

    if (r.isValid) {
      const cellsForWord = findWordPositionCells(wordAttempt);
      const mergedCells = [...foundCells, ...cellsForWord];
      const newFoundWords = [...foundWords, wordAttempt];
      setFoundCells(mergedCells);
      setFoundWords(newFoundWords);
      setScore(r.newScore);
      setStreak(s => s + 1);
      showAgent(r.message);
      clearSelection();

      if (newFoundWords.length === wordList.length) {
        setPaused(true);
        setTimeout(() => goToRoundComplete(newFoundWords.length, timeLeftRef.current, r.newScore, streak + 1), 700);
      }
    } else {
      shakeGrid();
      setStreak(0);
      showAgent(r.message);
      clearSelection();
    }
  }

  function isValidLine(cells) {
    if (cells.length <= 1) return true;
    const sameRow = cells.every(x => x.r === cells[0].r);
    const sameCol = cells.every(x => x.c === cells[0].c);
    if (!sameRow && !sameCol) return false;
    const axis = sameRow ? 'c' : 'r';
    const vals = cells.map(x => x[axis]);
    // require strictly ascending consecutive (matches L-R / T-B word placement)
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== vals[i - 1] + 1) return false;
    }
    return true;
  }

  function onLetterPress(r, c, letter) {
    const idx = selected.findIndex(s => s.r === r && s.c === c);
    let next;
    if (idx >= 0) {
      // tapping an already-selected cell deselects it
      next = selected.filter((_, i) => i !== idx);
    } else {
      const candidate = [...selected, { r, c, letter }];
      if (isValidLine(candidate)) {
        next = candidate;
      } else {
        // breaks the line — restart selection from this cell
        next = [{ r, c, letter }];
        showAgent('Line break — naya selection shuru');
      }
    }
    setSelected(next);

    const attempt = next.map(s => s.letter).join('');
    const target = wordList.find(w => w === attempt);
    if (target) attemptValidation(next);
  }

  function goToRoundComplete(wordsFound, timeLeft, finalScore, finalStreak) {
    const roundNumber = sessionStats.round;
    const newHistory = [
      ...(sessionStats.history || []),
      { wordsFound, totalWords: wordList.length, timeLeft, scoreDelta: finalScore - (sessionStats.score || 0) },
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
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.scoreText}>💰 {score}</Text>
        <Timer
          timeLimit={difficulty.timeLimit}
          onTimeUp={onTimeUp}
          onTick={t => { timeLeftRef.current = t; }}
          paused={paused}
        />
        <Text style={styles.streakText}>🔥 {streak}</Text>
      </View>

      <View style={styles.categoryRow}>
        <Text style={styles.category}>{level.categoryEmoji} {level.category}</Text>
        <Text style={styles.roundText}>Round #{sessionStats.round}</Text>
      </View>

      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <WordGrid
          grid={level.grid}
          onLetterPress={onLetterPress}
          selectedCells={selected}
          foundCells={foundCells}
        />
      </Animated.View>

      <WordList words={wordList} foundWords={foundWords} currentSelection={currentSelection} />

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.clearBtn]} onPress={clearSelection}>
          <Text style={styles.btnText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.quitBtn]}
          onPress={() => navigation.replace('GameOver', { sessionStats: { ...sessionStats, score, streak } })}
        >
          <Text style={styles.btnText}>Quit</Text>
        </TouchableOpacity>
      </View>

      <AgentThinking message={agentMsg} visible={agentVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', borderRadius: 12, padding: 12 },
  scoreText: { color: '#22c55e', fontSize: 18, fontWeight: 'bold' },
  streakText: { color: '#eab308', fontSize: 18, fontWeight: 'bold' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  category: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  roundText: { color: '#94a3b8' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginHorizontal: 4 },
  clearBtn: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  quitBtn: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: 'bold' },
});
