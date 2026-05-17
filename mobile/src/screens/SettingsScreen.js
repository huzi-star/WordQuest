import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../utils/settings';
import { resetStats } from '../utils/storage';

function Row({ icon, title, subtitle, right }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { settings, setSetting, t } = useSettings();

  function confirmReset() {
    Alert.alert(
      'Reset all stats?',
      'Tumhare saare scores, badges, streak, aur category mastery zero ho jayenge. Yeh undo nahi ho sakta.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => { await resetStats(); Alert.alert('Done', 'Saari stats reset ho gayi.'); },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.blob, { backgroundColor: '#22c55e', top: -100, right: -80 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>⚙ Settings</Text>
              <Text style={styles.subtitle}>App ki har cheez control karo</Text>
            </View>
          </View>

          <Text style={styles.section}>FEEDBACK</Text>
          <View style={styles.card}>
            <Row
              icon="🔊"
              title={t('sound_setting')}
              subtitle="Ding sound when word found"
              right={
                <Switch
                  value={settings.sound}
                  onValueChange={(v) => setSetting('sound', v)}
                  trackColor={{ false: '#334155', true: '#22c55e' }}
                  thumbColor="#fff"
                />
              }
            />
            <View style={styles.divider} />
            <Row
              icon="📳"
              title={t('vibration_setting')}
              subtitle="Haptic feedback on touch + word"
              right={
                <Switch
                  value={settings.vibration}
                  onValueChange={(v) => setSetting('vibration', v)}
                  trackColor={{ false: '#334155', true: '#22c55e' }}
                  thumbColor="#fff"
                />
              }
            />
          </View>

          <Text style={styles.section}>LANGUAGE</Text>
          <View style={styles.card}>
            <Row
              icon="🌐"
              title={t('language_setting')}
              subtitle={settings.language === 'urdu' ? 'Roman Urdu + English mix' : 'Pure English UI'}
              right={
                <View style={styles.langToggle}>
                  <TouchableOpacity
                    onPress={() => setSetting('language', 'urdu')}
                    style={[styles.langBtn, settings.language === 'urdu' && styles.langBtnActive]}
                  >
                    <Text style={[styles.langText, settings.language === 'urdu' && styles.langTextActive]}>اU</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSetting('language', 'english')}
                    style={[styles.langBtn, settings.language === 'english' && styles.langBtnActive]}
                  >
                    <Text style={[styles.langText, settings.language === 'english' && styles.langTextActive]}>EN</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>

          <Text style={styles.section}>DATA</Text>
          <View style={styles.card}>
            <TouchableOpacity onPress={confirmReset}>
              <Row
                icon="🗑"
                title={t('reset_stats')}
                subtitle="Saari progress wapas zero ho jayegi"
                right={<Text style={styles.dangerArrow}>→</Text>}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>ABOUT</Text>
          <View style={styles.card}>
            <Row icon="🎮" title="WordQuest" subtitle="Version 1.6.0 · Powered by Google Gemini" />
            <View style={styles.divider} />
            <Row icon="🏆" title="Built for #AISeekho2026" subtitle="Antigravity Hackathon — Agentic Game Quest" />
            <View style={styles.divider} />
            <Row icon="🤖" title="8 AI Agents" subtitle="Difficulty · Generator · Referee · Reward · Tutor · Commentator · Coach · Chaalbaaz" />
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14', overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.1 },
  scroll: { padding: 18, gap: 8 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1f2937' },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  section: { color: '#94a3b8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 14, marginBottom: 4 },
  card: { backgroundColor: '#0e1726', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  rowIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowSub: { color: '#64748b', fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1f2937', marginLeft: 56 },

  langToggle: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 10, padding: 2 },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  langBtnActive: { backgroundColor: '#22c55e' },
  langText: { color: '#94a3b8', fontWeight: '900', fontSize: 12 },
  langTextActive: { color: '#0f172a' },

  dangerArrow: { color: '#ef4444', fontSize: 22, fontWeight: 'bold' },
});
