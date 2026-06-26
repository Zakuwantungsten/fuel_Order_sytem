import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';

/**
 * Expo push registration.
 *
 * Remote push does NOT work in Expo Go (SDK 53+) — it requires a development
 * build. This module is written so it safely no-ops in Expo Go (or anywhere a
 * token can't be obtained) and only registers a token when running in a real
 * build with an EAS projectId configured.
 *
 * IMPORTANT: `expo-notifications` is imported lazily (inside the functions
 * below) rather than at the top of the module. Statically importing it runs an
 * auto-registration side-effect that *throws* in Expo Go on SDK 53+, which
 * would crash the app at startup before any of our guards run.
 */

const isExpoGo = Constants.appOwnership === 'expo';

function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as any)?.eas?.projectId ||
    (Constants as any).easConfig?.projectId ||
    undefined
  );
}

let registeredToken: string | null = null;

/**
 * Configure the notification handler + Android channel so that banners and
 * sounds fire when a notification arrives (push OR local). Call this once at
 * app startup — it's safe to call multiple times (idempotent).
 */
export async function initNotificationHandler(): Promise<void> {
  try {
    if (isExpoGo) return;
    const Notifications = await import('expo-notifications');

    // Suppress the system banner/sound when the app is already in the foreground —
    // the in-app toast in RealtimeProvider handles that case. When the app is in
    // background or closed, this handler is not called at all (the OS shows the
    // notification directly), so background push is unaffected.
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const inForeground = AppState.currentState === 'active';
        return {
          shouldShowBanner: !inForeground,
          shouldShowList: true,
          shouldPlaySound: !inForeground,
          shouldSetBadge: true,
        };
      },
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'notification.wav',
        lightColor: '#1d4ed8',
      });
    }
  } catch {
    // Non-fatal.
  }
}

/**
 * Fire an immediate local notification. Shows as a system banner + appears in
 * the notification panel + plays the bundled sound. No-ops in Expo Go or on
 * simulators, and requires notification permission to be granted.
 */
export async function scheduleLocalNotification(title: string, body: string): Promise<void> {
  try {
    if (isExpoGo || !Device.isDevice) return;
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'notification.wav',
        channelId: 'default',
      },
      trigger: null,
    });
  } catch {
    // Non-fatal.
  }
}

/** Best-effort: obtain an Expo push token and register it with the backend. */
export async function registerForPush(): Promise<void> {
  try {
    if (isExpoGo) return;
    if (!Device.isDevice) return;

    const projectId = getProjectId();
    if (!projectId) {
      // Not yet `eas init`-ed — skip silently.
      return;
    }

    // Ensure handler + channel are configured (initNotificationHandler may
    // have already run at startup, but calling again is safe/idempotent).
    await initNotificationHandler();

    const Notifications = await import('expo-notifications');

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token || token === registeredToken) return;

    await apiClient.post('/notifications/mobile-subscribe', { expoPushToken: token });
    registeredToken = token;
  } catch (err) {
    // Non-fatal, but log so background-push failures are diagnosable.
    console.warn('[registerForPush] failed:', err);
  }
}

/** Best-effort: remove the device token on logout. */
export async function unregisterPush(): Promise<void> {
  try {
    if (!registeredToken) return;
    await apiClient.delete('/notifications/mobile-subscribe', { data: { expoPushToken: registeredToken } });
    registeredToken = null;
  } catch {
    /* ignore */
  }
}
