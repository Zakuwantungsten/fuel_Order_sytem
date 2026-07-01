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
  dismissNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../src/api/notifications';
import { Card, EmptyState, Loading } from '../../src/components/ui';
import { SwipeableRow } from '../../src/components/SwipeableRow';
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

function isNavigable(item: AppNotification): boolean {
  const lpoTypes = new Set(['lpo_created', 'lpo_amended', 'lpo_cancelled']);
  return lpoTypes.has(item.type) && item.metadata?.lpoNo != null;
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

  const dismissOne = useMutation({
    mutationFn: dismissNotification,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<NotificationsResult>(['notifications']);
      if (prev) {
        queryClient.setQueryData<NotificationsResult>(['notifications'], {
          ...prev,
          notifications: prev.notifications.filter((n) => n.id !== id),
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const clearAll = useMutation({
    mutationFn: dismissAllNotifications,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<NotificationsResult>(['notifications']);
      queryClient.setQueryData<NotificationsResult>(['notifications'], {
        notifications: [],
        unreadCount: 0,
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const items = query.data?.notifications ?? [];
  const isUnread = (n: AppNotification) =>
    n.status === 'pending' && !(user?._id && n.readBy?.includes(user._id));

  function handleItemPress(item: AppNotification) {
    if (!item.id) return;
    if (isUnread(item)) markRead.mutate(item.id);
    navigateFromNotification(router, item);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" style={styles.hbtn}>
          <Ionicons name="arrow-back" size={24} color={colors.onHeader} />
        </Pressable>
        <Text style={[styles.htitle, { color: colors.onHeader }]}>Notifications</Text>
        {items.length > 0 ? (
          <Pressable
            onPress={() => clearAll.mutate()}
            disabled={clearAll.isPending}
            hitSlop={8}
            accessibilityLabel="Clear all notifications"
            style={[styles.clearBtn, { opacity: clearAll.isPending ? 0.6 : 1 }]}
          >
            <Text style={{ color: colors.onHeader, fontSize: font.small, fontWeight: weight.semibold }}>
              Clear all
            </Text>
          </Pressable>
        ) : (
          <View style={styles.hbtn} />
        )}
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
          ListHeaderComponent={
            items.length > 0 ? (
              <Text
                style={{
                  fontSize: font.tiny,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginBottom: spacing.xs,
                }}
              >
                Swipe left or right to dismiss
              </Text>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          ListEmptyComponent={
            <Card>
              <EmptyState icon="notifications-off-outline" title="No notifications" subtitle="You're all caught up." />
            </Card>
          }
          renderItem={({ item }) => {
            const meta = iconFor(item.type);
            const unread = isUnread(item);
            const navigable = isNavigable(item);
            return (
              <SwipeableRow
                actionColor={colors.danger}
                onDismiss={() => item.id && dismissOne.mutate(item.id)}
              >
                <Pressable
                  onPress={() => handleItemPress(item)}
                  disabled={!navigable && !unread}
                >
                  <Card
                    accent={unread ? colors[meta.tone] : colors.border}
                    style={{ backgroundColor: unread ? colors.primaryMuted : colors.surface, paddingVertical: spacing.sm }}
                  >
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Ionicons name={meta.icon} size={22} color={colors[meta.tone]} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleRow}>
                          <Text style={{ flex: 1, fontSize: font.body, fontWeight: weight.bold, color: colors.text }}>
                            {item.title}
                          </Text>
                          {unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                        </View>
                        <Text style={{ fontSize: font.small, color: colors.textMuted, marginTop: 2 }}>{item.message}</Text>
                        <View style={styles.footerRow}>
                          <Text style={{ flex: 1, fontSize: font.tiny, color: colors.textMuted, marginRight: spacing.sm }}>
                            {new Date(item.createdAt).toLocaleString()}
                          </Text>
                          {navigable ? (
                            <Text style={{ fontSize: font.tiny, color: colors.primary, fontWeight: weight.semibold }}>
                              Tap to view LPO
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              </SwipeableRow>
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
  clearBtn: { paddingHorizontal: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  htitle: { flex: 1, fontSize: 20, fontWeight: '800', marginLeft: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
