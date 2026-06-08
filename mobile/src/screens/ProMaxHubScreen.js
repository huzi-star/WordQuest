import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlan } from '../utils/plan';
import { useSettings } from '../utils/settings';

const BG = require('../../home_design/home_bg.jpeg');

const FEATURES = [
  { key: 'ParentDashboard', emoji: '📊', name: 'Parent Dashboard',  sub: 'Weekly progress + activity chart',  color: '#3b82f6' },
  { key: 'Tutor',           emoji: '🤖', name: 'AI Tutor',           sub: '1-on-1 chat — ask anything',          color: '#a855f7' },
  { key: 'Avatar',          emoji: '🎨', name: 'Custom Avatar',      sub: 'Emoji + color + nameplate border',    color: '#f97316' },
  { key: 'OfflineMode',     emoji: '📴', name: 'Offline Mode',       sub: 'Play without internet',               color: '#06b6d4' },
];

export default function ProMaxHubScreen({ navigation }) {
  const { plan, refresh } = usePlan();
  const { settings, setSetting } = useSettings();
  const isProMax = plan === 'pro_max';

  function tap(key) {
    if (!isProMax) {
      navigation.navigate('Paywall', { reason: 'This is a Pro Max exclusive feature.' });
      return;
    }
    if (key === 'OfflineMode') {
      setSetting('offlineMode', !settings.offlineMode);
      return;
    }
    navigation.navigate(key);
  }

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>👑 Pro Max</Text>
          <Text style={styles.subtitle}>{isProMax ? 'All premium features unlocked' : 'Upgrade to unlock'}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {FEATURES.map((f) => {
            const isOffline = f.key === 'OfflineMode';
            const offlineOn = isOffline && settings.offlineMode;
            return (
              <TouchableOpacity
                key={f.key}
                activeOpacity={0.9}
                onPress={() => tap(f.key)}
                style={[styles.row, { borderLeftColor: f.color }]}
              >
                <Text style={styles.emoji}>{f.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{f.name}</Text>
                  <Text style={styles.sub}>{f.sub}</Text>
                </View>
                {isOffline ? (
                  <View style={[styles.toggle, offlineOn && { backgroundColor: '#22c55e' }]}>
                    <Text style={styles.toggleText}>{offlineOn ? 'ON' : 'OFF'}</Text>
                  </View>
                ) : !isProMax ? (
                  <Text style={styles.lock}>🔒</Text>
                ) : (
                  <Text style={styles.arrow}>›</Text>
                )}
              </TouchableOpacity>
            );
          })}

          {!isProMax ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Paywall')} style={styles.upgradeBtn}>
              <Text style={styles.upgradeText}>👑 Upgrade to Pro Max</Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#94a3b8', fontWeight: '800' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#a855f7', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },

  scroll: { padding: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(15,23,42,0.88)',
    padding: 14, borderRadius: 14, marginBottom: 10,
    borderLeftWidth: 5,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emoji: { fontSize: 32 },
  name: { color: '#fff', fontSize: 15, fontWeight: '900' },
  sub: { color: '#94a3b8', fontSize: 11, marginTop: 2, fontWeight: '700' },
  arrow: { color: '#94a3b8', fontSize: 20, fontWeight: '900' },
  lock: { fontSize: 20 },
  toggle: {
    backgroundColor: '#1e293b', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: '#334155',
  },
  toggleText: { color: '#fff', fontWeight: '900', fontSize: 11 },

  upgradeBtn: {
    backgroundColor: '#a855f7',
    paddingVertical: 14, borderRadius: 999,
    alignItems: 'center', marginTop: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#581c87',
  },
  upgradeText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
