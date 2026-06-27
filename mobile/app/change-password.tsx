import React, { useState } from 'react';
import {
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
import { useTheme } from '../src/theme';
import * as authApi from '../src/api/auth';
import { getApiErrorMessage } from '../src/api/client';
import { saveTokens } from '../src/auth/secureStore';
import { registerForPush } from '../src/push/registerPush';

export default function ChangePasswordScreen() {
  const { user, updateUser } = useAuth();
  const { colors, spacing, radius, font, weight } = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Redirect href="/login" />;
  if (!user.mustChangePassword) return <Redirect href="/(app)/home" />;

  async function handleSubmit() {
    setError(null);
    if (!newPassword) return setError('Please enter a new password.');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('Passwords do not match.');

    setSubmitting(true);
    try {
      const result = await authApi.firstLoginPassword(newPassword);
      await saveTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? null,
      });
      // Fetch the fresh profile from /auth/me (exempt from response sanitizer)
      // so mustChangePassword reflects the real updated value.
      const freshUser = await authApi.getMe();
      await updateUser(freshUser);
      registerForPush();
      router.replace('/(app)/home');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not set password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.headerBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconRing, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Ionicons name="lock-open-outline" size={36} color={colors.onHeader} />
          </View>
          <Text style={[styles.title, { color: colors.onHeader }]}>Set your password</Text>
          <Text style={[styles.subtitle, { color: colors.onHeaderMuted }]}>
            Your account was given a temporary password. Please set a permanent one before continuing.
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.form, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.text }]}>New password</Text>
          <View style={inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Ionicons
              name={showPw ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textMuted}
              onPress={() => setShowPw((s) => !s)}
            />
          </View>

          <Text style={[styles.label, { color: colors.text, marginTop: spacing.md }]}>
            Confirm new password
          </Text>
          <View style={inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Ionicons
              name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textMuted}
              onPress={() => setShowConfirm((s) => !s)}
            />
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: submitting || pressed ? 0.75 : 1 },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {submitting ? 'Setting password…' : 'Set password & continue'}
            </Text>
          </Pressable>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            You cannot skip this step. Your temporary password will expire and lock your account if
            not changed.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  form: { borderRadius: 18, padding: 24 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  input: { flex: 1, marginLeft: 8, paddingVertical: 12, fontSize: 15 },
  error: { marginTop: 14, fontSize: 13 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  buttonText: { fontWeight: '700', fontSize: 17 },
  hint: { fontSize: 12, marginTop: 16, textAlign: 'center', lineHeight: 18 },
});
