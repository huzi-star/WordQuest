import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../utils/theme';
import { useSettings } from '../utils/settings';
import { generateQuiz } from '../utils/api';
import {
  loadStats, rememberQuizTopic, rememberQuizQuestions, markQuizAttempt,
} from '../utils/storage';
import { trace } from '../utils/trace';
import { Easing } from 'react-native';

const BG = require('../../home_design/home_bg.jpeg');

// Premium loading screen shown while gpt-4o-mini generates the quiz.
function QuizLoading({ theme }) {
  const [stepIdx, setStepIdx] = useState(0);
  const rotate = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const STEPS = [
    { icon: '🧠', text: 'Picking fresh topics for you...' },
    { icon: '🤖', text: 'AI writing 20 questions...' },
    { icon: '✍️', text: 'Crafting four plausible options...' },
    { icon: '✨', text: 'Adding short explanations...' },
    { icon: '🎯', text: 'Shuffling and finalizing...' },
  ];

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
    const id = setInterval(() => setStepIdx((i) => (i + 1) % STEPS.length), 1700);
    return () => clearInterval(id);
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <ImageBackground source={BG} style={styles.loadContainer} resizeMode="cover">
      <View style={styles.tint} />

      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={styles.titlePlate}>
          <Text style={styles.titlePlateBig}>AI Quiz Engine</Text>
          <Text style={styles.titlePlateSub}>GENERATING YOUR QUIZ</Text>
        </View>
        <Animated.View style={[styles.loadCard, { opacity: fade }]}>

          {/* Animated halo + core */}
          <Animated.View style={[styles.loadHaloOuter, { borderColor: `${theme.accent2}33`, transform: [{ scale: pulse }] }]}>
            <Animated.View style={[styles.loadHaloRing, { transform: [{ rotate: spin }] }]}>
              <View style={[styles.loadHaloDot, { backgroundColor: theme.accent2, shadowColor: theme.accent2 }]} />
              <View style={[styles.loadHaloDotSm, { backgroundColor: theme.gold }]} />
            </Animated.View>
            <View style={[styles.loadCore, { borderColor: theme.accent2 }]}>
              <Text style={styles.loadCoreIcon}>❓</Text>
            </View>
          </Animated.View>

          <Text style={[styles.loadBrand, { color: theme.accent2 }]}>AI QUIZ ENGINE</Text>
          <Text style={styles.loadTitle}>Generating your quiz</Text>

          {/* Animated step text */}
          <View style={styles.loadStepRow}>
            <Text style={styles.loadStepIcon}>{STEPS[stepIdx].icon}</Text>
            <Text style={styles.loadStepText}>{STEPS[stepIdx].text}</Text>
          </View>

          {/* Step dots */}
          <View style={styles.loadDots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.loadDot,
                  i === stepIdx && { backgroundColor: theme.accent2, width: 22 },
                ]}
              />
            ))}
          </View>

          {/* Stat strip */}
          <View style={[styles.loadStats, { borderColor: theme.border }]}>
            <View style={styles.loadStatTile}>
              <Text style={styles.loadStatLabel}>QUESTIONS</Text>
              <Text style={[styles.loadStatValue, { color: theme.accent2 }]}>20</Text>
            </View>
            <View style={styles.loadStatDivider} />
            <View style={styles.loadStatTile}>
              <Text style={styles.loadStatLabel}>PER ANSWER</Text>
              <Text style={[styles.loadStatValue, { color: theme.gold }]}>+2</Text>
            </View>
            <View style={styles.loadStatDivider} />
            <View style={styles.loadStatTile}>
              <Text style={styles.loadStatLabel}>TIME</Text>
              <Text style={[styles.loadStatValue, { color: theme.accent }]}>7s</Text>
            </View>
          </View>

          <Text style={styles.loadFooter}>Powered by gpt-4o-mini · Fresh questions every time</Text>
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const QUIZ_QUESTIONS = 20;
const SECONDS_PER_QUESTION = 7;
const POINTS_PER_CORRECT = 2;
const LOCK_HOURS = 12;
const LOCK_MS = LOCK_HOURS * 60 * 60 * 1000;

