import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { chatChaalbaaz } from '../utils/api';

const STARTERS = [
  'Tum kon ho?',
  'Main tumse bohot acha hun!',
  'Mujhe ek hint do',
  'Aaj agla challenge kya hai?',
];

export default function ChaalbaazChatScreen({ navigation, route }) {
  const sessionStats = route?.params?.sessionStats || {};
  const [history, setHistory] = useState([
    { role: 'assistant', text: 'Aha! WordQuest ka khiladi aaya hai. Main Chaalbaaz hun — challenge ke liye tayyar? 😏' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    const newHistory = [...history, { role: 'user', text: msg }];
    setHistory(newHistory);
    setInput('');
    setLoading(true);
    scrollRef.current && scrollRef.current.scrollToEnd({ animated: true });

    const res = await chatChaalbaaz({
      history: newHistory,
      message: msg,
      playerStats: {
        currentStreak: sessionStats.streak || 0,
        avgWordsFound: sessionStats.history?.length
          ? sessionStats.history.reduce((a, h) => a + h.wordsFound, 0) / sessionStats.history.length
          : 0,
      },
    });

    const reply = res?.ok ? res.result?.reply : 'Hmm, signal kharab hai. Try again.';
    setHistory((h) => [...h, { role: 'assistant', text: reply }]);
    setLoading(false);
    setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 100);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>😏 Chaalbaaz</Text>
            <Text style={styles.subtitle}>Adversary Agent · Powered by Gemini</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true })}
        >
          {history.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.userBubble : styles.botBubble,
              ]}
            >
              <Text style={m.role === 'user' ? styles.userText : styles.botText}>{m.text}</Text>
            </View>
          ))}
          {loading ? (
            <View style={[styles.bubble, styles.botBubble, { flexDirection: 'row', alignItems: 'center' }]}>
              <ActivityIndicator color="#fcd34d" />
              <Text style={[styles.botText, { marginLeft: 8 }]}>Chaalbaaz soch raha...</Text>
            </View>
          ) : null}
        </ScrollView>

        {history.length <= 1 ? (
          <View style={styles.startersWrap}>
            {STARTERS.map((s) => (
              <TouchableOpacity key={s} style={styles.starterChip} onPress={() => send(s)}>
                <Text style={styles.starterText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Likho..."
            placeholderTextColor="#64748b"
            style={styles.input}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, loading && { opacity: 0.5 }]}
            onPress={() => send()}
            disabled={loading}
          >
            <Text style={styles.sendText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#1e293b', gap: 14 },
  back: { color: '#fff', fontSize: 26, paddingHorizontal: 6 },
  title: { color: '#fcd34d', fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: '#94a3b8', fontSize: 11 },
  chatList: { padding: 14, gap: 8, paddingBottom: 20 },
  bubble: { padding: 12, borderRadius: 14, maxWidth: '85%' },
  userBubble: { backgroundColor: '#22c55e', alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  botBubble: { backgroundColor: '#7f1d1d', alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#f97316' },
  userText: { color: '#0f172a', fontWeight: '600' },
  botText: { color: '#fed7aa' },
  startersWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 6 },
  starterChip: { backgroundColor: '#1e293b', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#475569' },
  starterText: { color: '#cbd5e1', fontSize: 12 },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#1e293b' },
  input: { flex: 1, backgroundColor: '#0f172a', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12 },
  sendText: { color: '#0f172a', fontSize: 18, fontWeight: 'bold' },
});
