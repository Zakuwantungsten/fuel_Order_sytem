import React, { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_URL } from '../config';
import { useAuth } from '../auth/AuthContext';
import { getAccessToken } from '../auth/secureStore';

/**
 * Maintains a single Socket.io connection while authenticated and refreshes
 * react-query caches in response to live server events:
 *   - `data_changed` (global): collection-scoped cache invalidation
 *   - `notification`  (targeted to this user's rooms): refresh notifications
 *
 * Works in Expo Go (no native module needed).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

      // Targeted notification pushed to this user's role/user room.
      socket.on('notification', () => refreshNotifications());
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [user, queryClient]);

  return <>{children}</>;
}
