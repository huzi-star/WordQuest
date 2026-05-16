import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { roundComplete } from '../utils/api';
import { saveStats, logRound } from '../utils/storage';

export default function RoundCompleteScreen({ navigation, route }) {
  const { playerStats, sessionStats, roundResult } = route.params;
  const [loading, setLoading] = useState(true);
  const [reward, setReward] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await roundComplete({
        wordsFound: roundResult.wordsFound,
        totalWords: roundResult.totalWords,
        timeLeft: roundResult.timeLeft,
        score: roundResult.roundScore,
        roundNumber: roundResult.roundNumber,
        streak: roundResult.streak,
      });
      if (res?.ok) {
        setReward(res.result);
        const allBadges = [...(sessionStats.badges || []), ...(res.result.badges || [])];
        sessionStats.badges = allBadges;
      }
      await saveStats({
        highScore: sessionStats.score,
        bestStreak: Math.max(sessionStats.bestStreak || 0, sessionStats.streak || 0),
      });
      await logRound({
        category: roundResult.category || '',
        wordsFound: roundResult.wordsFound,
        totalWords: roundResult.totalWords,
        timeSpent: roundResult.timeSpent || 0,
        roundScore: roundResult.roundScore || 0,
        perfect: roundResult.wordsFound === roundResult.totalWords,
        hintsUsed: roundResult.hintsUsed || 0,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loading}>🤖 AI tajzia kar raha hai...</Text>
      </SafeAreaView>
    );
  }

  const { wordsFound, totalWords, timeLeft, roundScore } = roundResult;
  const ratio = totalWords > 0 ? wordsFound / totalWords : 0;
  const emoji = ratio === 1 ? '🎉' : ratio >= 0.5 ? '😊' : '💪';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.bigEmoji}>{emoji}</Text>
        <Text style={styles.heading}>Round Complete!</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Words</Text>
            <Text style={styles.statValue}>{wordsFound}/{totalWords}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Time Left</Text>
            <Text style={styles.statValue}>{timeLeft}s</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Points</Text>
            <Text style={styles.statValue}>+{roundScore}</Text>
          </View>
        </View>

        {reward?.badges?.length ? (
          <View style={styles.badgesWrap}>
            <Text style={styles.sectionLabel}>🏅 Badges Earned</Text>
            {reward.badges.map(b => (
              <View key={b.id} style={styles.badgeCard}>
                <Text style={styles.badgeName}>{b.name}</Text>
                <Text style={styles.badgeMsg}>{b.message}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {reward?.encouragement ? (
          <View style={styles.encourageCard}>
            <Text style={styles.encourageText}>{reward.encouragement}</Text>
          </View>
        ) : null}

        {reward?.nextRoundPreview ? (
          <View style={styles.aiCard}>
            <Text style={styles.aiLabel}>AI ka tajzia:</Text>
            <Text style={styles.aiText}>{reward.nextRoundPreview}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() =>
            navigation.replace('Category', { playerStats, sessionStats })
          }
        >
          <Text style={styles.nextText}>▶ Agla Round</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.replace('Home', { highScore: sessionStats.highScore, bestStreak: sessionStats.bestStreak })}
        >
          <Text style={styles.homeText}>🏠 Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  loading: { color: '#fff', marginTop: 16 },
  bigEmoji: { fontSize: 80, alignSelf: 'center' },
  heading: { color: '#fff', fontSize: 28, fontWeight: 'bold', alignSelf: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 14, alignItems: 'center' },
  statLabel: { color: '#94a3b8', fontSize: 12 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  badgesWrap: { gap: 8 },
  sectionLabel: { color: '#22c55e', fontWeight: 'bold', fontSize: 16 },
  badgeCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eab308' },
  badgeName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  badgeMsg: { color: '#cbd5e1', marginTop: 4 },
  encourageCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14 },
  encourageText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  aiCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#22c55e' },
  aiLabel: { color: '#22c55e', fontWeight: 'bold' },
  aiText: { color: '#fff', marginTop: 4 },
  nextBtn: { backgroundColor: '#22c55e', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  nextText: { color: '#0f172a', fontWeight: 'bold', fontSize: 18 },
  homeBtn: { backgroundColor: '#1e293b', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  homeText: { color: '#fff', fontWeight: 'bold' },
});
