import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../utils/settings';
import { useTheme } from '../utils/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '🎮',
    titleK: 'Welcome to WordQuest',
    bodyK: 'Every round is designed live by Gemini AI. No two puzzles are alike.',
    bodyE: 'Every round is designed live by Gemini AI. No two puzzles are alike.',
  },
  {
    icon: '👆',
    titleK: 'Drag or Tap',
    bodyK: 'Drag your finger across letters or tap them one by one. Horizontal, vertical and diagonal — all work.',
    bodyE: 'Drag your finger across letters or tap them one by one. Horizontal, vertical and diagonal — all work.',
  },
  {
    icon: '🤖',
    titleK: '8 AI Agents',
    bodyK: 'Difficulty, generator, referee, tutor, commentator, coach and reward agents all collaborate on every round.',
    bodyE: 'Difficulty, generator, referee, tutor, commentator, coach and reward agents all collaborate on every round.',
  },
  {
    icon: '🚀',
    titleK: '15 levels + Daily',
    bodyK: '15 levels to unlock plus a global Daily Challenge — same puzzle for everyone, every day.',
    bodyE: '15 levels to unlock plus a global Daily Challenge — same puzzle for everyone, every day.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const { settings, setSetting, t } = useSettings();
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  function go(i) {
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  }
  function finish() {
    setSetting('hasSeenOnboarding', true);
    navigation.replace('Home');
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100, opacity: 0.13 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <View />
          <TouchableOpacity onPress={finish}>
            <Text style={[styles.skipText, { color: theme.accent }]}>{t('onboard_skip')}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => `s${i}`}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setIndex(i);
          }}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: SCREEN_W }]}>
              <View style={[styles.iconCircle, { borderColor: theme.accent, shadowColor: theme.accent }]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <Text style={[styles.title, { color: theme.accent }]}>{item.titleK}</Text>
              <Text style={styles.body}>{settings.language === 'english' ? item.bodyE : item.bodyK}</Text>
            </View>
          )}
        />

        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index && { backgroundColor: theme.accent, width: 22 },
              ]}
            />
          ))}
        </View>

        <View style={styles.bottomRow}>
          {index < SLIDES.length - 1 ? (
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: theme.accent }]}
              onPress={() => go(Math.min(SLIDES.length - 1, index + 1))}
            >
              <Text style={styles.nextText}>{t('onboard_next')} →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: theme.accent }]}
              onPress={finish}
            >
              <Text style={styles.nextText}>{t('onboard_start')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 20 },
  skipText: { fontSize: 14, fontWeight: '800' },
  slide: { alignItems: 'center', justifyContent: 'center', padding: 28, flex: 1 },
  iconCircle: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.4, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
  },
  icon: { fontSize: 70 },
  title: { fontSize: 28, fontWeight: '900', marginTop: 28, textAlign: 'center' },
  body: { color: '#cbd5e1', fontSize: 15, textAlign: 'center', marginTop: 14, lineHeight: 22, paddingHorizontal: 10 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#334155' },
  bottomRow: { paddingHorizontal: 24, paddingBottom: 20 },
  nextBtn: { paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
  nextText: { color: '#0f172a', fontSize: 17, fontWeight: '900', letterSpacing: 1.5 },
});
