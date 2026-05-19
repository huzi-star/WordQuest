import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../utils/settings';
import { useTheme, THEMES } from '../utils/theme';
import { resetStats } from '../utils/storage';
import { useAuth } from '../utils/auth';
import { signOut, deleteUserStats } from '../utils/supabase';
import { CommonActions } from '@react-navigation/native';
import ConfirmModal from '../components/ConfirmModal';

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
  const theme = useTheme();
  const { user, configured } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetDoneOpen, setResetDoneOpen] = useState(false);

  function confirmReset() {
    setResetOpen(true);
  }

  async function doReset() {
    setResetOpen(false);
    await resetStats();
    if (user) await deleteUserStats(user.id);
    setResetDoneOpen(true);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -100, right: -80 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>⚙ {t('settings_title')}</Text>
              <Text style={styles.subtitle}>{t('settings_sub')}</Text>
            </View>
          </View>

          <Text style={styles.section}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {!configured ? (
              <Row icon="ℹ️" title="Supabase not configured" subtitle="Set SUPABASE_URL + key in supabase.js" />
            ) : user ? (
              <>
                <Row
                  icon="👤"
                  title={user.user_metadata?.display_name || user.email || 'Player'}
                  subtitle={user.email}
                />
                <View style={styles.divider} />
                <TouchableOpacity onPress={() => navigation.navigate('ChangePassword')}>
                  <Row
                    icon="🔐"
                    title="Change Password"
                    subtitle="Update your account password"
                    right={<Text style={[styles.dangerArrow, { color: theme.accent }]}>→</Text>}
                  />
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  onPress={async () => {
                    await signOut();
                    navigation.dispatch(
                      CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }),
                    );
                  }}
                >
                  <Row icon="🚪" title="Sign out" subtitle="Back to login screen" right={<Text style={styles.dangerArrow}>→</Text>} />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={() => navigation.navigate('Auth')}>
                <Row
                  icon="🔐"
                  title="Login or Sign up"
                  subtitle="Stats sync across devices when logged in"
                  right={<Text style={[styles.dangerArrow, { color: theme.accent }]}>→</Text>}
                />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.section}>{t('feedback_section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Row
              icon="🔊"
              title={t('sound_setting')}
              subtitle={t('sound_setting_sub')}
              right={
                <Switch
                  value={settings.sound}
                  onValueChange={(v) => setSetting('sound', v)}
                  trackColor={{ false: '#334155', true: theme.accent }}
                  thumbColor="#fff"
                />
              }
            />
            <View style={styles.divider} />
            <Row
              icon="📳"
              title={t('vibration_setting')}
              subtitle={t('vibration_setting_sub')}
              right={
                <Switch
                  value={settings.vibration}
                  onValueChange={(v) => setSetting('vibration', v)}
                  trackColor={{ false: '#334155', true: theme.accent }}
                  thumbColor="#fff"
                />
              }
            />
          </View>

          <Text style={styles.section}>{t('language_section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Row
              icon="🌐"
              title={t('language_setting')}
              subtitle={t('language_setting_sub')}
              right={
                <View style={styles.langToggle}>
                  <TouchableOpacity
                    onPress={() => setSetting('language', 'urdu')}
                    style={[styles.langBtn, settings.language === 'urdu' && { backgroundColor: theme.accent }]}
                  >
                    <Text style={[styles.langText, settings.language === 'urdu' && { color: theme.bg }]}>اU</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSetting('language', 'english')}
                    style={[styles.langBtn, settings.language === 'english' && { backgroundColor: theme.accent }]}
                  >
                    <Text style={[styles.langText, settings.language === 'english' && { color: theme.bg }]}>EN</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>

          <Text style={styles.section}>{t('theme_section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Row
              icon="🎨"
              title={t('theme_setting')}
              subtitle={t('theme_setting_sub')}
            />
            <View style={styles.divider} />
            <View style={styles.themeRow}>
              {Object.values(THEMES).map((thm) => (
                <TouchableOpacity
                  key={thm.id}
                  onPress={() => setSetting('theme', thm.id)}
                  style={[
                    styles.themeChip,
                    { backgroundColor: thm.card, borderColor: thm.accent },
                    settings.theme === thm.id && { borderWidth: 3 },
                  ]}
                >
                  <View style={styles.themeChipRow}>
                    <View style={[styles.themeSwatch, { backgroundColor: thm.accent }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: thm.accent2 }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: thm.gold }]} />
                  </View>
                  <Text style={styles.themeName} numberOfLines={1}>{thm.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.section}>{t('data_section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity onPress={confirmReset}>
              <Row
                icon="🗑"
                title={t('reset_stats')}
                subtitle={t('reset_stats_sub')}
                right={<Text style={styles.dangerArrow}>→</Text>}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>{t('about_section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Row icon="🎮" title="WordQuest" subtitle="v1.7.0 · Powered by Google Gemini" />
            <View style={styles.divider} />
            <Row icon="🏆" title="#AISeekho2026" subtitle="Antigravity Hackathon · Agentic Game Quest" />
            <View style={styles.divider} />
            <Row icon="🤖" title="9 AI Agents" subtitle="Difficulty · Generator · Referee · Reward · Tutor · Commentator · Coach · Chaalbaaz · Quiz" />
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>

      <ConfirmModal
        visible={resetOpen}
        icon="🗑"
        title="Reset All Stats?"
        message="All scores, streaks, badges, level progress, and category mastery will be permanently erased. Daily Challenge and Quiz cooldowns will be preserved. This cannot be undone."
        cancelText="Cancel"
        confirmText="Reset"
        confirmVariant="danger"
        onCancel={() => setResetOpen(false)}
        onConfirm={doReset}
      />
      <ConfirmModal
        visible={resetDoneOpen}
        icon="✅"
        title="Stats Reset"
        message="Your gameplay stats have been wiped. Daily Challenge and Quiz Mode are untouched."
        cancelText="Close"
        confirmText="Got it"
        onCancel={() => setResetDoneOpen(false)}
        onConfirm={() => setResetDoneOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.1 },
  scroll: { padding: 18, gap: 8 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1f2937' },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  section: { color: '#94a3b8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 14, marginBottom: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  rowIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowSub: { color: '#64748b', fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1f2937', marginLeft: 56 },

  langToggle: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 10, padding: 2 },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  langText: { color: '#94a3b8', fontWeight: '900', fontSize: 12 },

  themeRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 8, padding: 12 },
  themeChip: {
    width: '48%',
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'column',
    gap: 6,
  },
  themeChipRow: { flexDirection: 'row', gap: 4 },
  themeSwatch: { width: 14, height: 14, borderRadius: 4 },
  themeName: {
    color: '#fff', fontSize: 11, fontWeight: '700',
    textAlign: 'center', flexShrink: 1,
  },

  dangerArrow: { color: '#ef4444', fontSize: 22, fontWeight: 'bold' },
});
