import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, ImageBackground, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { tutorChat } from '../utils/api';
import { useSettings } from '../utils/settings';

const BG = require('../../home_design/home_bg.jpeg');

// Floating star/sparkle decorations behind the chat.
function Sparkles() {
  const anims = useRef(
    Array.from({ length: 14 }, () => ({
      x: Math.random() * 100,
      y: new Animated.Value(Math.random() * 700),
      delay: Math.random() * 4000,
      size: 8 + Math.random() * 16,
      char: ['✦', '✧', '⋆', '✨', '·', '★'][Math.floor(Math.random() * 6)],
      color: ['#a78bfa', '#67e8f9', '#fde68a', '#86efac', '#f9a8d4'][Math.floor(Math.random() * 5)],
    })),
  ).current;

  useEffect(() => {
    const loops = anims.map((a) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(a.delay),
          Animated.timing(a.y, {
            toValue: -80,
            duration: 8000 + Math.random() * 4000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(a.y, { toValue: 800, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {anims.map((a, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: `${a.x}%`,
            transform: [{ translateY: a.y }],
            color: a.color,
            fontSize: a.size,
            opacity: 0.7,
          }}
        >
          {a.char}
        </Animated.Text>
      ))}
    </View>
  );
}

export default function TutorScreen({ navigation }) {
  const { settings } = useSettings();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your WordQuest tutor 🤖. Ask me anything about English — words, grammar, spelling, or sentences. What do you want to learn today?" },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const antennaPulse = useRef(new Animated.Value(1)).current;

  // Friendly antenna glow pulse on the robot avatar.
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(antennaPulse, { toValue: 1.35, duration: 700, useNativeDriver: true }),
        Animated.timing(antennaPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const childAge = (() => {
    if (!settings.dob) return 10;
    const [y, m, d] = String(settings.dob).split('-').map((v) => parseInt(v, 10));
    const today = new Date();
    let age = today.getFullYear() - y;
    const mDiff = (today.getMonth() + 1) - m;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age -= 1;
    return Math.max(6, Math.min(13, age || 10));
  })();

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setBusy(true);
    const r = await tutorChat(next.slice(-10), childAge);
    setBusy(false);
    if (r?.ok && r.reply) {
      setMessages((prev) => [...prev, { role: 'assistant', content: r.reply }]);
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Hmm, something went wrong. Try asking again.' }]);
    }
  }

  function speak(text) {
    try { Speech.stop(); Speech.speak(text, { language: 'en-US', rate: 0.95 }); } catch (_) {}
  }

  // Auto-scroll on new message + when keyboard opens, so the input bar +
  // latest bubble are always visible.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length, busy]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    });
    return () => sub.remove();
  }, []);

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <Sparkles />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          {/* HEADER with cute robot avatar + bubbly title */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <View style={styles.robotWrap}>
                <View style={styles.robotAntennaStem} />
                <Animated.View style={[styles.robotAntennaBulb, { transform: [{ scale: antennaPulse }] }]} />
                <View style={styles.robotHead}>
                  <View style={styles.robotEyeRow}>
                    <View style={styles.robotEye}><View style={styles.robotPupil} /></View>
                    <View style={styles.robotEye}><View style={styles.robotPupil} /></View>
                  </View>
                  <View style={styles.robotSmile} />
                  <View style={styles.robotEarL} />
                  <View style={styles.robotEarR} />
                </View>
              </View>

              <View style={styles.titlePlate}>
                <Text style={styles.titleText}>AI TUTOR</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeStar}>★</Text>
                <Text style={styles.badgeText}>PRO MAX · 1-ON-1 CHAT</Text>
              </View>
            </View>

            <View style={{ width: 44 }} />
          </View>

          {/* CHAT */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((m, i) => (
              <Bubble key={i} msg={m} onSpeak={() => speak(m.content)} />
            ))}
            {busy ? (
              <View style={styles.thinkingRow}>
                <ActivityIndicator color="#c4b5fd" />
                <Text style={styles.thinkingText}>Tutor is thinking…</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* INPUT BAR — pill with glowing border */}
          <View style={styles.inputWrap}>
            <View style={styles.inputPill}>
              <Text style={styles.micIcon}>🎤</Text>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask anything about English..."
                placeholderTextColor="#94a3b8"
                style={styles.input}
                multiline
                maxLength={300}
                onSubmitEditing={send}
              />
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={send}
                disabled={!input.trim() || busy}
                style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.45 }]}
              >
                <Text style={styles.sendIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function Bubble({ msg, onSpeak }) {
  const mine = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      {!mine ? <Text style={styles.bubbleAvatar}>🤖</Text> : null}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAi]}>
        <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{msg.content}</Text>
        {!mine ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onSpeak} style={styles.speakBtn}>
            <Text style={styles.speakIcon}>🔊</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {mine ? <Text style={styles.bubbleAvatar}>🧒</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.85)' },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },

  headerCenter: { flex: 1, alignItems: 'center' },

  // Robot
  robotWrap: { width: 92, height: 92, alignItems: 'center', marginBottom: 6 },
  robotAntennaStem: { position: 'absolute', top: 0, width: 3, height: 14, backgroundColor: '#fbbf24' },
  robotAntennaBulb: {
    position: 'absolute', top: -6, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fde047',
    shadowColor: '#fde047', shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
    borderWidth: 2, borderColor: '#fff',
  },
  robotHead: {
    position: 'absolute', top: 14, width: 72, height: 68, borderRadius: 18,
    backgroundColor: '#c4b5fd',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 7, borderBottomColor: '#5b21b6',
    alignItems: 'center', justifyContent: 'center',
  },
  robotEarL: { position: 'absolute', left: -8, top: 22, width: 10, height: 18, borderRadius: 4, backgroundColor: '#a78bfa', borderWidth: 2, borderColor: '#fff' },
  robotEarR: { position: 'absolute', right: -8, top: 22, width: 10, height: 18, borderRadius: 4, backgroundColor: '#a78bfa', borderWidth: 2, borderColor: '#fff' },
  robotEyeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  robotEye: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  robotPupil: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#67e8f9' },
  robotSmile: {
    marginTop: 8, width: 28, height: 12,
    borderBottomWidth: 3, borderLeftWidth: 3, borderRightWidth: 3, borderColor: '#0f172a',
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
  },

  // Title plate (wooden plaque)
  titlePlate: {
    backgroundColor: '#581c87',
    paddingHorizontal: 18, paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 3, borderColor: '#c084fc',
    borderBottomWidth: 6, borderBottomColor: '#3b0764',
  },
  titleText: {
    color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.5,
    textShadowColor: '#22c55e', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  badge: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#22c55e',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  badgeStar: { color: '#fde047', fontSize: 10, fontWeight: '900' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  list: { padding: 14, paddingBottom: 18 },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 6 },
  bubbleAvatar: { fontSize: 22, marginBottom: 4 },
  bubble: {
    maxWidth: '78%', padding: 12, borderRadius: 20,
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 6,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  bubbleAi: {
    backgroundColor: '#5b21b6',
    borderBottomColor: '#2e1065',
    borderTopLeftRadius: 6,
  },
  bubbleMine: {
    backgroundColor: '#22c55e',
    borderBottomColor: '#14532d',
    borderTopRightRadius: 6,
  },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '700' },
  speakBtn: {
    marginTop: 8, alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  speakIcon: { fontSize: 14 },

  thinkingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(91,33,182,0.4)',
    borderRadius: 16, alignSelf: 'flex-start', marginLeft: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  thinkingText: { color: '#e9d5ff', fontSize: 12, fontWeight: '700' },

  // Input
  inputWrap: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 6 : 10 },
  inputPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 3, borderColor: '#c084fc',
    shadowColor: '#a855f7', shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  micIcon: { fontSize: 20, marginLeft: 4 },
  input: {
    flex: 1, color: '#fff', fontSize: 14, fontWeight: '600',
    paddingHorizontal: 8, paddingVertical: 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  sendIcon: { color: '#fff', fontSize: 16, fontWeight: '900', marginLeft: 2 },
});
