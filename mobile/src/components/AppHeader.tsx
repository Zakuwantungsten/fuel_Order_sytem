import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { roleLabel } from '../auth/roles';
import { getNotificationCount } from '../api/notifications';
import ChangePasswordModal from './ChangePasswordModal';

/**
 * Branded top bar shared across role dashboards. The bar uses a constant dark
 * navy in both themes (brand consistency); the menu sheet is themed.
 */
export function AppHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  const { colors, spacing, font, weight, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const { data: unread = 0 } = useQuery({
    queryKey: ['notif-count'],
    queryFn: getNotificationCount,
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Driver accounts are virtual users; /auth/change-password only works for staff.
  const canChangePassword = !!user && user.role !== 'driver';

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    router.replace('/login');
  }

  // Driver accounts have an encrypted `username`, so never surface it. Prefer a
  // real name, then the truck number, before any generic fallback.
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  const isDriver = user?.role === 'driver';
  const displayName =
    fullName || user?.truckNo || (isDriver ? 'Driver' : user?.username) || 'User';

  return (
    <>
      <View style={[styles.bar, { backgroundColor: colors.headerBg, paddingTop: insets.top + 8 }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.onHeader }]} numberOfLines={1}>
              {title}
            </Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.badgeText, { color: colors.onPrimary }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.onHeaderMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/(app)/notifications')}
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.onHeader} />
            {unread > 0 ? (
              <View style={[styles.notifBadge, { backgroundColor: colors.danger, borderColor: colors.headerBg }]}>
                <Text style={styles.badgeCount}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
            hitSlop={8}
            style={({ pressed }) => [styles.avatarBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="person-circle-outline" size={34} color={colors.onHeader} />
          </Pressable>
        </View>
      </View>

      {/* Profile menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[
              styles.menu,
              { backgroundColor: colors.surface, borderColor: colors.border, top: insets.top + 56 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.menuHeader, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.textMuted, fontSize: font.tiny }}>Signed in as</Text>
              <Text style={{ color: colors.text, fontSize: font.body, fontWeight: weight.semibold }} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.tiny }}>{roleLabel(user?.role)}</Text>
            </View>

            <MenuItem
              icon={isDark ? 'sunny-outline' : 'moon-outline'}
              label={isDark ? 'Light mode' : 'Dark mode'}
              onPress={toggleTheme}
              keepOpen
            />

            {canChangePassword ? (
              <MenuItem
                icon="key-outline"
                label="Change password"
                onPress={() => {
                  setMenuOpen(false);
                  setPwOpen(true);
                }}
              />
            ) : null}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <MenuItem icon="log-out-outline" label="Sign out" onPress={handleSignOut} danger />
          </Pressable>
        </Pressable>
      </Modal>

      <ChangePasswordModal visible={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
  keepOpen,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  keepOpen?: boolean;
}) {
  const { colors, spacing, font, weight } = useTheme();
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { paddingVertical: spacing.sm + 2, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={{ color: tint, fontSize: font.body, fontWeight: weight.medium, marginLeft: spacing.sm }}>{label}</Text>
      {keepOpen ? <View style={{ flex: 1 }} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCount: { color: '#fff', fontSize: 10, fontWeight: '800' },
  avatarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1 },
  menu: {
    position: 'absolute',
    right: 12,
    width: 230,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});

export default AppHeader;
