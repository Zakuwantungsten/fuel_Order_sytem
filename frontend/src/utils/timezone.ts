/**
 * Timezone Utility
 * Provides timezone-aware date formatting based on system configuration.
 * Call setSystemTimezone(), setSystemDateFormat(), and setSystemName()
 * once after loading system settings to apply them everywhere.
 */

let systemTimezone = 'Africa/Nairobi'; // Default timezone
let systemDateFormat = 'DD/MM/YYYY';   // Default date format
let systemName = 'Fuel Order Management System';

// ---- Setters (called from AuthContext after loading system settings) ----

export const setSystemTimezone = (timezone: string): void => {
  systemTimezone = timezone;
};

export const setSystemDateFormat = (format: string): void => {
  systemDateFormat = format;
};

/**
 * Set the system name and update the browser tab title.
 */
export const setSystemName = (name: string): void => {
  systemName = name;
  if (name && typeof document !== 'undefined') {
    document.title = name;
  }
};

// ---- Getters ----

export const getSystemTimezone = (): string => systemTimezone;
export const getSystemDateFormat = (): string => systemDateFormat;
export const getSystemName = (): string => systemName;

// ---- Internal helpers ----

/**
 * Build Intl.DateTimeFormat locale string from the stored dateFormat.
 * Returns 'en-GB' for DD/MM/YYYY, 'en-US' for MM/DD/YYYY, 'sv-SE' for YYYY-MM-DD.
 */
const getLocaleForFormat = (): string => {
  switch (systemDateFormat) {
    case 'MM/DD/YYYY': return 'en-US';
    case 'YYYY-MM-DD': return 'sv-SE';
    default:           return 'en-GB'; // DD/MM/YYYY
  }
};

// ---- Public formatters ----

/**
 * Format a date using the system configured timezone and date format.
 * Pass explicit `options` to override specific fields (e.g. omit time).
 */
export const formatDate = (
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: systemTimezone,
    ...options,
  };

  return new Intl.DateTimeFormat(getLocaleForFormat(), defaultOptions).format(dateObj);
};

/**
 * Format only the date portion (no time) using system timezone + date format.
 */
export const formatDateOnly = (date: Date | string | number): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getLocaleForFormat(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: systemTimezone,
  }).format(dateObj);
};

/**
 * Format only the time portion (no date) using system timezone.
 */
export const formatTimeOnly = (date: Date | string | number): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: systemTimezone,
  }).format(dateObj);
};

/**
 * Format a date in relative time (e.g., "2 hours ago")
 */
export const formatRelativeTime = (date: Date | string | number): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - dateObj.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
};

/**
 * Get current date/time in system timezone
 */
export const getCurrentDateTime = (): Date => {
  return new Date();
};

/**
 * Convert a date to ISO string in system timezone
 */
export const toISOString = (date: Date | string | number): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return dateObj.toISOString();
};

/**
 * Format date for display in tables (compact format)
 */
export const formatTableDate = (date: Date | string | number): string => {
  return formatDate(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
