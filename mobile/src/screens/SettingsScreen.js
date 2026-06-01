import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import { useSettings } from '../utils/settings';
import { useTheme } from '../utils/theme';
import { resetStats } from '../utils/storage';
import { useAuth } from '../utils/auth';
import { signOut, deleteUserStats } from '../utils/supabase';
import { trace } from '../utils/trace';
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
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.titlePlate}>
              <Text style={styles.titlePlateBig}>⚙ {t('settings_title')}</Text>
              <Text style={styles.titlePlateSub}>{(t('settings_sub') || '').toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.section}>ACCOUNT</Text>
          <View style={styles.card}>
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
                <TouchableOpacity onPress={() => navigation.navigate('Subscription')}>
                  <Row
                    icon="💎"
                    title="Subscription"
                    subtitle="Manage your plan & view usage"
                    right={<Text style={[styles.dangerArrow, { color: theme.accent }]}>→</Text>}
                  />
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity onPress={() => navigation.navigate('ProMaxHub')}>
                  <Row
                    icon="👑"
                    title="Pro Max Features"
                    subtitle="Tutor · Parent Dashboard · Avatar"
                    right={<Text style={[styles.dangerArrow, { color: theme.accent }]}>→</Text>}
                  />
                </TouchableOpacity>
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
                    trace('auth', 'sign-out', {}, { userId: user?.id });
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
          <View style={styles.card}>
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

          {/* Language toggle removed — app is English-only for international audience.
              Word meanings can still be translated on demand inside the WordDetailCard. */}

          <Text style={styles.section}>{t('about_section')}</Text>
          <View style={styles.card}>
            <Row icon="🎮" title="WordQuest" subtitle="v1.7.0 · Powered by Google Gemini" />
            <View style={styles.divider} />
            <Row icon="🏆" title="#AISeekho2026" subtitle="Antigravity Hackathon · Agentic Game Quest" />
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.1 },
  scroll: { padding: 18, gap: 8 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: '#1e3a8a',
  },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
  titlePlate: {
    flex: 1,
    backgroundColor: '#92400e',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 7, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  titlePlateBig: { color: '#fff', fontSize: 18, fontWeight: '900' },
  titlePlateSub: { color: '#fde68a', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginTop: -2 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  section: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginBottom: 6, marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  card: {
    borderRadius: 18, overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  rowIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rowSub: { color: '#cbd5e1', fontSize: 11, marginTop: 2, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginLeft: 56 },

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
