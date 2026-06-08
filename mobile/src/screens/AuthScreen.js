import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image, Animated, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../utils/settings';
import { signUp, signIn, getCurrentUser, fetchStats } from '../utils/supabase';
import { trace } from '../utils/trace';
import { CommonActions } from '@react-navigation/native';
import AppLogo from '../components/AppLogo';
import { rfs } from '../utils/responsive';

const BG = require('../../home_design/home_bg.jpeg');
const APP_LOGO = require('../../app-logo.jpeg');

export default function AuthScreen({ navigation, route }) {
  const { settings, update: updateSettings } = useSettings();
  const [mode, setMode] = useState(route?.params?.initialMode === 'signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function computeAge(y, m, d) {
    const today = new Date();
    let age = today.getFullYear() - y;
    const mDiff = (today.getMonth() + 1) - m;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age -= 1;
    return age;
  }
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
    let signupAge = null;
    let signupDob = null;
    if (mode === 'signup') {
      const d = parseInt(dobDay, 10);
      const m = parseInt(dobMonth, 10);
      const y = parseInt(dobYear, 10);
      if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear()) {
        Alert.alert('Date of birth required', 'Please enter a valid day, month and year.');
        return;
      }
      signupAge = computeAge(y, m, d);
      if (signupAge < 0 || signupAge > 120) {
        Alert.alert('Invalid date', 'Please re-check your date of birth.');
        return;
      }
      signupDob = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    setBusy(true);
    let res;
    if (mode === 'signup') {
      res = await signUp({ email: email.trim(), password, displayName: displayName.trim() || email.split('@')[0] });
      if (!res?.error) {
        const signInRes = await signIn({ email: email.trim(), password });
        if (signInRes?.error) {
          setBusy(false);
          Alert.alert('Account created', 'Inbox check karo — verification link click karne ke baad login karo.');
          setMode('login');
          return;
        }
      }
    } else {
      res = await signIn({ email: email.trim(), password });
    }
    setBusy(false);
    if (res?.error) {
      trace('auth', `${mode} failed`, { email, error: res.error }, { status: 'error' });
      Alert.alert(mode === 'signup' ? 'Sign-up failed' : 'Login failed', res.error);
      return;
    }
    trace('auth', mode === 'signup' ? 'sign-up' : 'sign-in', { email }, { userId: res?.user?.id });
    // eslint-disable-next-line global-require
    const { loadStats } = require('../utils/storage');
    await new Promise((r) => setTimeout(r, 250));
    const stats = await loadStats();

    if (mode === 'signup' && signupDob) {
      try { await updateSettings({ dob: signupDob }); } catch (_) {}
    }
    let effectiveDob = signupDob || settings.dob;
    if (!effectiveDob) {
      try {
        const u = await getCurrentUser();
        if (u?.id) {
          const remote = await fetchStats(u.id);
          if (remote?.preferences?.dob) effectiveDob = remote.preferences.dob;
        }
      } catch (_) {}
    }
    if (effectiveDob) {
      const [y, m, d] = effectiveDob.split('-').map((v) => parseInt(v, 10));
      const age = computeAge(y, m, d);
      if (age > 13) {
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AgeBlocked' }] }));
        return;
      }
    }

    const next = stats?.hasSeenOnboarding ? 'Home' : 'Onboarding';
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: next }] }));
  }

  const isSignup = mode === 'signup';

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tealTint} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
          >
            {/* HERO: logo + wooden plaque + title */}
            <Animated.View style={[styles.heroWrap, { opacity: fadeIn, transform: [{ scale: logoScale }] }]}>
              <AppLogo size={120} />
              <View style={styles.titlePlate}>
                <Text style={styles.titlePlateText}>WordQuest</Text>
                <Text style={styles.titlePlateSub}>BUILD YOUR MIND</Text>
              </View>
              <Text style={styles.brand} numberOfLines={1} adjustsFontSizeToFit>WordQuest</Text>
              <View style={styles.tagPill}>
                <Text style={styles.tag}>{isSignup ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</Text>
              </View>
            </Animated.View>

            {/* Login / Sign up toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                onPress={() => setMode('login')}
                activeOpacity={0.85}
                style={[styles.modeBtn, !isSignup && styles.modeBtnActive]}
              >
                <Text style={[styles.modeText, !isSignup && styles.modeTextActive]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode('signup')}
                activeOpacity={0.85}
                style={[styles.modeBtn, isSignup && styles.modeBtnActive]}
              >
                <Text style={[styles.modeText, isSignup && styles.modeTextActive]}>Sign up</Text>
              </TouchableOpacity>
            </View>

            {/* Form card */}
            <View style={styles.formCard}>
              {isSignup ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Display name</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="e.g. Babar"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>
              ) : null}
              {isSignup ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Date of birth</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={dobDay} onChangeText={setDobDay}
                      placeholder="DD" placeholderTextColor="rgba(255,255,255,0.45)"
                      keyboardType="number-pad" maxLength={2}
                      style={[styles.input, { flex: 1, textAlign: 'center' }]}
                    />
                    <TextInput
                      value={dobMonth} onChangeText={setDobMonth}
                      placeholder="MM" placeholderTextColor="rgba(255,255,255,0.45)"
                      keyboardType="number-pad" maxLength={2}
                      style={[styles.input, { flex: 1, textAlign: 'center' }]}
                    />
                    <TextInput
                      value={dobYear} onChangeText={setDobYear}
                      placeholder="YYYY" placeholderTextColor="rgba(255,255,255,0.45)"
                      keyboardType="number-pad" maxLength={4}
                      style={[styles.input, { flex: 1.3, textAlign: 'center' }]}
                    />
                  </View>
                  <Text style={styles.hint}>For ages 13 and under only.</Text>
                </View>
              ) : null}
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Min 6 characters"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={[styles.input, styles.passwordInput]}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.9} onPress={submit} disabled={busy} style={styles.submit}>
                {busy ? (
                  <ActivityIndicator color="#14532d" />
                ) : (
                  <Text style={styles.submitText}>{isSignup ? 'Create account' : 'Login'}</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.legal}>
              Stats sync across devices when logged in. Your password is encrypted by Supabase.
            </Text>
            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,80,80,0.55)' },
  scroll: { padding: 16, gap: 14 },

  heroWrap: { alignItems: 'center', marginTop: 10 },
  logoRing: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 5, borderColor: '#a16207',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  logoInner: {
    width: 116, height: 116, borderRadius: 58,
    overflow: 'hidden',
    borderWidth: 4, borderColor: '#facc15',
  },
  logoImg: { width: '100%', height: '100%' },

  titlePlate: {
    marginTop: -14,
    backgroundColor: '#92400e',
    paddingHorizontal: 22, paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 3, borderColor: '#fbbf24',
    borderBottomWidth: 6, borderBottomColor: '#451a03',
    alignItems: 'center',
  },
  titlePlateText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  titlePlateSub: { color: '#fde68a', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginTop: -2 },

  brand: {
    color: '#bfdbfe', fontSize: rfs(36), fontWeight: '900', marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
    maxWidth: '92%', textAlign: 'center',
  },
  tagPill: {
    marginTop: 6,
    backgroundColor: '#78350f',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 2, borderColor: '#fbbf24',
  },
  tag: { color: '#fef3c7', fontSize: 10, fontWeight: '900', letterSpacing: 2 },

  // Login / Sign up toggle pill
  modeToggle: {
    flexDirection: 'row', padding: 4,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 999,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },
  modeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 999 },
  modeBtnActive: {
    backgroundColor: '#22c55e',
    borderWidth: 2, borderColor: '#fff',
    borderBottomWidth: 4, borderBottomColor: '#14532d',
  },
  modeText: { color: '#cbd5e1', fontWeight: '900', fontSize: 15 },
  modeTextActive: { color: '#fff' },

  // Form card
  formCard: {
    backgroundColor: 'rgba(30,58,95,0.78)',
    borderRadius: 22, padding: 16, gap: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },
  field: { gap: 6 },
  label: { color: '#fff', fontSize: 13, fontWeight: '900' },
  input: {
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14,
    color: '#fff', fontSize: 14, fontWeight: '600',
  },
  hint: { color: '#cbd5e1', fontSize: 11, fontWeight: '700', marginTop: 6 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  eyeBtn: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  eyeIcon: { fontSize: 20 },

  submit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, borderRadius: 999,
    backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 8, borderBottomColor: '#14532d',
    marginTop: 4,
  },
  submitText: {
    color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  submitArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#14532d',
  },
  submitArrowText: { color: '#15803d', fontWeight: '900', fontSize: 16, marginLeft: 1 },

  legal: { color: '#e2e8f0', fontSize: 11, textAlign: 'center', marginTop: 8, lineHeight: 16, fontWeight: '600' },
});
