import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/theme';
import { useSettings } from '../utils/settings';
import { signUp, signIn } from '../utils/supabase';
import { CommonActions } from '@react-navigation/native';

export default function AuthScreen({ navigation }) {
  const theme = useTheme();
  const { t, settings } = useSettings();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const logoScale = React.useRef(new Animated.Value(0.7)).current;
  const fadeIn = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  async function submit() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Both email and password are required.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    let res;
    if (mode === 'signup') {
      res = await signUp({ email: email.trim(), password, displayName: displayName.trim() || email.split('@')[0] });
      // If email confirmation is OFF in Supabase, signUp creates the session
      // immediately. If it's ON, signIn below will fail and we tell the user.
      if (!res?.error) {
        const signInRes = await signIn({ email: email.trim(), password });
        if (signInRes?.error) {
          setBusy(false);
          Alert.alert(
            'Account created',
            'Inbox check karo — verification link click karne ke baad login karo.',
          );
          setMode('login');
          return;
        }
      }
    } else {
      res = await signIn({ email: email.trim(), password });
    }
    setBusy(false);
    if (res?.error) {
      Alert.alert(mode === 'signup' ? 'Sign-up failed' : 'Login failed', res.error);
      return;
    }
    // Decide next stop: onboarding if first time on this device, else Home.
    const next = settings.hasSeenOnboarding ? 'Home' : 'Onboarding';
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: next }] }),
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -120, right: -100 }]} />
      <View style={[styles.blob, { backgroundColor: theme.accent2, bottom: -140, left: -100, opacity: 0.13 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll}>
            <Animated.View style={[styles.heroWrap, { opacity: fadeIn, transform: [{ scale: logoScale }] }]}>
              <View style={[styles.logoCircle, { borderColor: theme.accent, shadowColor: theme.accent }]}>
                <Image source={require('../../app-logo.jpeg')} style={styles.logoImg} />
              </View>
              <Text style={styles.brand}>WordQuest</Text>
              <View style={[styles.tagPill, { borderColor: theme.accent, backgroundColor: `${theme.accent}1a` }]}>
                <Text style={[styles.tag, { color: theme.accent }]}>
                  {mode === 'login' ? 'WELCOME BACK' : 'CREATE YOUR ACCOUNT'}
                </Text>
              </View>
            </Animated.View>

            <View style={[styles.modeToggle, { borderColor: theme.border }]}>
              <TouchableOpacity
                onPress={() => setMode('login')}
                style={[styles.modeBtn, mode === 'login' && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.modeText, mode === 'login' && { color: theme.bg }]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode('signup')}
                style={[styles.modeBtn, mode === 'signup' && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.modeText, mode === 'signup' && { color: theme.bg }]}>Sign up</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {mode === 'signup' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Display name</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="e.g. Babar"
                    placeholderTextColor="#475569"
                    style={[styles.input, { borderColor: theme.border }]}
                    autoCapitalize="words"
                  />
                </View>
              ) : null}
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#475569"
                  style={[styles.input, { borderColor: theme.border }]}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min 6 characters"
                  placeholderTextColor="#475569"
                  style={[styles.input, { borderColor: theme.border }]}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.submit, { backgroundColor: theme.accent }]}
                onPress={submit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={theme.bg} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.bg }]}>
                    {mode === 'signup' ? 'Create account' : 'Login'} →
                  </Text>
                )}
              </TouchableOpacity>

              {/* Guest mode removed — every player creates an account so their
                  progress lives in the cloud. */}
            </View>

            <Text style={styles.legal}>
              Stats sync across devices when logged in. Your password is encrypted by Supabase.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.15 },
  scroll: { padding: 20, gap: 18 },

  heroWrap: { alignItems: 'center', marginTop: 24 },
  logoCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
    elevation: 12, overflow: 'hidden',
  },
  logoImg: { width: 108, height: 108, borderRadius: 54 },
  brand: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 12, letterSpacing: 0.5 },
  tagPill: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  tag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },

  modeToggle: { flexDirection: 'row', padding: 4, borderRadius: 14, borderWidth: 1 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  modeText: { color: '#cbd5e1', fontWeight: '800' },

  formCard: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 12 },
  field: { gap: 6 },
  label: { color: '#94a3b8', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  input: {
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#fff', fontSize: 14,
  },

  submit: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  submitText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  guestText: { color: '#64748b', fontSize: 12 },
  legal: { color: '#475569', fontSize: 11, textAlign: 'center', paddingHorizontal: 20 },
});
