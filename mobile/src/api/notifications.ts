import { apiClient } from './client';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedModel?: string;
  relatedId?: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'resolved' | 'dismissed';
  isRead?: boolean;
  readBy?: string[];
  createdAt: string;
}

export interface NotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
}

export async function getNotifications(): Promise<NotificationsResult> {
  const res = await apiClient.get('/notifications', { params: { limit: 50 } });
  return {
    notifications: (res.data?.data ?? []) as AppNotification[],
    unreadCount: res.data?.unreadCount ?? 0,
  };
}

export async function getNotificationCount(): Promise<number> {
  const res = await apiClient.get('/notifications/count');
  return res.data?.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`, {});
}

/** Mark every notification read (resets the badge) without hiding them. */
export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.patch('/notifications/read-all', {});
}

export async function dismissAllNotifications(): Promise<void> {
  await apiClient.delete('/notifications');
}
