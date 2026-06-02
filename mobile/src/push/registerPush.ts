import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
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
 */

// Show banners/sounds when a push arrives while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
    if (!Device.isDevice) return; // simulators can't get push tokens

    const projectId = getProjectId();
    if (!projectId) {
      // Expo Go / not yet `eas init`-ed — skip silently. Device push activates
      // once a development build with a projectId is installed.
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
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
