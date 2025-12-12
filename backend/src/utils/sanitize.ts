/**
 * Input sanitization utilities to prevent injection attacks
 */

/**
 * Escapes special regex characters to prevent ReDoS attacks
 * @param input - User input string
 * @returns Sanitized string safe for regex
 */
export const escapeRegex = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }
  // Escape all special regex characters
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Sanitizes user input for use in MongoDB regex queries
 * Prevents ReDoS attacks and limits query complexity
 * @param input - User input string
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns Sanitized string
 */
export const sanitizeRegexInput = (input: string, maxLength: number = 100): string => {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Trim and limit length to prevent long-running regex
  const trimmed = input.trim().substring(0, maxLength);
  
  // Escape regex special characters
  return escapeRegex(trimmed);
};

/**
 * Validates and sanitizes search input
 * @param input - User search input
 * @returns Sanitized search string or null if invalid
 */
export const sanitizeSearchInput = (input: any): string | null => {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  const sanitized = sanitizeRegexInput(input, 100);
  
  // Reject if sanitized string is empty or too short
  if (sanitized.length === 0) {
    return null;
  }
  
  return sanitized;
};

/**
 * Creates a safe MongoDB regex filter object
 * @param field - Field name
 * @param input - User input
 * @returns Safe regex filter or empty object
 */
export const createSafeRegexFilter = (field: string, input: any): Record<string, any> => {
  const sanitized = sanitizeSearchInput(input);
  
  if (!sanitized) {
    return {};
  }
  
  return {
    [field]: { $regex: sanitized, $options: 'i' }
  };
};
