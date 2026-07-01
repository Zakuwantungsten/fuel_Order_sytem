import type { Router } from 'expo-router';
import type { AppNotification } from '../api/notifications';

const LPO_TYPES = new Set(['lpo_created', 'lpo_amended', 'lpo_cancelled']);

export function resolveHighlightTruck(type: string, truckNo?: string): string | undefined {
  if (!truckNo) return undefined;
  if (type === 'lpo_created') return truckNo.split(',')[0]?.trim() || undefined;
  return truckNo.trim() || undefined;
}

type NotificationSource = Pick<AppNotification, 'type' | 'metadata' | 'relatedId'>;

function lpoRouteParams(source: NotificationSource): Record<string, string> | null {
  if (!LPO_TYPES.has(source.type) || !source.metadata?.lpoNo) return null;
  const truckNo = resolveHighlightTruck(source.type, source.metadata.truckNo);
  return {
    highlightLpoNo: String(source.metadata.lpoNo),
    ...(truckNo ? { highlightTruckNo: truckNo } : {}),
  };
}

/** Find the list index for a highlighted LPO truck row. */
export function findLpoHighlightIndex<T extends { lpoNo?: string | number; truckNo?: string }>(
  entries: T[],
  lpoNo: string,
  truckNo?: string
): number {
  return entries.findIndex((e) => {
    if (String(e.lpoNo) !== String(lpoNo)) return false;
    if (truckNo) return (e.truckNo || '').toLowerCase() === truckNo.toLowerCase();
    return true;
  });
}

/** Navigate to the screen/content for this notification. Returns true if handled. */
export function navigateFromNotification(router: Router, source: NotificationSource): boolean {
  const params = lpoRouteParams(source);
  if (!params) return false;
  router.push({ pathname: '/(app)/home', params });
  return true;
}

/** Navigate from Expo push `data` payload. Returns true if handled. */
export function navigateFromPushData(router: Router, data: Record<string, unknown>): boolean {
  const type = typeof data.type === 'string' ? data.type : '';
  const lpoNo = typeof data.lpoNo === 'string' ? data.lpoNo : '';
  if (!LPO_TYPES.has(type) || !lpoNo) return false;
  const truckNo = typeof data.truckNo === 'string' ? data.truckNo : undefined;
  router.push({
    pathname: '/(app)/home',
    params: {
      highlightLpoNo: lpoNo,
      ...(truckNo ? { highlightTruckNo: truckNo } : {}),
    },
  });
  return true;
}
