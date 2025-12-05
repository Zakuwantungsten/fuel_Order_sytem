import { formatTruckNumber } from '../../../utils/formatters';

describe('Formatter Utilities', () => {
  describe('formatTruckNumber', () => {
    it('should format lowercase truck number', () => {
      expect(formatTruckNumber('t103dvl')).toBe('T103 DVL');
      expect(formatTruckNumber('t664ecq')).toBe('T664 ECQ');
    });

    it('should format uppercase truck number without space', () => {
      expect(formatTruckNumber('T103DVL')).toBe('T103 DVL');
      expect(formatTruckNumber('T664ECQ')).toBe('T664 ECQ');
    });

    it('should handle truck number with existing space', () => {
      expect(formatTruckNumber('T103 DVL')).toBe('T103 DVL');
      expect(formatTruckNumber('t103 dvl')).toBe('T103 DVL');
    });

    it('should handle truck number without T prefix', () => {
      expect(formatTruckNumber('103DVL')).toBe('T103 DVL');
      expect(formatTruckNumber('664ECQ')).toBe('T664 ECQ');
    });

    it('should handle mixed case', () => {
      expect(formatTruckNumber('T103Dvl')).toBe('T103 DVL');
      expect(formatTruckNumber('t103DVL')).toBe('T103 DVL');
    });

    it('should handle multiple spaces', () => {
      expect(formatTruckNumber('T103   DVL')).toBe('T103 DVL');
      expect(formatTruckNumber('t  103  dvl')).toBe('T103 DVL');
    });

    it('should return empty string for null/undefined', () => {
      expect(formatTruckNumber(null)).toBe('');
      expect(formatTruckNumber(undefined)).toBe('');
    });

    it('should return empty string for empty input', () => {
      expect(formatTruckNumber('')).toBe('');
    });

    it('should handle unusual but valid truck numbers', () => {
      expect(formatTruckNumber('t1abc')).toBe('T1 ABC');
      expect(formatTruckNumber('T12345XYZ')).toBe('T12345 XYZ');
    });

    it('should return uppercase trimmed value for non-matching patterns', () => {
      expect(formatTruckNumber('ABCDEF')).toBe('ABCDEF');
      expect(formatTruckNumber('12345')).toBe('12345');
    });

    it('should handle whitespace-only input', () => {
      expect(formatTruckNumber('   ')).toBe('');
    });

    it('should handle typical fleet truck numbers', () => {
      // Common patterns from the system
      expect(formatTruckNumber('T664ECQ')).toBe('T664 ECQ');
      expect(formatTruckNumber('T103DNH')).toBe('T103 DNH');
      expect(formatTruckNumber('T200DVK')).toBe('T200 DVK');
      expect(formatTruckNumber('T555DWK')).toBe('T555 DWK');
    });
  });
});
