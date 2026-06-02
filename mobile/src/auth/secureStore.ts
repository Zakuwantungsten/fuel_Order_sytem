import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted token storage. expo-secure-store keys must be alphanumeric + ".-_".
 */
const ACCESS_KEY = 'fuelorder_access_token';
const REFRESH_KEY = 'fuelorder_refresh_token';
const USER_KEY = 'fuelorder_user';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

/** Cache the user profile so the app can restore the session instantly & offline. */
export async function saveCachedUser(user: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export async function getCachedUser<T = any>(): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function clearCachedUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}
