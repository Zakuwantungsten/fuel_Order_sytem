/**
 * Truck Number Normalization Utilities
 * Provides consistent truck number formatting across the application
 */

/**
 * Normalizes truck number by removing spaces and hyphens and converting to uppercase
 * @param truckNo - Raw truck number (e.g., "T991 EFN", "T991-EFN", "t991efn")
 * @returns Normalized truck number (e.g., "T991EFN")
 * @example
 * normalizeTruckNo("T991 EFN") // returns "T991EFN"
 * normalizeTruckNo("T991-EFN") // returns "T991EFN"
 * normalizeTruckNo("t991efn")  // returns "T991EFN"
 */
export const normalizeTruckNo = (truckNo: string): string => {
  if (!truckNo) return '';
  return truckNo.replace(/[\s-]/g, '').toUpperCase().trim();
};

/**
 * Checks if two truck numbers match when normalized
 * @param truckNo1 - First truck number
 * @param truckNo2 - Second truck number
 * @returns True if the normalized truck numbers match
 * @example
 * isTruckNoMatch("T991 EFN", "T991-EFN") // returns true
 * isTruckNoMatch("T991EFN", "T991 EFN")  // returns true
 * isTruckNoMatch("T991EFN", "T992EFN")   // returns false
 */
export const isTruckNoMatch = (truckNo1: string, truckNo2: string): boolean => {
  return normalizeTruckNo(truckNo1) === normalizeTruckNo(truckNo2);
};

/**
 * Formats truck number to display format with space (e.g., "T991 EFN")
 * @param truckNo - Truck number in any format
 * @returns Formatted truck number with space
 * @example
 * formatTruckNoDisplay("T991EFN")   // returns "T991 EFN"
 * formatTruckNoDisplay("T991-EFN")  // returns "T991 EFN"
 * formatTruckNoDisplay("T991 EFN")  // returns "T991 EFN"
 */
export const formatTruckNoDisplay = (truckNo: string): string => {
  if (!truckNo) return '';
  const normalized = normalizeTruckNo(truckNo);
  
  // Pattern: T followed by 3-4 digits followed by 3 letters
  // e.g., T991EFN -> T991 EFN
  const match = normalized.match(/^(T\d{3,4})([A-Z]{3})$/);
  
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  
  // Return as-is if doesn't match expected pattern
  return normalized;
};

/**
 * Validates truck number format
 * @param truckNo - Truck number to validate
 * @returns True if truck number matches expected pattern
 * @example
 * isValidTruckNo("T991 EFN")  // returns true
 * isValidTruckNo("T991-EFN")  // returns true
 * isValidTruckNo("T991EFN")   // returns true
 * isValidTruckNo("991EFN")    // returns false (missing T)
 * isValidTruckNo("T991")      // returns false (missing letters)
 */
export const isValidTruckNo = (truckNo: string): boolean => {
  if (!truckNo) return false;
  const normalized = normalizeTruckNo(truckNo);
  
  // Pattern: T followed by 3-4 digits followed by 3 letters
  return /^T\d{3,4}[A-Z]{3}$/.test(normalized);
};

/**
 * Creates a safe user ID for virtual driver users
 * Replaces spaces/hyphens with underscores to avoid MongoDB ObjectId casting issues
 * @param truckNo - Truck number
 * @returns Safe user ID string (e.g., "driver_T991_EFN")
 * @example
 * createDriverUserId("T991 EFN")  // returns "driver_T991_EFN"
 * createDriverUserId("T991-EFN")  // returns "driver_T991_EFN"
 */
export const createDriverUserId = (truckNo: string): string => {
  if (!truckNo) return '';
  // Replace spaces and hyphens with underscores for safe ID format
  const safeTruckNo = truckNo.replace(/[\s-]/g, '_').toUpperCase().trim();
  return `driver_${safeTruckNo}`;
};
