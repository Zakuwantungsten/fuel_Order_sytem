import { apiClient } from './client';

/**
 * Read-only config the mobile app needs. GET /config/journey-config is exposed
 * to all authenticated users (not just admins).
 */
/** Map of STATION NAME (uppercased) → currency code (USD/TZS) from station config. */
export async function getStationCurrencyMap(): Promise<Record<string, string>> {
  try {
    const res = await apiClient.get('/config/stations');
    const list: any[] = res.data?.data ?? [];
    const map: Record<string, string> = {};
    for (const s of list) {
      const name = (s.stationName || s.name || '').toString().toUpperCase().trim();
      if (name && s.currency) map[name] = s.currency;
    }
    return map;
  } catch {
    return {};
  }
}

export async function getSuperManagerStations(): Promise<string[]> {
  try {
    const res = await apiClient.get('/config/journey-config');
    const data = res.data?.data ?? res.data;
    const list = data?.superManagerStations;
    return Array.isArray(list) ? list.map((s: string) => s.toUpperCase().trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
