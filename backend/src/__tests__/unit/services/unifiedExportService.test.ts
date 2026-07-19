import archivalService from '../../../services/archivalService';
import { getAllLPOSummaries } from '../../../services/unifiedExportService';

jest.mock('../../../services/archivalService', () => ({
  __esModule: true,
  default: {
    queryArchivedData: jest.fn(),
  },
}));

const queryArchivedDataMock = archivalService.queryArchivedData as jest.MockedFunction<
  typeof archivalService.queryArchivedData
>;

describe('getAllLPOSummaries', () => {
  it('retrieves every archived LPO in batches instead of stopping at 10,000', async () => {
    const archivedRecords = Array.from({ length: 10001 }, (_, index) => ({
      _id: `archive-${index}`,
      originalId: `lpo-${index}`,
      lpoNo: `${String(index + 1).padStart(4, '0')}/26`,
      year: 2026,
      date: '2026-01-01',
    }));

    // Simulate an interrupted archival run leaving one duplicate behind.
    archivedRecords.push({
      ...archivedRecords[0],
      _id: 'duplicate-archive-record',
    });

    queryArchivedDataMock.mockImplementation(async (_collection, query, options = {}) => {
      expect(query.year).toBe(2026);
      const skip = options.skip ?? 0;
      const limit = options.limit ?? 100;
      return archivedRecords.slice(skip, skip + limit);
    });

    const results = await getAllLPOSummaries({
      includeArchived: true,
      filters: { year: 2026 },
    });

    expect(results).toHaveLength(10001);
    expect(queryArchivedDataMock).toHaveBeenCalledTimes(3);
    expect(queryArchivedDataMock.mock.calls.map((call) => call[2]?.skip)).toEqual([0, 5000, 10000]);
    expect(queryArchivedDataMock.mock.calls.every((call) => call[2]?.limit === 5000)).toBe(true);
  });

  it('preserves an explicitly requested overall limit', async () => {
    const archivedRecords = Array.from({ length: 100 }, (_, index) => ({
      _id: `archive-${index}`,
      originalId: `lpo-${index}`,
      lpoNo: `${String(index + 1).padStart(4, '0')}/25`,
      year: 2025,
      date: '2025-01-01',
    }));

    queryArchivedDataMock.mockImplementation(async (_collection, _query, options = {}) => {
      const skip = options.skip ?? 0;
      const limit = options.limit ?? 100;
      return archivedRecords.slice(skip, skip + limit);
    });

    const results = await getAllLPOSummaries({
      includeArchived: true,
      filters: { year: 2025 },
      limit: 25,
    });

    expect(results).toHaveLength(25);
    expect(queryArchivedDataMock).toHaveBeenCalledTimes(1);
    expect(queryArchivedDataMock.mock.calls[0][2]).toMatchObject({ limit: 25, skip: 0 });
  });
});
