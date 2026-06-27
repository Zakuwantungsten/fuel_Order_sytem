import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { getApiErrorMessage } from '../src/api/client';
import { useTheme } from '../src/theme';

type Mode = 'staff' | 'driver';

export default function LoginScreen() {
  const { user, signIn } = useAuth();
  const { colors, spacing, radius, font, weight } = useTheme();
  const [mode, setMode] = useState<Mode>('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    if (user.mustChangePassword) return <Redirect href="/change-password" />;
    return <Redirect href="/(app)/home" />;
  }

  const isDriver = mode === 'driver';

  async function handleSubmit() {
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError('Please enter both fields.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn(username.trim(), password);
      if (result.status === 'mfa_required') {
        setError(result.message ?? 'MFA required — finish setup on the web portal.');
      } else if (result.status === 'password_change_required') {
        router.replace('/change-password');
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Login failed. Check your credentials.'));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setUsername('');
    setPassword('');
    setError(null);
  }

  const inputWrap = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.xs,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.headerBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.logoRing, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Image source={require('../assets/splash-icon.png')} style={styles.logo} />
          </View>
          <Text style={[styles.title, { color: colors.onHeader }]}>limka</Text>
          <Text style={[styles.subtitle, { color: colors.onHeaderMuted }]}>Sign in to continue</Text>
        </View>

        {/* Mode toggle */}
        <View style={[styles.toggle, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <ModeTab label="Staff" icon="people" active={!isDriver} onPress={() => switchMode('staff')} />
          <ModeTab label="Driver" icon="car" active={isDriver} onPress={() => switchMode('driver')} />
        </View>

        <View style={[styles.form, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.text }]}>{isDriver ? 'Truck Number' : 'Username or Email'}</Text>
          <View style={inputWrap}>
            <Ionicons name={isDriver ? 'bus-outline' : 'person-outline'} size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={username}
              onChangeText={setUsername}
              placeholder={isDriver ? 'e.g. T991 EFN' : 'username'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize={isDriver ? 'characters' : 'none'}
              autoCorrect={false}
            />
          </View>

          <Text style={[styles.label, { color: colors.text, marginTop: spacing.md }]}>{isDriver ? 'PIN' : 'Password'}</Text>
          <View style={inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder={isDriver ? 'PIN' : 'password'}
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPw}
              keyboardType={isDriver ? 'number-pad' : 'default'}
              autoCapitalize="none"
            />
            <Ionicons
              name={showPw ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textMuted}
              onPress={() => setShowPw((s) => !s)}
            />
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: submitting || pressed ? 0.75 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{submitting ? 'Signing in…' : 'Sign In'}</Text>
          </Pressable>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {isDriver
              ? 'Drivers sign in with their truck number and PIN.'
              : 'Managers, yard and station staff sign in with their account.'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  function ModeTab({ label, icon, active, onPress }: { label: string; icon: any; active: boolean; onPress: () => void }) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.tab,
          { backgroundColor: active ? colors.primary : 'transparent', opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={onPress}
      >
        <Ionicons name={icon} size={16} color={active ? colors.onPrimary : colors.onHeaderMuted} />
        <Text style={{ color: active ? colors.onPrimary : colors.onHeaderMuted, fontWeight: weight.semibold, marginLeft: 6 }}>
          {label}
        </Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoRing: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logo: { width: 60, height: 60 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: 4 },
  toggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 24 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 999 },
  form: { borderRadius: 18, padding: 24 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  input: { flex: 1, marginLeft: 8, paddingVertical: 12, fontSize: 15 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  buttonText: { fontWeight: '700', fontSize: 17 },
  error: { marginTop: 14, fontSize: 13 },
  hint: { fontSize: 13, marginTop: 16, textAlign: 'center' },
});
