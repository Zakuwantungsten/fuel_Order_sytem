import type { QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

/** Sync the OS app-icon badge (no-op in Expo Go). */
export async function setOsBadgeCount(count: number): Promise<void> {
  try {
    if (isExpoGo) return;
    const Notifications = await import('expo-notifications');
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    /* non-fatal */
  }
}

/** Optimistically zero the in-app bell badge. */
export function clearInAppBadge(queryClient: QueryClient): void {
  queryClient.setQueryData(['notif-count'], 0);
}

/** Clear both in-app and OS badges immediately. */
export function clearNotificationBadge(queryClient: QueryClient): void {
  clearInAppBadge(queryClient);
  void setOsBadgeCount(0);
}

/** Keep in-app and OS badges in sync with a server count. */
export function syncNotificationBadge(queryClient: QueryClient, count: number): void {
  queryClient.setQueryData(['notif-count'], count);
  void setOsBadgeCount(count);
}

/** Fire-and-forget: mark all read on the server after clearing badges locally. */
export async function markAllReadAndClearBadge(
  queryClient: QueryClient,
  markAllRead: () => Promise<void>
): Promise<void> {
  clearNotificationBadge(queryClient);
  try {
    await markAllRead();
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  } catch {
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
  }
}
