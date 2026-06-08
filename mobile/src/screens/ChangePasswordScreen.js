import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/theme';
import { useAuth } from '../utils/auth';
import { changePassword } from '../utils/supabase';
import ConfirmModal from '../components/ConfirmModal';

function PasswordField({ label, value, onChange, placeholder, theme }) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#475569"
          style={[styles.input, styles.passwordInput, { borderColor: theme.border }]}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={() => setShow((v) => !v)}
          style={[styles.eyeBtn, { borderColor: theme.border }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.eyeIcon, { color: theme.accent }]}>
            {show ? '🙈' : '👁'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ChangePasswordScreen({ navigation }) {
  const theme = useTheme();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);

  async function submit() {
    setError('');
    if (!user?.email) {
      setError('You must be signed in to change your password.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All three fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password cannot be the same as the current one.');
      return;
    }
    setBusy(true);
    const res = await changePassword({
      email: user.email,
      currentPassword,
      newPassword,
    });
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setSuccessOpen(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.blob, { backgroundColor: theme.accent, top: -100, right: -80 }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <TouchableOpacity style={[styles.back, { borderColor: theme.border }]} onPress={() => navigation.goBack()}>
                <Text style={styles.backIcon}>←</Text>
              </TouchableOpacity>
              <View>
                <Text style={styles.title}>🔐 Change Password</Text>
                <Text style={styles.subtitle}>{user?.email}</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={styles.intro}>
                Enter your current password and choose a new one. The new password must be at least 6 characters.
              </Text>

              <PasswordField
                label="CURRENT PASSWORD"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Your current password"
                theme={theme}
              />
              <PasswordField
                label="NEW PASSWORD"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Min 6 characters"
                theme={theme}
              />
              <PasswordField
                label="CONFIRM NEW PASSWORD"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Re-enter new password"
                theme={theme}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                onPress={submit}
                disabled={busy}
                style={[styles.submit, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color={theme.bg} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.bg }]}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={[styles.tipBox, { borderColor: theme.border, backgroundColor: 'rgba(148,163,184,0.08)' }]}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.tipText}>
                For security, you'll stay signed in on this device but other devices may need a fresh login.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ConfirmModal
        visible={successOpen}
        icon="✅"
        title="Password Updated"
        message="Your password has been changed successfully."
        cancelText="Close"
        confirmText="Done"
        onCancel={() => { setSuccessOpen(false); navigation.goBack(); }}
        onConfirm={() => { setSuccessOpen(false); navigation.goBack(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.1 },
  scroll: { padding: 18, gap: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(148,163,184,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backIcon: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 12 },

  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  intro: { color: '#cbd5e1', fontSize: 13, lineHeight: 19 },

  field: { gap: 6 },
  label: { color: '#94a3b8', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  input: {
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#fff', fontSize: 14,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  eyeBtn: {
    width: 46, height: 46, borderRadius: 12, borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  eyeIcon: { fontSize: 20 },

  errorText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },

  submit: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },

  tipBox: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 12, gap: 10, alignItems: 'center' },
  tipIcon: { fontSize: 18 },
  tipText: { color: '#cbd5e1', fontSize: 12, flex: 1, lineHeight: 17 },
});
