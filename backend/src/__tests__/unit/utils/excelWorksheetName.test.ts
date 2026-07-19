import { createUniqueWorksheetName } from '../../../utils/excelWorksheetName';

describe('createUniqueWorksheetName', () => {
  it('replaces characters Excel forbids in worksheet names', () => {
    const usedNames = new Set<string>();

    expect(createUniqueWorksheetName('0001/26', usedNames, 'LPO')).toBe('0001-26');
    expect(createUniqueWorksheetName('A\\B*C?D:E[F]', usedNames, 'LPO')).toBe('A-B-C-D-E-F-');
  });

  it('keeps worksheet names unique without changing the LPO document value', () => {
    const usedNames = new Set<string>();
    const lpoNumber = '0001/26';

    expect(createUniqueWorksheetName(lpoNumber, usedNames, 'LPO')).toBe('0001-26');
    expect(createUniqueWorksheetName(lpoNumber, usedNames, 'LPO')).toBe('0001-26 (2)');
    expect(lpoNumber).toBe('0001/26');
  });

  it('handles case-insensitive collisions and reserved names', () => {
    const usedNames = new Set<string>(['summary']);

    expect(createUniqueWorksheetName('Summary', usedNames, 'LPO')).toBe('Summary (2)');
    expect(createUniqueWorksheetName('SUMMARY', usedNames, 'LPO')).toBe('SUMMARY (3)');
  });

  it('limits names to 31 characters while preserving unique suffixes', () => {
    const usedNames = new Set<string>();
    const longName = '1234567890123456789012345678901234567890';

    expect(createUniqueWorksheetName(longName, usedNames, 'LPO')).toHaveLength(31);
    const duplicate = createUniqueWorksheetName(longName, usedNames, 'LPO');
    expect(duplicate).toHaveLength(31);
    expect(duplicate).toMatch(/ \(2\)$/);
  });

  it('uses a fallback for empty or unusable names', () => {
    const usedNames = new Set<string>();

    expect(createUniqueWorksheetName(null, usedNames, 'LPO')).toBe('LPO');
    expect(createUniqueWorksheetName("''", usedNames, 'LPO')).toBe('LPO (2)');
  });
});
