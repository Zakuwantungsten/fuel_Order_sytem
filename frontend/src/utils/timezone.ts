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

const SHORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

const MONTH_NAME_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Parse a stored record date as a local calendar day (no UTC day-shift).
 * Canonical format is YYYY-MM-DD. Also accepts Date, ISO datetime,
 * D-Mon-YYYY, and legacy DD-MMM / DD-MM (year from fallbackYear).
 */
export const parseStoredRecordDate = (
  value: Date | string | number | null | undefined,
  fallbackYear?: number
): Date | null => {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  const dateStr = String(value).trim();

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  const dmy = dateStr.match(/^(\d{1,2})[-\/\s]([A-Za-z]+)[-\/\s](\d{4})$/);
  if (dmy) {
    const month = MONTH_NAME_INDEX[dmy[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(Number(dmy[3]), month, Number(dmy[1]));
    }
  }

  const parts = dateStr.split('-');
  if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    if (day >= 1 && day <= 31) {
      let month: number | undefined;
      if (/^\d{1,2}$/.test(parts[1])) {
        month = parseInt(parts[1], 10) - 1;
      } else {
        month = MONTH_NAME_INDEX[parts[1].toLowerCase()];
      }
      if (month !== undefined && month >= 0 && month <= 11) {
        const year = fallbackYear ?? new Date().getFullYear();
        return new Date(year, month, day);
      }
    }
  }

  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
};

/** Search-card label: "17 aug 2026" */
export const formatSearchCardDate = (
  value: Date | string | number | null | undefined,
  fallbackYear?: number
): string => {
  const d = parseStoredRecordDate(value, fallbackYear);
  if (!d) return 'Unknown Date';
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
