import Constants from 'expo-constants';

/**
 * Resolve the backend API base URL.
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_BASE_URL env var (set in .env / shell for quick overrides)
 *   2. expo.extra.apiBaseUrl in app.json (the committed default)
 *   3. Hardcoded LAN fallback
 *
 * NOTE: On a physical phone running Expo Go, "localhost" points at the *phone*,
 * not your dev PC. Use your machine's LAN IP (e.g. http://192.168.4.11:5000).
 * On an Android emulator use http://10.0.2.2:5000.
 */
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL =
  fromEnv || fromExtra || 'http://192.168.4.11:5000/api/v1';

/** Socket.io connects to the server origin (without the /api/v1 path). */
export const SOCKET_URL = API_BASE_URL.replace(/\/api(\/v\d+)?\/?$/, '');

export const config = {
  apiBaseUrl: API_BASE_URL,
  socketUrl: SOCKET_URL,
};
