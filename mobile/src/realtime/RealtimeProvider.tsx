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

/** Session events that terminate the current session — kept in sync with web NotificationBell. */
const SESSION_TERMINATING_EVENTS = new Set([
  'force_logout',
  'account_deactivated',
  'account_banned',
  'account_deleted',
  'password_reset',
  'account_updated',
]);

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
  payload: {
    station?: string | null;
    isCustomStation?: boolean | null;
    customCountry?: string | null;
  },
  user: AuthUser | null,
  smStations: string[] | undefined,
  customZambiaEnabled?: boolean
): boolean {
  if (!user) return false;
  const st = (payload.station || '').toUpperCase().trim();

  if (isSuperManager(user)) {
    if (payload.isCustomStation && customZambiaEnabled !== false) {
      const country = (payload.customCountry || 'Zambia').toLowerCase();
      if (country === 'zambia') return true;
    }
    if (!st) return true;
    if (!smStations || smStations.length === 0) return true;
    return smStations.some((s) => s.toUpperCase().trim() === st);
  }
  if (user.role === 'manager') {
    const myStation = resolveUserStation(user)?.toUpperCase().trim() ?? '';
    return myStation === st;
  }
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

      socket.on('data_changed', (payload: {
        collection?: string;
        station?: string | null;
        isCustomStation?: boolean | null;
        customCountry?: string | null;
      }) => {
        switch (payload?.collection) {
          case 'lpo_summaries': {
            const smStations = queryClient.getQueryData<string[]>(['sm-stations', user?.role]);
            const smAccess = queryClient.getQueryData<{ customZambiaEnabled?: boolean }>(['sm-access', user?.role]);
            if (payload.station || payload.isCustomStation) {
              if (!isStationRelevant(payload, user, smStations, smAccess?.customZambiaEnabled)) break;
            }
            // Mark stale without an immediate background re-fetch — no spinner, no
            // forced reload. The 60 s poll or a user-initiated tap will do the fetch.
            queryClient.invalidateQueries({ queryKey: ['manager-lpos'], refetchType: 'none' });
            queryClient.invalidateQueries({ queryKey: ['lpo-filter-stations'], refetchType: 'none' });
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
            queryClient.invalidateQueries({ queryKey: ['sm-access'] });
            queryClient.invalidateQueries({ queryKey: ['lpo-filter-stations'] });
            break;
        }
      });

      socket.on('notification', async (payload?: {
        title?: string;
        message?: string;
        type?: string;
        metadata?: Record<string, any>;
        relatedId?: string;
      }) => {
        // Refresh badge + notification list.
        refreshNotifications();

        // Resolve notification content: use the socket payload if it includes
        // title/message, otherwise fetch the most recent notification from the API.
        let title = payload?.title;
        let message = payload?.message;
        let type = payload?.type;
        let metadata = payload?.metadata;
        let relatedId = payload?.relatedId;

        if (!title || !message) {
          try {
            const result = await getNotifications();
            const latest = result.notifications?.[0];
            if (latest) {
              title = latest.title;
              message = latest.message;
              type = latest.type;
              metadata = latest.metadata;
              relatedId = latest.relatedId;
            }
          } catch {
            // Non-fatal — toast just won't show if we can't get the content.
          }
        }

        if (title && message) {
          showToast({ title, message, type, metadata, relatedId });
        }
      });

      // Admin session actions (ban, deactivate, password reset, force logout, etc.)
      // Sign out immediately so the user must re-authenticate.
      socket.on('session_event', async (payload?: { type?: string }) => {
        if (!payload?.type || !SESSION_TERMINATING_EVENTS.has(payload.type)) return;
        await signOut();
        router.replace('/login');
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
