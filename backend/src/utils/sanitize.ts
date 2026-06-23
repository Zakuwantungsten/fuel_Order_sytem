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
 * Builds a whitespace/separator-tolerant regex source from user input, so that
 * identifier searches (truck numbers, LPO/DO numbers, etc.) still match when the
 * stored value and the typed query differ only in spacing or separators.
 *
 * The query is stripped of whitespace and common separators, each remaining
 * character is regex-escaped, and the characters are rejoined with a gap that
 * optionally consumes whitespace/separators. The gap class is a small literal
 * char-class repeated with `*`, so the resulting regex stays linear-time (no
 * ReDoS risk). Length is capped first for the same reason.
 *
 * Example: "t598 dtb" → "^t[\\s\\-_/.]*5[\\s\\-_/.]*9[\\s\\-_/.]*8[\\s\\-_/.]*d[\\s\\-_/.]*t[\\s\\-_/.]*b"
 * which matches "T598 DTB", "T598DTB", "T598  DTB", "T598-DTB", "t-598 dtb", etc.
 *
 * @param input    - User search input
 * @param maxLength - Maximum allowed length before processing (default: 100)
 * @param anchored  - Prefix-anchor the match with `^` (default: true → "starts with")
 * @returns Regex source string, or null when the input has no usable characters
 */
export const buildFuzzyRegex = (
  input: string,
  maxLength: number = 100,
  anchored: boolean = true
): string | null => {
  if (typeof input !== 'string') {
    return '';
  }

  // Trim + length-cap first to bound regex complexity (ReDoS protection).
  const trimmed = input.trim().substring(0, maxLength);

  // Drop whitespace and common separators from the query itself so they don't
  // become required literals — they're handled by the tolerant gap instead.
  const compact = trimmed.replace(/[\s\-_/.]+/g, '');
  if (!compact) {
    return null;
  }

  // Escape each surviving character and join with a separator-tolerant gap.
  const gap = '[\\s\\-_/.]*';
  const body = compact
    .split('')
    .map((ch) => escapeRegex(ch))
    .join(gap);

  return anchored ? `^${body}` : body;
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
