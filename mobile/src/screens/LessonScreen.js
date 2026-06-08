// LessonScreen — renders any lesson type returned by /api/learn/lesson.
// Sequence: load lesson 0 user plays submit load lesson 1 ... after
// lesson 4 complete-unit TierUp / next unit.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Animated, Easing, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useAuth } from '../utils/auth';
import { learnGetLesson, learnSubmitAnswer, learnCompleteUnit, learnLessonResult } from '../utils/api';
import { trace } from '../utils/trace';
import Confetti from '../components/Confetti';

const BG = require('../../home_design/home_bg.jpeg');

const PALETTE = {
  text: '#f4f6fb', muted: '#cbd5e1',
  success: '#22c55e', err: '#ef4444', accent: '#fbbf24',
};

const TOTAL_LESSONS = 5;

export default function LessonScreen({ route, navigation }) {
  const { user } = useAuth();
  const initialUnit = route.params?.unitId || 1;
  const initialIndex = route.params?.lessonIndex || 0;

  const [unitId, setUnitId] = useState(initialUnit);
  const [lessonIndex, setLessonIndex] = useState(initialIndex);
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unitScore, setUnitScore] = useState(0);
  const [unitDone, setUnitDone] = useState(false);
  const [nextUnitInfo, setNextUnitInfo] = useState(null);
  // Per-lesson retry state: counts attempts at the CURRENT lessonIndex.
  // Resets to 0 the moment we advance to the next lesson. Used to ask the
  // backend for fresh wording on a retry.
  const [attempt, setAttempt] = useState(0);
  // Fail screen — set after lesson-result returns passed=false. Mobile
  // refuses to advance until the user retries and passes.
  const [failInfo, setFailInfo] = useState(null);
  // Motivational chip from coach/motivation agent (shown briefly after pass).
  const [motivational, setMotivational] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLesson(null);
    setFailInfo(null);
    const r = await learnGetLesson({ unitId, i: lessonIndex, userId: user?.id || null, attempt });
    if (r?.ok) setLesson(r.lesson);
    setLoading(false);
  }, [unitId, lessonIndex, attempt, user?.id]);

  useEffect(() => { load(); }, [load]);

  function onLessonScore(correctCount) {
    setUnitScore((s) => s + correctCount);
  }

  async function onLessonDone(correctCount) {
    const totalItems = (lesson?.items || []).length;
    // Legacy single-answer log (kept for /dashboard backwards-compat).
    learnSubmitAnswer({
      userId: user?.id, unitId, lessonIndex,
      lessonType: lesson?.type, correct: correctCount > 0,
    }).catch(() => {});

    // Pass/fail gate — backend writes to wq_player_memory.learn_units
    // and decides whether the player may advance.
    const res = await learnLessonResult({
      userId: user?.id,
      unitId, lessonIndex,
      lessonType: lesson?.type || '',
      correctCount, totalItems,
      lessonPayload: lesson,
    });
    trace('learn-lesson', `unit ${unitId} · lesson ${lessonIndex + 1}/${TOTAL_LESSONS} · ${res?.passed ? 'PASS' : 'FAIL'}`, {
      unitId, lessonIndex, lessonType: lesson?.type, correctCount, totalItems, passed: !!res?.passed, attempt,
    }, { userId: user?.id });

    if (!res?.passed) {
      // FAIL — show retry screen with kid-safe motivational line.
      // We do NOT advance lessonIndex; the same lesson must be redone.
      setFailInfo({
        correctCount, totalItems,
        motivational: res?.motivational || 'Almost — try once more, you got this 💪',
      });
      return;
    }

    setMotivational(res?.motivational || '');
    if (lessonIndex + 1 >= TOTAL_LESSONS) {
      // All 5 lessons passed unit complete. NO XP / points per spec.
      const r = await learnCompleteUnit({ userId: user?.id, unitId });
      trace('learn-unit', `unit ${unitId} complete`, { unitId, nextUnitId: r?.nextUnitId }, { userId: user?.id });
      setNextUnitInfo({ ...r, motivational: r?.motivational || motivational });
      setUnitDone(true);
    } else {
      setLessonIndex((i) => i + 1);
      setAttempt(0);
      setUnitScore((s) => s + correctCount);
    }
  }

  function retryLesson() {
    setFailInfo(null);
    setAttempt((a) => a + 1); // backend asks LLM for fresh wording on retry
  }

  if (loading) {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tealTint} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <ActivityIndicator color={PALETTE.accent} size="large" />
            <Text style={styles.loadingText}>Preparing your next lesson…</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (unitDone) {
    return (
      <UnitCompleteScreen
        unitId={unitId}
        nextUnitId={nextUnitInfo?.nextUnitId}
        motivational={nextUnitInfo?.motivational || ''}
        navigation={navigation}
      />
    );
  }

  if (failInfo) {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={[styles.tealTint, { backgroundColor: 'rgba(80,30,30,0.72)' }]} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.failEmoji}>🪁</Text>
            <View style={styles.failPlate}>
              <Text style={styles.failHead}>Almost there</Text>
              <Text style={styles.failSub}>You got {failInfo.correctCount} of {failInfo.totalItems}. Pass mark not reached — keep your unit safe by trying once more.</Text>
            </View>
            <View style={styles.motivCard}>
              <Text style={styles.motivText}>{failInfo.motivational}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={retryLesson}>
              <Text style={styles.ctaText}>↻ TRY AGAIN</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} style={[styles.cta, styles.btnGhost, { marginTop: 10 }]} onPress={() => navigation.goBack()}>
              <Text style={[styles.ctaText, { color: '#fff' }]}>Leave for now</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (!lesson) {
    return (
      <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
        <View style={styles.tealTint} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.loadingText}>Couldn't load lesson. Try again.</Text>
            <TouchableOpacity style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.unitChipPlate}>
            <Text style={styles.unitChip} numberOfLines={1}>{lesson.unitEmoji} {lesson.unitTitle}</Text>
          </View>
          <View style={styles.progressChip}>
            <Text style={styles.progressChipText}>{lessonIndex + 1}/{TOTAL_LESSONS}</Text>
          </View>
        </View>
        <ProgressBar value={(lessonIndex) / TOTAL_LESSONS} />

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
          <Text style={styles.title}>{lesson.title || lesson.unitTitle}</Text>
          {lesson.instruction ? <Text style={styles.instr}>{lesson.instruction}</Text> : null}

          <LessonBody lesson={lesson} onDone={onLessonDone} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function ProgressBar({ value }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.round(value * 100)}%` }]} />
    </View>
  );
}

// =========================================================================
//  Lesson body — routes to the right renderer based on lesson.type.
// =========================================================================

function LessonBody({ lesson, onDone }) {
  switch (lesson.type) {
    case 'flashcard':       return <FlashcardLesson lesson={lesson} onDone={onDone} />;
    case 'match_pairs':     return <MatchPairsLesson lesson={lesson} onDone={onDone} />;
    case 'fill_blank':      return <MCQLesson lesson={lesson} onDone={onDone} questionKey="sentence" />;
    case 'listen_pick':     return <ListenPickLesson lesson={lesson} onDone={onDone} />;
    case 'syn_ant_match':   return <MCQLesson lesson={lesson} onDone={onDone} questionKey="prompt" />;
    case 'tense_pick':      return <MCQLesson lesson={lesson} onDone={onDone} questionKey="prompt" />;
    case 'acronym_expand':  return <MCQLesson lesson={lesson} onDone={onDone} questionKey="acronym" />;
    case 'sentence_build':  return <SentenceBuildLesson lesson={lesson} onDone={onDone} />;
    case 'reading_qa':      return <ReadingLesson lesson={lesson} onDone={onDone} />;
    default:                return <Text style={{ color: '#fff' }}>Unsupported lesson type.</Text>;
  }
}

// -------- Flashcard ---------------------------------------------------------
function FlashcardLesson({ lesson, onDone }) {
  const items = lesson.items || [];
  const [idx, setIdx] = useState(0);
  const card = items[idx] || {};
  function speak(text) {
    try { Speech.stop(); Speech.speak(String(text || ''), { language: 'en-US', rate: 0.9 }); } catch (_) {}
  }
  function next() {
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onDone(items.length);
  }
  return (
    <View>
      <View style={styles.flashCard}>
        <View style={styles.flashHeader}>
          <View style={styles.flashCountPill}>
            <Text style={styles.flashCount}>Card {idx + 1} / {items.length}</Text>
          </View>
          <TouchableOpacity onPress={() => speak(card.word)} style={styles.speakerBtn}>
            <Text style={{ fontSize: 18 }}>🔊</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.flashWord}>{(card.word || '').toUpperCase()}</Text>
        {card.meaning ? <Text style={styles.flashMeaning}>{card.meaning}</Text> : null}
        {card.example ? <Text style={styles.flashExample}>“{card.example}”</Text> : null}
      </View>
      <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={next}>
        <Text style={styles.ctaText}>{idx + 1 < items.length ? 'Next Card' : 'Done ✓'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// -------- Multiple choice (fill_blank / syn_ant / tense / acronym) ---------
function MCQLesson({ lesson, onDone, questionKey }) {
  const items = lesson.items || [];
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  const q = items[idx] || {};
  const options = q.options || [];
  const correct = q.correct;

  function pick(opt) {
    if (picked) return;
    setPicked(opt);
    if (String(opt).toLowerCase() === String(correct).toLowerCase()) setScore((s) => s + 1);
  }
  function next() {
    setPicked(null);
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onDone(score + (picked && String(picked).toLowerCase() === String(correct).toLowerCase() && !items[idx]?._scored ? 0 : 0));
  }

  return (
    <View>
      <View style={styles.promptCard}>
        <Text style={styles.mcqPrompt}>{q[questionKey] || ''}</Text>
      </View>
      <View>
        {options.map((opt, i) => {
          const isCorrect = picked && String(opt).toLowerCase() === String(correct).toLowerCase();
          const isWrongPick = picked === opt && !isCorrect;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={picked ? 1 : 0.85}
              disabled={!!picked}
              onPress={() => pick(opt)}
              style={[
                styles.mcqOption,
                isCorrect && styles.mcqCorrect,
                isWrongPick && styles.mcqWrong,
              ]}
            >
              <Text style={styles.mcqOptionText}>{String(opt)}</Text>
              {isCorrect ? <Text style={[styles.mcqMark, { color: PALETTE.success }]}>✓</Text> : null}
              {isWrongPick ? <Text style={[styles.mcqMark, { color: PALETTE.err }]}>✕</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {picked ? (
        <View style={styles.feedback}>
          <Text style={styles.feedbackText}>
            {String(picked).toLowerCase() === String(correct).toLowerCase() ? '✓ Correct!' : `Correct answer: ${correct}`}
          </Text>
          <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={next}>
            <Text style={styles.ctaText}>{idx + 1 < items.length ? 'Next' : 'Done ✓'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.scoreLine}>Score: {score} / {items.length}</Text>
    </View>
  );
}

// -------- Listen & pick ----------------------------------------------------
function ListenPickLesson({ lesson, onDone }) {
  const items = lesson.items || [];
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  const q = items[idx] || {};
  function speak() {
    try { Speech.stop(); Speech.speak(q.word || '', { language: 'en-US', rate: 0.85 }); } catch (_) {}
  }
  useEffect(() => { if (q?.word) setTimeout(speak, 250); }, [idx]); // eslint-disable-line

  function pick(opt) {
    if (picked) return;
    setPicked(opt);
    if (String(opt).toLowerCase() === String(q.word || '').toLowerCase()) setScore((s) => s + 1);
  }
  function next() {
    setPicked(null);
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onDone(score);
  }

  return (
    <View>
      <TouchableOpacity activeOpacity={0.9} onPress={speak} style={styles.bigSpeaker}>
        <Text style={{ fontSize: 64 }}>🔊</Text>
        <Text style={styles.tapToHear}>Tap to hear again</Text>
      </TouchableOpacity>
      <View style={{ marginTop: 16 }}>
        {(q.options || []).map((opt, i) => {
          const isCorrect = picked && String(opt).toLowerCase() === String(q.word || '').toLowerCase();
          const isWrong = picked === opt && !isCorrect;
          return (
            <TouchableOpacity key={i} activeOpacity={picked ? 1 : 0.85} disabled={!!picked} onPress={() => pick(opt)}
              style={[
                styles.mcqOption,
                isCorrect && styles.mcqCorrect,
                isWrong && styles.mcqWrong,
              ]}
            >
              <Text style={styles.mcqOptionText}>{String(opt)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {picked ? (
        <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={next}>
          <Text style={styles.ctaText}>{idx + 1 < items.length ? 'Next' : 'Done ✓'}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.scoreLine}>Score: {score} / {items.length}</Text>
    </View>
  );
}

// -------- Match pairs ------------------------------------------------------
function MatchPairsLesson({ lesson, onDone }) {
  const items = lesson.items || [];
  const [picked, setPicked] = useState({ side: null, idx: null });
  const [matched, setMatched] = useState(new Set());
  const [wrongs, setWrongs] = useState(0);
  // Shuffle right side once.
  const [rightOrder] = useState(() => items.map((_, i) => i).sort(() => Math.random() - 0.5));

  function tap(side, i) {
    if (matched.has(i)) return;
    if (!picked.side) { setPicked({ side, idx: i }); return; }
    if (picked.side === side) { setPicked({ side, idx: i }); return; }
    // Cross-tap check
    const a = picked.idx; const b = i;
    if (a === b) {
      const newMatched = new Set(matched); newMatched.add(a); setMatched(newMatched);
      if (newMatched.size === items.length) {
        const earned = items.length - wrongs;
        setTimeout(() => onDone(Math.max(0, earned)), 350);
      }
    } else {
      setWrongs((w) => w + 1);
    }
    setPicked({ side: null, idx: null });
  }

  return (
    <View>
      <View style={styles.matchRow}>
        <View style={{ flex: 1 }}>
          {items.map((it, i) => (
            <TouchableOpacity
              key={`L${i}`}
              activeOpacity={0.85}
              disabled={matched.has(i)}
              onPress={() => tap('L', i)}
              style={[
                styles.matchCard,
                picked.side === 'L' && picked.idx === i && styles.matchActive,
                matched.has(i) && styles.matchDone,
              ]}
            >
              <Text style={styles.matchText}>{it.left}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          {rightOrder.map((origIdx, displayIdx) => (
            <TouchableOpacity
              key={`R${displayIdx}`}
              activeOpacity={0.85}
              disabled={matched.has(origIdx)}
              onPress={() => tap('R', origIdx)}
              style={[
                styles.matchCard,
                picked.side === 'R' && picked.idx === origIdx && styles.matchActive,
                matched.has(origIdx) && styles.matchDone,
              ]}
            >
              <Text style={styles.matchText}>{items[origIdx]?.right}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={styles.scoreLine}>Matched: {matched.size}/{items.length} · Mistakes: {wrongs}</Text>
    </View>
  );
}

// -------- Sentence build ----------------------------------------------------
function SentenceBuildLesson({ lesson, onDone }) {
  const items = lesson.items || [];
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState([]);
  const [score, setScore] = useState(0);
  const [checked, setChecked] = useState(false);

  const q = items[idx] || {};
  const scrambled = q.scrambled || [];
  const correct = q.correct || [];
  const remaining = scrambled.filter((w, i) => !picked.some((p) => p.original === i));

  function pickWord(w, i) {
    setPicked([...picked, { word: w, original: i }]);
  }
  function unpick(p) {
    setPicked(picked.filter((x) => x.original !== p.original));
  }

  function check() {
    setChecked(true);
    if (picked.map((p) => p.word).join(' ').toLowerCase() === correct.join(' ').toLowerCase()) {
      setScore((s) => s + 1);
    }
  }
  function next() {
    setChecked(false);
    setPicked([]);
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onDone(score);
  }

  const isCorrect = checked && picked.map((p) => p.word).join(' ').toLowerCase() === correct.join(' ').toLowerCase();

  return (
    <View>
      <View style={styles.promptCard}>
        <Text style={styles.mcqPrompt}>Arrange the words to make a correct sentence</Text>
      </View>
      <View style={styles.builderTray}>
        {picked.map((p, i) => (
          <TouchableOpacity key={`p${i}`} activeOpacity={0.85} onPress={() => !checked && unpick(p)} style={styles.wordChip}>
            <Text style={styles.wordChipText}>{p.word}</Text>
          </TouchableOpacity>
        ))}
        {picked.length === 0 ? <Text style={{ color: PALETTE.muted, fontStyle: 'italic', fontWeight: '700' }}>Tap words below…</Text> : null}
      </View>
      <View style={styles.poolTray}>
        {scrambled.map((w, i) => {
          if (picked.some((p) => p.original === i)) return null;
          return (
            <TouchableOpacity key={`s${i}`} activeOpacity={0.85} onPress={() => !checked && pickWord(w, i)} style={styles.wordChipPool}>
              <Text style={styles.wordChipPoolText}>{w}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!checked ? (
        <TouchableOpacity activeOpacity={0.9} style={[styles.cta, picked.length === 0 && { opacity: 0.5 }]} disabled={picked.length === 0} onPress={check}>
          <Text style={styles.ctaText}>Check</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.feedback}>
          <Text style={[styles.feedbackText, { color: isCorrect ? PALETTE.success : PALETTE.err }]}>
            {isCorrect ? '✓ Correct!' : `Correct: ${correct.join(' ')}`}
          </Text>
          <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={next}>
            <Text style={styles.ctaText}>{idx + 1 < items.length ? 'Next' : 'Done ✓'}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={styles.scoreLine}>Score: {score} / {items.length}</Text>
    </View>
  );
}

// -------- Reading ----------------------------------------------------------
function ReadingLesson({ lesson, onDone }) {
  const items = lesson.items || [];
  const story = lesson.story || '';
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  const q = items[idx] || {};

  function pick(opt) {
    if (picked) return;
    setPicked(opt);
    if (String(opt).toLowerCase() === String(q.correct || '').toLowerCase()) setScore((s) => s + 1);
  }
  function next() {
    setPicked(null);
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onDone(score);
  }

  return (
    <View>
      <View style={styles.storyBox}>
        <Text style={styles.storyText}>{story}</Text>
      </View>
      <View style={styles.promptCard}>
        <Text style={styles.mcqPrompt}>{q.question}</Text>
      </View>
      {(q.options || []).map((opt, i) => {
        const isCorrect = picked && String(opt).toLowerCase() === String(q.correct || '').toLowerCase();
        const isWrong = picked === opt && !isCorrect;
        return (
          <TouchableOpacity key={i} activeOpacity={picked ? 1 : 0.85} disabled={!!picked} onPress={() => pick(opt)}
            style={[
              styles.mcqOption,
              isCorrect && styles.mcqCorrect,
              isWrong && styles.mcqWrong,
            ]}
          >
            <Text style={styles.mcqOptionText}>{String(opt)}</Text>
          </TouchableOpacity>
        );
      })}
      {picked ? (
        <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={next}>
          <Text style={styles.ctaText}>{idx + 1 < items.length ? 'Next' : 'Done ✓'}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.scoreLine}>Score: {score} / {items.length}</Text>
    </View>
  );
}

// -------- Unit complete screen ---------------------------------------------
// No XP / points / badges (per spec). Pure encouragement — coachAgent's
// motivational line in the centre, then "Next Unit" to advance.
function UnitCompleteScreen({ unitId, nextUnitId, motivational, navigation }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    try { Speech.speak('Unit complete! Well done!', { language: 'en-US', rate: 0.95 }); } catch (_) {}
  }, []); // eslint-disable-line
  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={[styles.tealTint, { backgroundColor: 'rgba(11,61,23,0.78)' }]} />
      <SafeAreaView style={styles.safe}>
        <Confetti visible count={60} duration={3200} />
        <View style={styles.center}>
          <Animated.Text style={[styles.unitDoneEmoji, { transform: [{ scale }] }]}>🎉</Animated.Text>
          <View style={styles.unitDonePlate}>
            <Text style={styles.unitDoneHead}>Unit {unitId} Complete!</Text>
            <Text style={styles.unitDoneSub}>NEXT UNIT UNLOCKED</Text>
          </View>
          {motivational ? (
            <View style={styles.motivCard}>
              <Text style={styles.motivText}>{motivational}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottomBtns}>
          <TouchableOpacity activeOpacity={0.9} style={[styles.cta, styles.btnGhost, { flex: 1 }]} onPress={() => navigation.popToTop()}>
            <Text style={[styles.ctaText, { color: '#fff' }]}>Back to Home</Text>
          </TouchableOpacity>
          {nextUnitId && nextUnitId !== unitId ? (
            <TouchableOpacity activeOpacity={0.9} style={[styles.cta, { flex: 1 }]} onPress={() => navigation.replace('Lesson', { unitId: nextUnitId, lessonIndex: 0 })}>
              <Text style={styles.ctaText}>Next Unit</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  loadingText: {
    color: '#fde68a', marginTop: 14, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  retry: {
    marginTop: 14, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999,
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 7, borderBottomColor: '#14532d',
  },
  retryText: { color: '#fff', fontWeight: '900', letterSpacing: 1 },

  topBar: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  unitChipPlate: {
    flex: 1,
    backgroundColor: '#92400e',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 6, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  unitChip: { color: '#fff', fontWeight: '900', fontSize: 13 },
  progressChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#facc15',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#78350f',
  },
  progressChipText: { color: '#78350f', fontWeight: '900', fontSize: 12 },

  bar: {
    height: 10, backgroundColor: 'rgba(15,23,42,0.85)', marginHorizontal: 16,
    borderRadius: 5, overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff',
  },
  barFill: { height: '100%', backgroundColor: '#facc15' },

  title: {
    color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 16,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  instr: {
    color: '#fde68a', fontSize: 13, marginTop: 6, marginBottom: 16, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // Flashcard
  flashCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 22, padding: 22,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#0f172a',
    alignItems: 'center', marginBottom: 16,
  },
  flashHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  flashCountPill: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999, backgroundColor: '#facc15',
    borderWidth: 2, borderColor: '#fff',
  },
  flashCount: { color: '#78350f', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  speakerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#1e3a8a',
  },
  flashWord: {
    color: '#fde68a', fontSize: 38, fontWeight: '900', marginTop: 18, letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 4,
  },
  flashMeaning: { color: '#fff', fontSize: 16, textAlign: 'center', marginTop: 14, lineHeight: 22, fontWeight: '700' },
  flashExample: { color: '#cbd5e1', fontStyle: 'italic', textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: '600' },

  // MCQ / prompt
  promptCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: 2, borderColor: '#fbbf24',
  },
  mcqPrompt: { color: '#fff', fontSize: 17, fontWeight: '800', lineHeight: 24 },
  mcqOption: {
    padding: 14, borderRadius: 14, marginBottom: 10,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  mcqCorrect: {
    backgroundColor: 'rgba(34,197,94,0.25)',
    borderColor: '#22c55e', borderBottomColor: '#14532d',
  },
  mcqWrong: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderColor: '#ef4444', borderBottomColor: '#7f1d1d',
  },
  mcqOptionText: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  mcqMark: { fontSize: 22, fontWeight: '900', marginLeft: 8 },

  feedback: { marginTop: 8 },
  feedbackText: {
    color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  scoreLine: { color: '#fde68a', fontSize: 12, textAlign: 'center', marginTop: 14, fontWeight: '800' },

  // Listen
  bigSpeaker: {
    padding: 34, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 22,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#0f172a',
  },
  tapToHear: { color: '#fde68a', marginTop: 10, fontWeight: '800' },

  // Match pairs
  matchRow: { flexDirection: 'row' },
  matchCard: {
    padding: 14, borderRadius: 14, marginBottom: 10,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 6, borderBottomColor: '#0f172a',
  },
  matchActive: {
    borderColor: '#facc15', borderBottomColor: '#78350f',
    backgroundColor: 'rgba(251,191,36,0.18)',
  },
  matchDone: { opacity: 0.4 },
  matchText: {
    color: '#fff', fontWeight: '800', textAlign: 'center', fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // Sentence builder
  builderTray: {
    minHeight: 64, padding: 12, borderRadius: 16, marginBottom: 12,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 6, borderBottomColor: '#78350f',
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  poolTray: {
    padding: 4, marginBottom: 4,
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  wordChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#facc15',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#78350f',
  },
  wordChipText: { color: '#78350f', fontWeight: '900' },
  wordChipPool: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#0f172a',
  },
  wordChipPoolText: { color: '#fff', fontWeight: '900' },

  // Reading
  storyBox: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 18, padding: 14, marginBottom: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  storyText: { color: '#fff', fontSize: 14, lineHeight: 22, fontWeight: '600' },

  // CTA
  cta: {
    marginTop: 16, paddingVertical: 16, alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 999,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#14532d',
    shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  ctaText: {
    color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  btnGhost: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderBottomColor: '#0f172a',
  },

  // Unit complete
  unitDoneEmoji: { fontSize: 88 },
  unitDonePlate: {
    marginTop: 14,
    backgroundColor: '#92400e',
    paddingHorizontal: 26, paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 8, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  unitDoneHead: {
    color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  unitDoneSub: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 2.5, marginTop: -2 },
  unitDoneCard: {
    marginTop: 16,
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 22, paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
    alignItems: 'center',
  },
  unitDoneXp: {
    color: '#fbbf24', fontWeight: '900', fontSize: 20,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  unitDoneScore: { color: '#cbd5e1', marginTop: 6, fontWeight: '700' },
  bottomBtns: { padding: 20, flexDirection: 'row', gap: 12 },

  // Fail / retry surface
  failEmoji: { fontSize: 76, marginBottom: 6 },
  failPlate: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 22,
    borderWidth: 3, borderColor: '#fca5a5',
    borderBottomWidth: 8, borderBottomColor: '#450a0a',
    alignItems: 'center',
  },
  failHead: {
    color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  failSub: { color: '#fecaca', marginTop: 8, fontSize: 13, textAlign: 'center', fontWeight: '700', lineHeight: 19 },

  // Motivational chip (used on both fail + unit-complete screens).
  motivCard: {
    marginTop: 16, alignSelf: 'stretch',
    backgroundColor: 'rgba(8,47,73,0.85)',
    borderRadius: 16, padding: 14,
    borderWidth: 3, borderColor: '#38bdf8',
    borderBottomWidth: 7, borderBottomColor: '#082f49',
  },
  motivText: { color: '#e0f2fe', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
});
