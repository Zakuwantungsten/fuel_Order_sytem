import { Platform } from 'react-native';
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

// True when running inside the Expo Go client (where remote push is unavailable).
const isExpoGo = Constants.appOwnership === 'expo';

function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as any)?.eas?.projectId ||
    (Constants as any).easConfig?.projectId ||
    undefined
  );
}

let registeredToken: string | null = null;

/** Best-effort: obtain an Expo push token and register it with the backend. */
export async function registerForPush(): Promise<void> {
  try {
    if (isExpoGo) return;          // remote push isn't supported in Expo Go
    if (!Device.isDevice) return;  // simulators can't get push tokens

    const projectId = getProjectId();
    if (!projectId) {
      // Not yet `eas init`-ed — skip silently. Device push activates
      // once a development build with a projectId is installed.
      return;
    }

    // Lazy import: only loaded in a real build, never in Expo Go.
    const Notifications = await import('expo-notifications');

    // Show banners/sounds when a push arrives while the app is foregrounded.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        // Custom notification tone bundled via the expo-notifications `sounds`
        // plugin (see app.json). Falls back to the system sound if unavailable.
        sound: 'notification.wav',
      });
    }

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
  } catch {
    // Never let push setup break the app.
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
