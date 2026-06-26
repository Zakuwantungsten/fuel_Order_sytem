import React, { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_URL } from '../config';
import { useAuth } from '../auth/AuthContext';
import { getAccessToken } from '../auth/secureStore';
import { getNotifications } from '../api/notifications';
import { useToast } from '../components/NotificationToast';
import { scheduleLocalNotification } from '../push/registerPush';

/**
 * Maintains a single Socket.io connection while authenticated and refreshes
 * react-query caches in response to live server events:
 *   - `data_changed` (global): collection-scoped cache invalidation
 *   - `notification`  (targeted to this user's rooms): in-app toast + local
 *     system notification (sound/banner/panel) + cache refresh
 *
 * Works in Expo Go (no native module needed for the socket itself). The local
 * notification and sound path is skipped automatically in Expo Go by the
 * scheduleLocalNotification guard.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    if (!user) return;

    let socket: Socket | null = null;
    let cancelled = false;

    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;

      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });

      const refreshNotifications = () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notif-count'] });
      };

      socket.on('data_changed', (payload: { collection?: string }) => {
        switch (payload?.collection) {
          case 'lpo_summaries':
            queryClient.invalidateQueries({ queryKey: ['manager-lpos'] });
            queryClient.invalidateQueries({ queryKey: ['driver-dashboard'] });
            break;
          case 'fuel_records':
          case 'delivery_orders':
            queryClient.invalidateQueries({ queryKey: ['driver-dashboard'] });
            break;
          case 'notifications':
            refreshNotifications();
            break;
          case 'journey_config':
            queryClient.invalidateQueries({ queryKey: ['sm-stations'] });
            break;
        }
      });

      socket.on('notification', async (payload?: { title?: string; message?: string; type?: string }) => {
        // Refresh badge + notification list.
        refreshNotifications();

        // Resolve notification content: use the socket payload if it includes
        // title/message, otherwise fetch the most recent notification from the API.
        let title = payload?.title;
        let message = payload?.message;
        let type = payload?.type;

        if (!title || !message) {
          try {
            const result = await getNotifications();
            const latest = result.notifications?.[0];
            if (latest) {
              title = latest.title;
              message = latest.message;
              type = latest.type;
            }
          } catch {
            // Non-fatal — toast just won't show if we can't get the content.
          }
        }

        if (title && message) {
          // In-app banner toast (works in Expo Go too).
          showToast({ title, message, type });
          // System notification: banner + sound + notification panel entry.
          // No-ops automatically in Expo Go / simulator.
          scheduleLocalNotification(title, message);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [user, queryClient, showToast]);

  return <>{children}</>;
}
