/**
 * Shared formatting utilities used across User Management components.
 */

import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns';

/**
 * Format a date/string as a relative label ("2 days ago") with the full
 * ISO datetime as a tooltip-friendly return value.
 */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return 'Invalid date';
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format a date/string as a short date string: "Mar 6, 2026"
 */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return 'Invalid date';
  return format(date, 'MMM d, yyyy');
}

/**
 * Format a date/string as a full datetime: "Mar 6, 2026, 14:32"
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return 'Invalid date';
  return format(date, 'MMM d, yyyy, HH:mm');
}

/**
 * Trigger a browser download for a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generate an initialsAvatar string from first and last name.
 */
export function getInitials(firstName: string, lastName: string): string {
  return `${(firstName?.[0] ?? '').toUpperCase()}${(lastName?.[0] ?? '').toUpperCase()}`;
}

/**
 * Deterministically pick one of a set of background colours based on a string.
 * Used for avatar backgrounds so each user gets a consistent colour.
 */
const AVATAR_COLOURS = [
  'bg-violet-600', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-600',
  'bg-rose-600', 'bg-sky-600', 'bg-teal-600', 'bg-indigo-600',
];

export function avatarColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
}
