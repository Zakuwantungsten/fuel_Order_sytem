import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme';
import { apiClient, getApiErrorMessage } from '../api/client';

export default function ChangePasswordModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, spacing, radius, font, weight } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setDone(false);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    setError(null);
    if (!current || !next) return setError('Fill in all fields.');
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setDone(true);
      setTimeout(close, 1200);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not change password.'));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: font.body,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: colors.scrim }]}
      >
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontSize: font.h2, fontWeight: weight.bold }}>Change password</Text>

          {done ? (
            <Text style={{ color: colors.success, marginTop: spacing.md, fontSize: font.body }}>
              ✓ Password changed successfully.
            </Text>
          ) : (
            <>
              <TextInput
                style={inputStyle}
                placeholder="Current password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={current}
                onChangeText={setCurrent}
                autoCapitalize="none"
              />
              <TextInput
                style={inputStyle}
                placeholder="New password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={next}
                onChangeText={setNext}
                autoCapitalize="none"
              />
              <TextInput
                style={inputStyle}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
                autoCapitalize="none"
              />

              {error ? (
                <Text style={{ color: colors.danger, marginTop: spacing.sm, fontSize: font.small }}>{error}</Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                <Pressable
                  onPress={close}
                  style={({ pressed }) => [styles.btn, { borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.text, fontWeight: weight.semibold }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={busy}
                  style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: busy || pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.onPrimary, fontWeight: weight.bold }}>{busy ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
});
