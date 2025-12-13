import archivalService from './archivalService';
import { FuelRecord, LPOEntry, LPOSummary, YardFuelDispense, DeliveryOrder } from '../models';
import logger from '../utils/logger';

/**
 * Unified Export Service
 * 
 * This service ensures all exports include BOTH active and archived data
 * Super Admin can export complete historical data
 */

interface ExportOptions {
  startDate?: Date;
  endDate?: Date;
  includeArchived?: boolean; // Default: true for exports
  filters?: any;
  sort?: any;
  limit?: number;
}

/**
 * Get all fuel records (active + archived)
 */
export async function getAllFuelRecords(options: ExportOptions = {}): Promise<any[]> {
  const {
    startDate,
    endDate,
    includeArchived = true,
    filters = {},
    sort = { date: -1 },
    limit,
  } = options;

  try {
    // Build query
    const query: any = { isDeleted: { $ne: true }, ...filters };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate.toISOString().split('T')[0];
      if (endDate) query.date.$lte = endDate.toISOString().split('T')[0];
    }

    // Get active records
    let activeQuery = FuelRecord.find(query).sort(sort);
    if (limit) activeQuery = activeQuery.limit(limit);
    const activeRecords = await activeQuery.lean();

    logger.info(`Retrieved ${activeRecords.length} active fuel records for export`);

    // Get archived records if requested
    let archivedRecords: any[] = [];
    if (includeArchived) {
      try {
        archivedRecords = await archivalService.queryArchivedData(
          'FuelRecord',
          query,
          { limit: limit || 10000, sort }
        );
        logger.info(`Retrieved ${archivedRecords.length} archived fuel records for export`);
      } catch (error: any) {
        logger.warn('Failed to fetch archived fuel records:', error.message);
      }
    }

    // Combine and sort
    const allRecords = [...activeRecords, ...archivedRecords];
    
    // Sort combined results
    allRecords.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime(); // Newest first
    });

    return limit ? allRecords.slice(0, limit) : allRecords;
  } catch (error: any) {
    logger.error('Error fetching all fuel records:', error);
    throw error;
  }
}

/**
 * Get all LPO entries (active + archived)
 */
export async function getAllLPOEntries(options: ExportOptions = {}): Promise<any[]> {
  const {
    startDate,
    endDate,
    includeArchived = true,
    filters = {},
    sort = { date: -1 },
    limit,
  } = options;

  try {
    const query: any = { isDeleted: { $ne: true }, ...filters };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate.toISOString().split('T')[0];
      if (endDate) query.date.$lte = endDate.toISOString().split('T')[0];
    }

    // Get active records
    let activeQuery = LPOEntry.find(query).sort(sort);
    if (limit) activeQuery = activeQuery.limit(limit);
    const activeRecords = await activeQuery.lean();

    // Get archived records
    let archivedRecords: any[] = [];
    if (includeArchived) {
      try {
        archivedRecords = await archivalService.queryArchivedData(
          'LPOEntry',
          query,
          { limit: limit || 10000, sort }
        );
      } catch (error: any) {
        logger.warn('Failed to fetch archived LPO entries:', error.message);
      }
    }

    const allRecords = [...activeRecords, ...archivedRecords];
    allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    logger.info(`Retrieved ${activeRecords.length} active + ${archivedRecords.length} archived LPO entries`);

    return limit ? allRecords.slice(0, limit) : allRecords;
  } catch (error: any) {
    logger.error('Error fetching all LPO entries:', error);
    throw error;
  }
}

/**
 * Get all LPO summaries (active + archived)
 */
export async function getAllLPOSummaries(options: ExportOptions = {}): Promise<any[]> {
  const {
    startDate,
    endDate,
    includeArchived = true,
    filters = {},
    sort = { date: -1 },
    limit,
  } = options;

  try {
    const query: any = { isDeleted: { $ne: true }, ...filters };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate.toISOString().split('T')[0];
      if (endDate) query.date.$lte = endDate.toISOString().split('T')[0];
    }

    // Get active records
    let activeQuery = LPOSummary.find(query).sort(sort);
    if (limit) activeQuery = activeQuery.limit(limit);
    const activeRecords = await activeQuery.lean();

    // Get archived records
    let archivedRecords: any[] = [];
    if (includeArchived) {
      try {
        archivedRecords = await archivalService.queryArchivedData(
          'LPOSummary',
          query,
          { limit: limit || 10000, sort }
        );
      } catch (error: any) {
        logger.warn('Failed to fetch archived LPO summaries:', error.message);
      }
    }

    const allRecords = [...activeRecords, ...archivedRecords];
    allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    logger.info(`Retrieved ${activeRecords.length} active + ${archivedRecords.length} archived LPO summaries`);

    return limit ? allRecords.slice(0, limit) : allRecords;
  } catch (error: any) {
    logger.error('Error fetching all LPO summaries:', error);
    throw error;
  }
}

/**
 * Get all yard fuel dispenses (active + archived)
 */
