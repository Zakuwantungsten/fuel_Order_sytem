import { 
  getPaginationParams, 
  createPaginatedResponse, 
  calculateSkip 
} from '../../../utils/pagination';

describe('Pagination Utilities', () => {
  describe('getPaginationParams', () => {
    it('should return default values when no query params provided', () => {
      const result = getPaginationParams({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.sort).toBe('createdAt');
      expect(result.order).toBe('desc');
    });

    it('should parse page parameter correctly', () => {
      expect(getPaginationParams({ page: '5' }).page).toBe(5);
      expect(getPaginationParams({ page: '1' }).page).toBe(1);
      expect(getPaginationParams({ page: '100' }).page).toBe(100);
    });

    it('should enforce minimum page of 1', () => {
      expect(getPaginationParams({ page: '0' }).page).toBe(1);
      expect(getPaginationParams({ page: '-5' }).page).toBe(1);
      expect(getPaginationParams({ page: 'invalid' }).page).toBe(1);
    });

    it('should parse limit parameter correctly', () => {
      expect(getPaginationParams({ limit: '25' }).limit).toBe(25);
      expect(getPaginationParams({ limit: '50' }).limit).toBe(50);
    });

    it('should enforce minimum limit of 1', () => {
      // Note: '0' is falsy so it falls back to default 10, then min(100, max(1, 10)) = 10
      expect(getPaginationParams({ limit: '0' }).limit).toBe(10);
      expect(getPaginationParams({ limit: '-10' }).limit).toBe(1);
    });

    it('should enforce maximum limit of 100', () => {
      expect(getPaginationParams({ limit: '500' }).limit).toBe(100);
      expect(getPaginationParams({ limit: '101' }).limit).toBe(100);
    });

    it('should parse sort parameter correctly', () => {
      expect(getPaginationParams({ sort: 'date' }).sort).toBe('date');
      expect(getPaginationParams({ sort: 'truckNo' }).sort).toBe('truckNo');
    });

    it('should default sort to createdAt', () => {
      expect(getPaginationParams({}).sort).toBe('createdAt');
    });

    it('should parse order parameter correctly', () => {
      expect(getPaginationParams({ order: 'asc' }).order).toBe('asc');
      expect(getPaginationParams({ order: 'desc' }).order).toBe('desc');
    });

    it('should default order to desc for invalid values', () => {
      expect(getPaginationParams({ order: 'invalid' }).order).toBe('desc');
      expect(getPaginationParams({ order: 'ASC' }).order).toBe('desc');
    });
  });

  describe('createPaginatedResponse', () => {
    it('should create correct paginated response', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = createPaginatedResponse(data, 1, 10, 50);

      expect(result.data).toEqual(data);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should calculate total pages correctly', () => {
      expect(createPaginatedResponse([], 1, 10, 0).pagination.totalPages).toBe(0);
      expect(createPaginatedResponse([], 1, 10, 5).pagination.totalPages).toBe(1);
      expect(createPaginatedResponse([], 1, 10, 10).pagination.totalPages).toBe(1);
      expect(createPaginatedResponse([], 1, 10, 11).pagination.totalPages).toBe(2);
      expect(createPaginatedResponse([], 1, 10, 100).pagination.totalPages).toBe(10);
    });

    it('should handle different page sizes', () => {
      expect(createPaginatedResponse([], 1, 5, 50).pagination.totalPages).toBe(10);
      expect(createPaginatedResponse([], 1, 25, 50).pagination.totalPages).toBe(2);
      expect(createPaginatedResponse([], 1, 50, 50).pagination.totalPages).toBe(1);
    });

    it('should handle empty data array', () => {
      const result = createPaginatedResponse([], 1, 10, 0);
      
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('calculateSkip', () => {
    it('should calculate correct skip value', () => {
      expect(calculateSkip(1, 10)).toBe(0);
      expect(calculateSkip(2, 10)).toBe(10);
      expect(calculateSkip(3, 10)).toBe(20);
      expect(calculateSkip(5, 10)).toBe(40);
    });

    it('should handle different page sizes', () => {
      expect(calculateSkip(1, 25)).toBe(0);
      expect(calculateSkip(2, 25)).toBe(25);
      expect(calculateSkip(3, 25)).toBe(50);
    });

    it('should handle large page numbers', () => {
      expect(calculateSkip(100, 10)).toBe(990);
      expect(calculateSkip(1000, 50)).toBe(49950);
    });
  });
});
