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

function normalizeNotification(raw: Record<string, unknown>): AppNotification {
  const id = String(raw.id ?? raw._id ?? '');
  return { ...(raw as AppNotification), id };
}

export async function getNotifications(): Promise<NotificationsResult> {
  const res = await apiClient.get('/notifications', { params: { limit: 50 } });
  const rows = (res.data?.data ?? []) as Record<string, unknown>[];
  return {
    notifications: rows
      .map(normalizeNotification)
      .filter((n) => n.status !== 'dismissed'),
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

export async function dismissNotification(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/dismiss`, {});
}

export async function dismissAllNotifications(): Promise<void> {
  await apiClient.delete('/notifications');
}