export async function getAllYardFuelDispenses(options: ExportOptions = {}): Promise<any[]> {
  const {
    startDate,
    endDate,
    includeArchived = true,
    filters = {},
    sort = { date: -1 },
    limit,
  } = options;

  try {
    const query: any = { isDeleted: { $ne: true }, ...filters };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate.toISOString().split('T')[0];
      if (endDate) query.date.$lte = endDate.toISOString().split('T')[0];
    }

    // Get active records
    let activeQuery = YardFuelDispense.find(query).sort(sort);
    if (limit) activeQuery = activeQuery.limit(limit);
    const activeRecords = await activeQuery.lean();

    // Get archived records
    let archivedRecords: any[] = [];
    if (includeArchived) {
      try {
        archivedRecords = await archivalService.queryArchivedData(
          'YardFuelDispense',
          query,
          { limit: limit || 10000, sort }
        );
      } catch (error: any) {
        logger.warn('Failed to fetch archived yard fuel dispenses:', error.message);
      }
    }

    const allRecords = [...activeRecords, ...archivedRecords];
    allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    logger.info(`Retrieved ${activeRecords.length} active + ${archivedRecords.length} archived yard fuel dispenses`);

    return limit ? allRecords.slice(0, limit) : allRecords;
  } catch (error: any) {
    logger.error('Error fetching all yard fuel dispenses:', error);
    throw error;
  }
}

/**
 * Get all delivery orders (these are NEVER archived per requirement)
 */
export async function getAllDeliveryOrders(options: ExportOptions = {}): Promise<any[]> {
  const {
    startDate,
    endDate,
    includeArchived = true,
    filters = {},
    sort = { date: -1 },
    limit,
  } = options;

  try {
    const query: any = { isDeleted: { $ne: true }, ...filters };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate.toISOString().split('T')[0];
      if (endDate) query.date.$lte = endDate.toISOString().split('T')[0];
    }

    // Get active records
    let activeQuery = DeliveryOrder.find(query).sort(sort);
    if (limit) activeQuery = activeQuery.limit(limit);
    const activeRecords = await activeQuery.lean();

    logger.info(`Retrieved ${activeRecords.length} active delivery orders for export`);

    // Get archived records if requested
    let archivedRecords: any[] = [];
    if (includeArchived) {
      try {
        archivedRecords = await archivalService.queryArchivedData(
          'DeliveryOrder',
          query,
          { limit: limit || 10000, sort }
        );
        logger.info(`Retrieved ${archivedRecords.length} archived delivery orders for export`);
      } catch (error: any) {
        logger.warn('Failed to fetch archived delivery orders:', error.message);
      }
    }

    // Combine and sort
    const allRecords = [...activeRecords, ...archivedRecords];
    
    // Sort combined results
    allRecords.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime(); // Newest first
    });

    return limit ? allRecords.slice(0, limit) : allRecords;
  } catch (error: any) {
    logger.error('Error fetching all delivery orders:', error);
    throw error;
  }
}

/**
 * Export helper to combine active and archived data for any collection
 */
export async function getUnifiedData(
  collectionName: 'FuelRecord' | 'LPOEntry' | 'LPOSummary' | 'YardFuelDispense' | 'DeliveryOrder',
  options: ExportOptions = {}
): Promise<any[]> {
  switch (collectionName) {
    case 'FuelRecord':
      return getAllFuelRecords(options);
    case 'LPOEntry':
      return getAllLPOEntries(options);
    case 'LPOSummary':
      return getAllLPOSummaries(options);
    case 'YardFuelDispense':
      return getAllYardFuelDispenses(options);
    case 'DeliveryOrder':
      return getAllDeliveryOrders(options);
    default:
      throw new Error(`Unknown collection: ${collectionName}`);
  }
}

/**
 * Get statistics including archived data
 */
export async function getUnifiedStatistics(startDate?: Date, endDate?: Date): Promise<{
  active: { [key: string]: number };
  archived: { [key: string]: number };
  total: { [key: string]: number };
}> {
  try {
    const stats = await archivalService.getArchivalStats();

    return {
      active: stats.activeRecords,
      archived: stats.archivedRecords,
      total: {
        FuelRecord: stats.activeRecords.FuelRecord + stats.archivedRecords.FuelRecord,
        LPOEntry: stats.activeRecords.LPOEntry + stats.archivedRecords.LPOEntry,
        LPOSummary: stats.activeRecords.LPOSummary + stats.archivedRecords.LPOSummary,
        YardFuelDispense: stats.activeRecords.YardFuelDispense + stats.archivedRecords.YardFuelDispense,
        AuditLog: stats.activeRecords.AuditLog + stats.archivedRecords.AuditLog,
      },
    };
  } catch (error: any) {
    logger.error('Error fetching unified statistics:', error);
    throw error;
  }
}

export default {
  getAllFuelRecords,
  getAllLPOEntries,
  getAllLPOSummaries,
  getAllYardFuelDispenses,
  getAllDeliveryOrders,
  getUnifiedData,
  getUnifiedStatistics,
};
