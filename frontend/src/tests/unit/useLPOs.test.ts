import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/api', () => ({
  lposAPI: {},
  lpoWorkbookAPI: {},
}));

import { buildLPOQueryParams } from '../../hooks/useLPOs';

describe('buildLPOQueryParams', () => {
  it('serializes stations and non-contiguous periods canonically', () => {
    expect(buildLPOQueryParams({
      page: 2,
      limit: 25,
      search: 'T598 DTB',
      stations: [' station b ', 'STATION A', 'station b'],
      periods: [
        { year: 2025, month: 3 },
        { year: 2025, month: 1 },
        { year: 2025, month: 3 },
      ],
      dateFrom: '2025-03-05',
      dateTo: '2025-03-05',
      status: 'active',
    })).toEqual({
      page: 2,
      limit: 25,
      sort: 'lpo_desc',
      order: 'desc',
      search: 'T598 DTB',
      stations: 'STATION A,STATION B',
      periods: '2025-01,2025-03',
      dateFrom: '2025-03-05',
      dateTo: '2025-03-05',
      status: 'active',
    });
  });

  it('omits unrestricted station and all-status filters', () => {
    expect(buildLPOQueryParams({
      page: 1,
      limit: 10,
      stations: [],
      periods: [],
      status: 'all',
    })).toEqual({
      page: 1,
      limit: 10,
      sort: 'lpo_desc',
      order: 'desc',
    });
  });
});
