import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppNotification,
  NotificationsResult,
  dismissAllNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../src/api/notifications';
import { Card, EmptyState, Loading } from '../../src/components/ui';
import { navigateFromNotification } from '../../src/navigation/notificationRouting';
import { markAllReadAndClearBadge } from '../../src/notifications/badge';
import { useTheme } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function iconFor(type: string): { icon: IoniconName; tone: 'primary' | 'danger' | 'warning' | 'info' | 'success' } {
  if (type === 'lpo_cancelled') return { icon: 'close-circle', tone: 'danger' };
  if (type === 'lpo_amended') return { icon: 'create', tone: 'warning' };
  if (type === 'lpo_created') return { icon: 'receipt', tone: 'primary' };
  if (type === 'yard_fuel_recorded') return { icon: 'water', tone: 'info' };
  if (type === 'error') return { icon: 'alert-circle', tone: 'danger' };
  if (type === 'warning') return { icon: 'warning', tone: 'warning' };
  return { icon: 'notifications', tone: 'primary' };
}

export default function NotificationsScreen() {
  const { colors, spacing, font, weight } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery<NotificationsResult>({
    queryKey: ['notifications'],
    queryFn: getNotifications,
  });

  // Opening the panel clears badges instantly, then syncs read state with the server.
  React.useEffect(() => {
    void markAllReadAndClearBadge(queryClient, markAllNotificationsRead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const items = query.data?.notifications ?? [];
  const isUnread = (n: AppNotification) =>
    n.status === 'pending' && !(user?._id && n.readBy?.includes(user._id));

  function handleItemPress(item: AppNotification) {
    if (isUnread(item)) markRead.mutate(item.id);
    if (navigateFromNotification(router, item)) return;
  }

  const clearAll = useMutation({
    mutationFn: dismissAllNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" style={styles.hbtn}>
          <Ionicons name="arrow-back" size={24} color={colors.onHeader} />
        </Pressable>
        <Text style={[styles.htitle, { color: colors.onHeader }]}>Notifications</Text>
        <Pressable onPress={() => clearAll.mutate()} hitSlop={8} accessibilityLabel="Clear all" style={styles.hbtn}>
          <Ionicons name="checkmark-done" size={22} color={colors.onHeader} />
        </Pressable>
      </View>

      {query.isLoading ? (
        <Loading label="Loading notifications…" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.md }}
          onRefresh={query.refetch}
          refreshing={query.isRefetching}
          ListEmptyComponent={
            <Card>
              <EmptyState icon="notifications-off-outline" title="No notifications" subtitle="You're all caught up." />
            </Card>
          }
          renderItem={({ item }) => {
            const meta = iconFor(item.type);
            const unread = isUnread(item);
            return (
              <Pressable onPress={() => handleItemPress(item)}>
                <Card
                  accent={unread ? colors[meta.tone] : colors.border}
                  style={{ marginBottom: spacing.sm, backgroundColor: unread ? colors.primaryMuted : colors.surface }}
                >
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Ionicons name={meta.icon} size={22} color={colors[meta.tone]} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text style={{ flex: 1, fontSize: font.body, fontWeight: weight.bold, color: colors.text }}>{item.title}</Text>
                        {unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                      </View>
                      <Text style={{ fontSize: font.small, color: colors.textMuted, marginTop: 2 }}>{item.message}</Text>
                      <Text style={{ fontSize: font.tiny, color: colors.textMuted, marginTop: 4 }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 12 },
  hbtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  htitle: { flex: 1, fontSize: 20, fontWeight: '800', marginLeft: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
