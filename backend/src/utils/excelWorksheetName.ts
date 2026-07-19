const EXCEL_WORKSHEET_NAME_LIMIT = 31;
const INVALID_WORKSHEET_CHARACTERS = /[\/\\*?:\[\]]/g;
const CONTROL_CHARACTERS = /[\u0000-\u001F]/g;

/**
 * Produce an Excel-safe, case-insensitively unique worksheet name.
 * The supplied set is updated so subsequent calls cannot return a collision.
 */
export const createUniqueWorksheetName = (
  rawName: unknown,
  usedNames: Set<string>,
  fallback = 'Sheet'
): string => {
  const sanitized = String(rawName ?? '')
    .replace(INVALID_WORKSHEET_CHARACTERS, '-')
    .replace(CONTROL_CHARACTERS, '')
    .trim()
    .replace(/^'+|'+$/g, '');

  const baseName = (sanitized || fallback).substring(0, EXCEL_WORKSHEET_NAME_LIMIT);
  let candidate = baseName;
  let duplicateNumber = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${duplicateNumber})`;
    candidate = `${baseName.substring(0, EXCEL_WORKSHEET_NAME_LIMIT - suffix.length)}${suffix}`;
    duplicateNumber += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
};
