import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/theme';
import { useSettings } from '../utils/settings';
import { generateQuiz } from '../utils/api';
import { loadStats, rememberQuizTopic, rememberQuizQuestions } from '../utils/storage';

export default function QuizScreen({ navigation }) {
  const theme = useTheme();
  const { t } = useSettings();
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(6);
  const fade = useRef(new Animated.Value(0)).current;
  const tickRef = useRef(null);

  // 6-second countdown per question. When time runs out we auto-mark as
  // unanswered (no score gain) and advance after a short feedback delay.
  useEffect(() => {
    if (loading || !quiz || done) return undefined;
    if (picked !== null) return undefined; // freeze when answered
    setTimeLeft(6);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(tickRef.current);
          tickRef.current = null;
          // Mark as time-up: pick a sentinel value (-1) so the option cards
          // still reveal the correct answer briefly.
          setPicked(-1);
          setTimeout(() => {
            setPicked(null);
            if (idx >= quiz.questions.length - 1) setDone(true);
            else setIdx((i) => i + 1);
          }, 1500);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [idx, loading, quiz, picked, done]);

  useEffect(() => {
    (async () => {
      const s = await loadStats();
      const recentTopics = s.recentQuizTopics || [];
      const recentQs = s.recentQuizQuestions || [];
      const res = await generateQuiz({
        count: 8, difficulty: 'medium',
        excludeTopics: recentTopics,
        excludeQuestions: recentQs.slice(0, 24),
      });
      if (res?.ok && res.result?.questions?.length) {
        setQuiz(res.result);
        if (res.result.topic) rememberQuizTopic(res.result.topic);
        rememberQuizQuestions(res.result.questions.map((q) => q.question));
      }
      setLoading(false);
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    })();
  }, []);

  function pickOption(i) {
    if (picked !== null) return;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPicked(i);
    if (i === quiz.questions[idx].correctIndex) {
      setScore((s) => s + 1);
    }
  }
  function next() {
    if (idx >= quiz.questions.length - 1) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadText, { color: theme.accent }]}>AI quiz generate kar raha...</Text>
      </SafeAreaView>
    );
  }

  if (!quiz) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={styles.errText}>Quiz load nahi hua.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.retryBtn, { backgroundColor: theme.accent }]}>
          <Text style={styles.retryText}>{t('back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (done) {
    const total = quiz.questions.length;
    const pct = Math.round((score / total) * 100);
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100 }]} />
        <SafeAreaView style={{ flex: 1, padding: 20 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.resultEmoji}>{pct >= 75 ? '🏆' : pct >= 50 ? '🎯' : '💪'}</Text>
            <Text style={[styles.resultTitle, { color: theme.accent }]}>{t('quiz_results')}</Text>
            <Text style={styles.scoreLine}>{t('quiz_score')}: {score} / {total}</Text>
            <Text style={[styles.scorePct, { color: theme.gold }]}>{pct}%</Text>
            <Text style={styles.topic}>{quiz.topicEmoji} {quiz.topic}</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.accent }]}
            onPress={() => navigation.replace('Home')}
          >
            <Text style={styles.btnText}>{t('quiz_finish')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const q = quiz.questions[idx];
  const correct = q.correctIndex;
  const showFeedback = picked !== null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100, opacity: 0.13 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.accent }]}>{quiz.topicEmoji} {quiz.topic}</Text>
            <Text style={styles.subtitle}>{t('quiz_question')} {idx + 1} / {quiz.questions.length}</Text>
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
              <Text
                style={[
                  styles.timeText,
                  { color: timeLeft <= 2 ? '#ef4444' : theme.accent },
                ]}
              >
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
                <Text style={[styles.explainLabel, { color: theme.gold }]}>{t('ai_agent')}</Text>
                <Text style={styles.explainText}>{q.explanation}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>

        {showFeedback ? (
          <View style={{ padding: 18 }}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.accent }]}
              onPress={next}
            >
              <Text style={styles.btnText}>{idx === quiz.questions.length - 1 ? t('quiz_finish') : t('quiz_next')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadText: { fontWeight: '700' },
  errText: { color: '#ef4444' },
  retryBtn: { padding: 12, borderRadius: 12 },
  retryText: { color: '#0f172a', fontWeight: '900' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1f2937' },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },
  scorePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  scoreText: { fontWeight: '900', fontSize: 14 },
  pillsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  timePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  timeText: { fontWeight: '900', fontSize: 14 },

  qCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, borderWidth: 1 },
  qText: { color: '#fff', fontSize: 17, lineHeight: 24, fontWeight: '600' },

  optCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  optLetter: { fontSize: 18, fontWeight: '900', width: 24 },
  optText: { color: '#fff', flex: 1, fontSize: 14 },
  tick: { color: '#22c55e', fontSize: 22, fontWeight: '900' },
  cross: { color: '#ef4444', fontSize: 22, fontWeight: '900' },

  explainCard: { padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(252,211,77,0.05)' },
  explainLabel: { fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 4 },
  explainText: { color: '#fed7aa', fontSize: 14, lineHeight: 20 },

  btn: { paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  btnText: { color: '#0f172a', fontWeight: '900', fontSize: 16, letterSpacing: 1 },

  // Results
  resultEmoji: { fontSize: 80 },
  resultTitle: { fontSize: 26, fontWeight: '900', marginTop: 8 },
  scoreLine: { color: '#cbd5e1', fontSize: 16, marginTop: 12 },
  scorePct: { fontSize: 64, fontWeight: '900', marginTop: 4 },
  topic: { color: '#94a3b8', fontSize: 14, marginTop: 12 },
});
