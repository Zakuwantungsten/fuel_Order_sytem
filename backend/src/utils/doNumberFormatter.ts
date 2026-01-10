/**
 * Utility functions for DO number formatting
 * Format: XXXX/YY (e.g., 0001/26, 0002/26)
 */

/**
 * Format a sequential number into DO number format: XXXX/YY
 * @param sequentialNumber - The sequential number (e.g., 1, 2, 3...)
 * @param year - Optional year (defaults to current year)
 * @returns Formatted DO number (e.g., "0001/26")
 */
export function formatDONumber(sequentialNumber: number, year?: number): string {
  const targetYear = year || new Date().getFullYear();
  const yearSuffix = targetYear.toString().slice(-2); // Get last 2 digits of year
  const paddedNumber = sequentialNumber.toString().padStart(4, '0');
  return `${paddedNumber}/${yearSuffix}`;
}

/**
 * Parse a DO number in XXXX/YY format
 * @param doNumber - The DO number string (e.g., "0001/26")
 * @returns Object with sequential number and year
 */
export function parseDONumber(doNumber: string): { sequentialNumber: number; year: number } | null {
  if (!doNumber) return null;
  
  const match = doNumber.match(/^(\d{1,4})\/(\d{2})$/);
  if (!match) return null;
  
  const sequentialNumber = parseInt(match[1], 10);
  const yearSuffix = parseInt(match[2], 10);
  
  // Convert 2-digit year to 4-digit year
  // Assume years 00-50 are 2000-2050, and 51-99 are 1951-1999
  const fullYear = yearSuffix <= 50 ? 2000 + yearSuffix : 1900 + yearSuffix;
  
  return { sequentialNumber, year: fullYear };
}

/**
 * Get the next DO number based on the last DO number
 * Handles year rollover (resets to 0001 when year changes)
 * @param lastDONumber - The last DO number (e.g., "0015/26")
 * @param currentYear - Optional current year (defaults to current year)
 * @returns Next DO number (e.g., "0016/26" or "0001/27" if year changed)
 */
export function getNextDONumber(lastDONumber: string | null | undefined, currentYear?: number): string {
  const targetYear = currentYear || new Date().getFullYear();
  
  if (!lastDONumber) {
    // No previous DO, start from 1
    return formatDONumber(1, targetYear);
  }
  
  const parsed = parseDONumber(lastDONumber);
  if (!parsed) {
    // Invalid format, start from 1
    return formatDONumber(1, targetYear);
  }
  
  // Check if year has changed
  if (parsed.year !== targetYear) {
    // Year changed, reset to 1
    return formatDONumber(1, targetYear);
  }
  
  // Same year, increment the number
  return formatDONumber(parsed.sequentialNumber + 1, targetYear);
}

/**
 * Extract just the numeric part from a DO number for sorting purposes
 * @param doNumber - The DO number string (e.g., "0015/26")
 * @returns The sequential number (e.g., 15)
 */
export function extractSequentialNumber(doNumber: string): number {
  const parsed = parseDONumber(doNumber);
  return parsed ? parsed.sequentialNumber : 0;
}

/**
 * Check if a DO number is in the new format (XXXX/YY)
 * @param doNumber - The DO number string
 * @returns True if in new format, false otherwise
 */
export function isNewDOFormat(doNumber: string): boolean {
  return /^\d{1,4}\/\d{2}$/.test(doNumber);
}

/**
 * Convert legacy DO number (simple integer) to new format
 * @param legacyNumber - Legacy DO number (e.g., "6433" or 6433)
 * @param year - Optional year (defaults to current year)
 * @returns New format DO number (e.g., "6433/26")
 */
export function convertLegacyDONumber(legacyNumber: string | number, year?: number): string {
  const num = typeof legacyNumber === 'string' ? parseInt(legacyNumber, 10) : legacyNumber;
  if (isNaN(num)) {
    return formatDONumber(1, year);
  }
  return formatDONumber(num, year);
}
