/**
 * Utility functions for data formatting
 */

/**
 * Format truck number to standard format: T(number)(space)(letters)
 * Example: "t103dvl" -> "T103 DVL", "T103DVL" -> "T103 DVL", "t 103 dvl" -> "T103 DVL"
 * @param truckNo - The truck number to format
 * @returns Formatted truck number in standard format (e.g., "T103 DVL")
 */
export const formatTruckNumber = (truckNo: string | undefined | null): string => {
  if (!truckNo || typeof truckNo !== 'string') return '';
  
  // Remove all spaces and convert to uppercase
  const cleaned = truckNo.replace(/\s+/g, '').toUpperCase();
  
  // Match the pattern: T followed by numbers followed by letters
  const match = cleaned.match(/^T?(\d+)([A-Z]+)$/);
  
  if (match) {
    const [, numbers, letters] = match;
    return `T${numbers} ${letters}`;
  }
  
  // If it already has the correct format with space, normalize it
  const spaceMatch = truckNo.toUpperCase().match(/^T?(\d+)\s+([A-Z]+)$/);
  if (spaceMatch) {
    const [, numbers, letters] = spaceMatch;
    return `T${numbers} ${letters}`;
  }
  
  // Return original value in uppercase if it doesn't match expected pattern
  return truckNo.toUpperCase().trim();
};
