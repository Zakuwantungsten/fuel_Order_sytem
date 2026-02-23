import { Request } from 'express';
import { PaginationQuery, PaginatedResponse } from '../types';

/**
 * Parse pagination parameters from query
 */
export const getPaginationParams = (query: any): Required<PaginationQuery> => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(5000, Math.max(1, parseInt(query.limit) || 10));
  const sort = query.sort || 'createdAt';
  const order = query.order === 'asc' ? 'asc' : 'desc';

  return { page, limit, sort, order };
};

/**
 * Create pagination response
 */
export const createPaginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginatedResponse<T> => {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Calculate skip value for MongoDB
 */
export const calculateSkip = (page: number, limit: number): number => {
  return (page - 1) * limit;
};