function formatHMS(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function QuizScreen({ navigation }) {
  const theme = useTheme();
  const { settings, t } = useSettings();
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const fade = useRef(new Animated.Value(0)).current;
  const tickRef = useRef(null);

  // On focus: load quiz. Quiz no longer uses a 12-hour lock — daily
  // attempt cap is enforced via the plan limit at the Home entry point.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const s = await loadStats();
      setLockedUntil(0);
      const recentTopics = s.recentQuizTopics || [];
      const recentQs = s.recentQuizQuestions || [];
      const res = await generateQuiz({
        count: QUIZ_QUESTIONS, difficulty: 'medium',
        excludeTopics: recentTopics,
        excludeQuestions: recentQs.slice(0, 40),
        language: settings.language,
      });
      if (cancelled) return;
      if (res?.ok && res.result?.questions?.length) {
        setQuiz(res.result);
        if (res.result.topic) rememberQuizTopic(res.result.topic);
        rememberQuizQuestions(res.result.questions.map((q) => q.question));
      }
      setLoading(false);
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    })();
    return () => { cancelled = true; };
  }, [settings.language]));

  // 7-second per-question timer.
  useEffect(() => {
    if (loading || !quiz || done) return undefined;
    if (picked !== null) return undefined;
    setTimeLeft(SECONDS_PER_QUESTION);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setTimeLeft((tl) => {
        if (tl <= 1) {
          clearInterval(tickRef.current);
          tickRef.current = null;
          // -1 sentinel = time out, no score gain.
          setPicked(-1);
          setTimeout(() => {
            setPicked(null);
            if (idx >= quiz.questions.length - 1) {
              finishQuiz();
            } else {
              setIdx((i) => i + 1);
            }
          }, 1400);
          return 0;
        }
        return tl - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [idx, loading, quiz, picked, done]);

  // Lock countdown.
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function finishQuiz() {
    setDone(true);
    // Points were already credited per-question via addScorePoints +
    // immediate Supabase sync inside pickOption(), so finishQuiz only
    // needs to record the cooldown attempt timestamp.
    await markQuizAttempt();
    trace('quiz-session', `finished ${correctCount}/${quiz.questions.length}`, {
      correct: correctCount, total: quiz.questions.length, score: correctCount * POINTS_PER_CORRECT,
    });
  }

  async function pickOption(i) {
    if (picked !== null) return;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPicked(i);
    const q = quiz.questions[idx];
    if (i === q.correctIndex) {
      setScore((s) => s + POINTS_PER_CORRECT);
      setCorrectCount((c) => c + 1);
      trace('quiz-correct', q.question?.slice(0, 60) || `q${idx+1}`, { qIndex: idx, gained: POINTS_PER_CORRECT });
      // Persist these 2 points IMMEDIATELY:
      //   a. totalScoreEver (drives tier progression)
      //   b. highScore (auto-bumped if total exceeds it)
      //   c. wq_user_leaderboard ranking row
      try {
        // eslint-disable-next-line global-require
        const { addScorePoints } = require('../utils/storage');
        const fresh = await addScorePoints(POINTS_PER_CORRECT);
        // Push to Supabase user_stats + leaderboard so other devices /
        // the tier leaderboard reflect the new total without delay.
        // eslint-disable-next-line global-require
        const { supabase, upsertStats } = require('../utils/supabase');
        // eslint-disable-next-line global-require
        const { leaderboardUpsert } = require('../utils/api');
        if (supabase && fresh) {
          const { data: u } = await supabase.auth.getUser();
          const uid = u?.user?.id;
          if (uid) {
            await upsertStats(uid, fresh, { ...(settings || {}) });
            const displayName =
              u.user.user_metadata?.display_name ||
              u.user.user_metadata?.full_name ||
              (u.user.email ? u.user.email.split('@')[0] : 'Player');
            await leaderboardUpsert({
              userId: uid,
              displayName,
              avatarColor: settings?.avatarColor || null,
              avatarUrl: settings?.avatarUrl || null,
              avatarEmoji: settings?.avatarEmoji || null,
              totalScore: fresh.totalScoreEver || 0,
              highScore: fresh.highScore || 0,
              totalGames: fresh.totalGamesPlayed || 0,
            });
          }
        }
      } catch (_) {}
    } else {
      trace('quiz-wrong', q.question?.slice(0, 60) || `q${idx+1}`, { qIndex: idx, picked: i, correct: q.correctIndex });
    }
  }
  function next() {
    if (idx >= quiz.questions.length - 1) {
      finishQuiz();
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  }

  // LOCKED STATE
  if (lockedUntil) {
    const remaining = Math.max(0, lockedUntil - now);
    return (
      <ImageBackground source={BG} style={styles.container} resizeMode="cover">
        <View style={styles.tint} />
        <SafeAreaView style={{ flex: 1, padding: 20 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.back, { borderColor: theme.border }]}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={[styles.title, { color: theme.accent2 }]}>🎓 Quiz Mode</Text>
              <Text style={styles.subtitle}>AI-generated trivia</Text>
            </View>
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={[styles.lockedCard, { backgroundColor: theme.card, borderColor: theme.accent2, shadowColor: theme.accent2 }]}>
              <View style={[styles.lockCircle, { borderColor: theme.accent2 }]}>
                <Text style={styles.lockEmoji}>🔒</Text>
              </View>
              <Text style={[styles.lockTitle, { color: theme.accent2 }]}>QUIZ LOCKED</Text>
              <Text style={styles.lockSub}>
                You have finished today's quiz. A fresh set of {QUIZ_QUESTIONS} questions unlocks in {LOCK_HOURS} hours.
              </Text>
              <Text style={styles.countdownLabel}>UNLOCKS IN</Text>
              <Text style={[styles.countdown, { color: theme.accent2 }]}>{formatHMS(remaining)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.btnText, { color: '#fff' }]}>← BACK TO HOME</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (loading) {
    return <QuizLoading theme={theme} />;
  }

  if (!quiz) {
    return (
      <ImageBackground source={BG} style={styles.container} resizeMode="cover">
        <View style={styles.tint} />
        <SafeAreaView style={styles.center}>
          <Text style={styles.errText}>Quiz could not load.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.btn, { backgroundColor: '#22c55e', borderBottomColor: '#14532d' }]}>
            <Text style={[styles.btnText, { color: '#fff' }]}>Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // DONE STATE — show total score
  if (done) {
    const total = quiz.questions.length;
    const pct = Math.round((correctCount / total) * 100);
    const finalScore = correctCount * POINTS_PER_CORRECT;
    return (
      <ImageBackground source={BG} style={styles.container} resizeMode="cover">
        <View style={styles.tint} />
        <SafeAreaView style={{ flex: 1, padding: 20 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.resultEmoji}>{pct >= 75 ? '🏆' : pct >= 50 ? '🎯' : '💪'}</Text>
            <Text style={[styles.resultTitle, { color: theme.accent }]}>Quiz Complete!</Text>

            <View style={[styles.totalCard, { borderColor: theme.gold, backgroundColor: theme.card, shadowColor: theme.gold }]}>
              <Text style={[styles.totalLabel, { color: theme.gold }]}>TOTAL SCORE</Text>
              <Text style={[styles.totalValue, { color: theme.gold }]}>{finalScore}</Text>
              <Text style={styles.totalMeta}>{correctCount} correct / {total} questions · {pct}%</Text>
            </View>

            <Text style={styles.topic}>{quiz.topicEmoji} {quiz.topic}</Text>
            <Text style={styles.lockNote}>Quiz locked for {LOCK_HOURS} hours — new questions tomorrow.</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#22c55e', borderBottomColor: '#14532d' }]}
            onPress={() => navigation.replace('Home')}
          >
            <Text style={[styles.btnText, { color: '#fff' }]}>BACK TO HOME</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const q = quiz.questions[idx];
  const correct = q.correctIndex;
  const showFeedback = picked !== null;

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.back, { borderColor: theme.border }]}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.accent }]}>{quiz.topicEmoji} {quiz.topic}</Text>
            <Text style={styles.subtitle}>Question {idx + 1} / {quiz.questions.length}</Text>
          </View>
          <View style={styles.pillsRow}>
            <View
              style={[
                styles.timePill,
                {
                  borderColor: timeLeft <= 2 ? '#ef4444' : theme.accent,
                  backgroundColor: timeLeft <= 2 ? 'rgba(239,68,68,0.15)' : `${theme.accent}1f`,
                },
              ]}
            >
              <Text style={[styles.timeText, { color: timeLeft <= 2 ? '#ef4444' : theme.accent }]}>
                ⏱ {timeLeft}s
              </Text>
            </View>
            <View style={[styles.scorePill, { borderColor: theme.gold }]}>
              <Text style={[styles.scoreText, { color: theme.gold }]}>★ {score}</Text>
            </View>
          </View>
        </View>

        <Animated.View style={{ flex: 1, opacity: fade }}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
            <View style={[styles.qCard, { borderColor: theme.border }]}>
              <Text style={styles.qText}>{q.question}</Text>
            </View>

            {q.options.map((opt, i) => {
              const isPicked = picked === i;
              const isCorrect = i === correct;
              let bg = theme.card;
              let borderColor = theme.border;
              if (showFeedback) {
                if (isCorrect) { bg = 'rgba(34,197,94,0.15)'; borderColor = '#22c55e'; }
                else if (isPicked) { bg = 'rgba(239,68,68,0.15)'; borderColor = '#ef4444'; }
              } else if (isPicked) {
                bg = `${theme.accent}22`; borderColor = theme.accent;
              }
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.85}
                  onPress={() => pickOption(i)}
                  style={[styles.optCard, { backgroundColor: bg, borderColor }]}
                  disabled={showFeedback}
                >
                  <Text style={[styles.optLetter, { color: theme.accent }]}>{String.fromCharCode(65 + i)}</Text>
                  <Text style={styles.optText}>{opt}</Text>
                  {showFeedback && isCorrect ? <Text style={styles.tick}>✓</Text> : null}
                  {showFeedback && isPicked && !isCorrect ? <Text style={styles.cross}>✕</Text> : null}
                </TouchableOpacity>
              );
            })}

            {showFeedback ? (
              <View style={[styles.explainCard, { borderColor: theme.gold }]}>
                <Text style={[styles.explainLabel, { color: theme.gold }]}>AI AGENT</Text>
                <Text style={styles.explainText}>{q.explanation}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>

        {showFeedback ? (
          <View style={{ padding: 18 }}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#22c55e', borderBottomColor: '#14532d' }]}
              onPress={next}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>
                {idx === quiz.questions.length - 1 ? 'FINISH QUIZ' : 'NEXT QUESTION →'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },

  // Wooden plaque title
  titlePlate: {
    backgroundColor: '#92400e',
    paddingHorizontal: 22, paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    alignItems: 'center',
    marginBottom: 18,
  },
  titlePlateBig: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlateSub: { color: '#fde68a', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginTop: -2 },

  // Premium loading screen
  loadContainer: { flex: 1, overflow: 'hidden' },
  loadBlob: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  loadCard: {
    width: '100%', maxWidth: 380,
    borderRadius: 22, borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#0f172a',
    padding: 22, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 18,
  },
  loadHaloOuter: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  loadHaloRing: {
    width: 124, height: 124, borderRadius: 62,
    alignItems: 'center', justifyContent: 'center',
  },
  loadHaloDot: {
    position: 'absolute', top: -3, width: 14, height: 14, borderRadius: 7,
    shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  loadHaloDotSm: { position: 'absolute', right: 0, top: 60, width: 9, height: 9, borderRadius: 5, opacity: 0.85 },
  loadCore: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#0f172a', borderWidth: 4, borderColor: '#facc15',
    alignItems: 'center', justifyContent: 'center',
  },
  loadCoreIcon: { fontSize: 30 },
  loadBrand: { marginTop: 18, fontSize: 11, fontWeight: '900', letterSpacing: 2.5, color: '#fde68a' },
  loadTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  loadStepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14, paddingHorizontal: 8, minHeight: 40,
  },
  loadStepIcon: { fontSize: 22 },
  loadStepText: { color: '#cbd5e1', fontSize: 14, flex: 1, lineHeight: 19 },
  loadDots: { flexDirection: 'row', gap: 6, marginTop: 8 },
  loadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },
  loadStats: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 4,
    borderTopWidth: 1, borderBottomWidth: 1,
    width: '100%',
  },
  loadStatTile: { flex: 1, alignItems: 'center' },
  loadStatLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  loadStatValue: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  loadStatDivider: { width: 1, height: 28, backgroundColor: '#1f2937' },
  loadFooter: { color: '#64748b', fontSize: 11, marginTop: 16, fontStyle: 'italic', textAlign: 'center' },

  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  loadText: { fontWeight: '700' },
  errText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  retryBtn: { padding: 12, borderRadius: 12 },
  retryText: { color: '#0f172a', fontWeight: '900' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  back: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  title: { fontSize: 18, fontWeight: '900', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  subtitle: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  scorePill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 2, backgroundColor: '#78350f', borderColor: '#fbbf24',
  },
  scoreText: { fontWeight: '900', fontSize: 14, color: '#fef3c7' },
  pillsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  timePill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 2,
  },
  timeText: { fontWeight: '900', fontSize: 14 },

  qCard: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 18, padding: 16,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  qText: { color: '#fff', fontSize: 17, lineHeight: 24, fontWeight: '700' },

  optCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16,
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 7, borderBottomColor: '#0f172a',
    backgroundColor: 'rgba(15,23,42,0.85)',
    gap: 12,
  },
  optLetter: { fontSize: 18, fontWeight: '900', width: 24, color: '#fde68a' },
  optText: { color: '#fff', flex: 1, fontSize: 14, fontWeight: '700' },
  tick: { color: '#22c55e', fontSize: 22, fontWeight: '900' },
  cross: { color: '#ef4444', fontSize: 22, fontWeight: '900' },

  explainCard: {
    padding: 14, borderRadius: 18,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#78350f',
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  explainLabel: { fontWeight: '900', fontSize: 11, letterSpacing: 1.4, marginBottom: 4, color: '#fde68a' },
  explainText: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '600' },

  btn: {
    paddingVertical: 16, borderRadius: 999, alignItems: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 9,
  },
  btnSecondary: {
    backgroundColor: '#3b82f6', borderBottomColor: '#1e3a8a',
  },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },

  // Results
  resultEmoji: { fontSize: 80 },
  resultTitle: { fontSize: 26, fontWeight: '900', marginTop: 8, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  totalCard: {
    marginTop: 24, paddingHorizontal: 30, paddingVertical: 22,
    borderRadius: 22, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 9, borderBottomColor: '#78350f',
    shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  totalLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  totalValue: { fontSize: 60, fontWeight: '900', marginTop: 4 },
  totalMeta: { color: '#cbd5e1', fontSize: 13, marginTop: 4, fontWeight: '700' },
  topic: { color: '#cbd5e1', fontSize: 14, marginTop: 16, fontWeight: '700' },
  lockNote: { color: '#fcd34d', fontSize: 12, marginTop: 8, fontWeight: '700' },

  // Locked card
  lockedCard: {
    borderRadius: 22, padding: 22, alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#0f172a',
    shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  lockCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 4, backgroundColor: 'rgba(167,139,250,0.12)' },
  lockEmoji: { fontSize: 50 },
  lockTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  lockSub: { color: '#cbd5e1', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 19 },
  countdownLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 16 },
  countdown: { fontSize: 38, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
});
