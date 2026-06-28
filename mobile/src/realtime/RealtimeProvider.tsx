import React, { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SOCKET_URL } from '../config';
import { useAuth } from '../auth/AuthContext';
import { getAccessToken } from '../auth/secureStore';
import { getNotifications } from '../api/notifications';
import { useToast } from '../components/NotificationToast';
import { isSuperManager, resolveUserStation } from '../api/manager';
import type { AuthUser } from '../types';

/**
 * Maintains a single Socket.io connection while authenticated and refreshes
 * react-query caches in response to live server events:
 *   - `data_changed` (global): collection-scoped cache invalidation
 *   - `notification`  (targeted to this user's rooms): in-app toast + cache refresh
 *     (background delivery is handled by the backend's Expo FCM/APNs push)
 *
 * Works in Expo Go (no native module needed for the socket itself).
 */
/** Returns true if an lpo_summaries event for this station should affect this user. */
function isStationRelevant(
  eventStation: string,
  user: AuthUser | null,
  smStations: string[] | undefined
): boolean {
  if (!user) return false;
  const st = eventStation.toUpperCase().trim();
  if (isSuperManager(user)) {
    // Empty list means "all stations" — no admin restriction configured yet.
    if (!smStations || smStations.length === 0) return true;
    return smStations.some((s) => s.toUpperCase().trim() === st);
  }
  if (user.role === 'manager') {
    const myStation = resolveUserStation(user)?.toUpperCase().trim() ?? '';
    return myStation === st;
  }
  // All other roles (admin, super_admin, etc.) receive everything.
  return true;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
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

      socket.on('data_changed', (payload: { collection?: string; station?: string | null }) => {
        switch (payload?.collection) {
          case 'lpo_summaries': {
            const eventStation = payload.station;
            // If station is unknown (legacy emit site, e.g. DO cascade) fall through
            // but still use silent invalidation to avoid a reload spinner.
            if (eventStation) {
              const smStations = queryClient.getQueryData<string[]>(['sm-stations', user?.role]);
              if (!isStationRelevant(eventStation, user, smStations)) break;
            }
            // Mark stale without an immediate background re-fetch — no spinner, no
            // forced reload. The 60 s poll or a user-initiated tap will do the fetch.
            queryClient.invalidateQueries({ queryKey: ['manager-lpos'], refetchType: 'none' });
            queryClient.invalidateQueries({ queryKey: ['driver-dashboard'], refetchType: 'none' });
            // Increment the signal so ManagerHome shows the "New entries" chip.
            queryClient.setQueryData<number>(['lpo-update-signal'], (prev) => (prev ?? 0) + 1);
            break;
          }
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
          // Background delivery is handled by the backend's Expo FCM/APNs push.
          // Scheduling a local notification here would cause a duplicate system banner
          // since the socket only fires while the app is in foreground.
        }
      });

      // Admin reset this user's password or forced a logout while the app was open.
      // Sign out immediately so the user is directed to login with their new credentials.
      socket.on('session_event', async (payload?: { type?: string }) => {
        if (payload?.type === 'password_reset' || payload?.type === 'force_logout') {
          await signOut();
          router.replace('/login');
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
  }, [user, queryClient, showToast, signOut]);

  return <>{children}</>;
}
