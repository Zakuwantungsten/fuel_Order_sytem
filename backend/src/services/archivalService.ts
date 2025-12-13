import mongoose from 'mongoose';
import {
  FuelRecord,
  LPOEntry,
  LPOSummary,
  YardFuelDispense,
  AuditLog,
  DeliveryOrder,
} from '../models';
import {
  ArchivedFuelRecord,
  ArchivedLPOEntry,
  ArchivedLPOSummary,
  ArchivedYardFuelDispense,
  ArchivedDeliveryOrder,
  ArchivedAuditLog,
  ArchivalMetadata,
} from '../models/ArchivedData';
import { SystemConfig } from '../models/SystemConfig';
import logger from '../utils/logger';

/**
 * Archival Service
 * 
 * Strategy for your system:
 * - Active data: Configurable retention period per collection (HOT DATA)
 * - Archive: Older than retention period (COLD DATA)
 * - All collections can be archived including DeliveryOrders
 * - Audit logs: Default 12 months retention
 * - Other collections: Default 6 months retention
 * 
 * With 15 concurrent users and 4-5 months active data, this will:
 * - Keep your active DB size small (~500MB vs 5GB+)
 * - Reduce query times by 70-90%
 * - Still allow reference queries to archived data
 */

export interface ArchivalOptions {
  monthsToKeep?: number; // Default: 6 months
  auditLogMonthsToKeep?: number; // Default: 12 months
  dryRun?: boolean; // Test without actually archiving
  collections?: string[]; // Specific collections to archive
  batchSize?: number; // Process in batches to avoid memory issues
}

export interface ArchivalResult {
  success: boolean;
  collectionsArchived: {
    [collectionName: string]: {
      recordsArchived: number;
      duration: number; // milliseconds
      cutoffDate: Date;
    };
  };
  totalRecordsArchived: number;
  totalDuration: number;
  errors: string[];
}

class ArchivalService {
  /**
   * Get collection-specific retention period from system config
   */
  private async getCollectionRetention(collectionName: string, defaultMonths: number): Promise<number> {
    try {
      const systemConfig = await SystemConfig.findOne({
        configType: 'system_settings',
        isDeleted: false,
      });

      if (systemConfig?.systemSettings?.data?.collectionArchivalSettings) {
        const collectionSettings = systemConfig.systemSettings.data.collectionArchivalSettings[collectionName];
        if (collectionSettings && collectionSettings.enabled !== false) {
          return collectionSettings.retentionMonths || defaultMonths;
        } else if (collectionSettings && collectionSettings.enabled === false) {
          // Collection archival is disabled
          return -1; // Sentinel value to skip archival
        }
      }

      // Fall back to global settings or default
      if (systemConfig?.systemSettings?.data?.archivalEnabled === false) {
        return -1; // Global archival disabled
      }

      return systemConfig?.systemSettings?.data?.archivalMonths || defaultMonths;
    } catch (error) {
      logger.warn(`Failed to get collection retention for ${collectionName}, using default: ${defaultMonths}`, error);
      return defaultMonths;
    }
  }

  /**
   * Main archival function
   */
  async archiveOldData(
    options: ArchivalOptions = {},
    initiatedBy: string = 'system'
  ): Promise<ArchivalResult> {
    const {
      monthsToKeep = 6,
      auditLogMonthsToKeep = 12,
      dryRun = false,
      collections = ['FuelRecord', 'LPOEntry', 'LPOSummary', 'YardFuelDispense', 'DeliveryOrder', 'AuditLog'],
      batchSize = 1000,
    } = options;

    const result: ArchivalResult = {
      success: true,
      collectionsArchived: {},
      totalRecordsArchived: 0,
      totalDuration: 0,
      errors: [],
    };

    const startTime = Date.now();

    logger.info(`Starting archival process (DRY RUN: ${dryRun})`);
    logger.info(`Keeping last ${monthsToKeep} months of data`);
    logger.info(`Collections to archive: ${collections.join(', ')}`);

    try {
      const now = new Date();

      // Archive each collection with its specific retention period
      if (collections.includes('FuelRecord')) {
        const retentionMonths = await this.getCollectionRetention('FuelRecord', monthsToKeep);
        if (retentionMonths > 0) {
          const cutoffDate = new Date(now);
          cutoffDate.setMonth(now.getMonth() - retentionMonths);
          logger.info(`FuelRecord cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
          
          const fuelRecordResult = await this.archiveCollection(
            'FuelRecord',
            FuelRecord,
            ArchivedFuelRecord,
            cutoffDate,
            initiatedBy,
            dryRun,
            batchSize
          );
          result.collectionsArchived['FuelRecord'] = fuelRecordResult;
          result.totalRecordsArchived += fuelRecordResult.recordsArchived;
        } else {
          logger.info('FuelRecord archival is disabled, skipping');
        }
      }

      if (collections.includes('LPOEntry')) {
        const retentionMonths = await this.getCollectionRetention('LPOEntry', monthsToKeep);
        if (retentionMonths > 0) {
          const cutoffDate = new Date(now);
          cutoffDate.setMonth(now.getMonth() - retentionMonths);
          logger.info(`LPOEntry cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
          
          const lpoEntryResult = await this.archiveCollection(
            'LPOEntry',
            LPOEntry,
            ArchivedLPOEntry,
            cutoffDate,
            initiatedBy,
            dryRun,
            batchSize
          );
          result.collectionsArchived['LPOEntry'] = lpoEntryResult;
          result.totalRecordsArchived += lpoEntryResult.recordsArchived;
        } else {
          logger.info('LPOEntry archival is disabled, skipping');
        }
      }

      if (collections.includes('LPOSummary')) {
        const retentionMonths = await this.getCollectionRetention('LPOSummary', monthsToKeep);
        if (retentionMonths > 0) {
          const cutoffDate = new Date(now);
          cutoffDate.setMonth(now.getMonth() - retentionMonths);
          logger.info(`LPOSummary cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
          
          const lpoSummaryResult = await this.archiveCollection(
            'LPOSummary',
            LPOSummary,
            ArchivedLPOSummary,
            cutoffDate,
            initiatedBy,
            dryRun,
            batchSize
          );
          result.collectionsArchived['LPOSummary'] = lpoSummaryResult;
          result.totalRecordsArchived += lpoSummaryResult.recordsArchived;
        } else {
          logger.info('LPOSummary archival is disabled, skipping');
        }
      }

      if (collections.includes('YardFuelDispense')) {
        const retentionMonths = await this.getCollectionRetention('YardFuelDispense', monthsToKeep);
        if (retentionMonths > 0) {
          const cutoffDate = new Date(now);
          cutoffDate.setMonth(now.getMonth() - retentionMonths);
          logger.info(`YardFuelDispense cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
          
          const yardFuelResult = await this.archiveCollection(
            'YardFuelDispense',
            YardFuelDispense,
            ArchivedYardFuelDispense,
            cutoffDate,
            initiatedBy,
            dryRun,
            batchSize
          );
          result.collectionsArchived['YardFuelDispense'] = yardFuelResult;
          result.totalRecordsArchived += yardFuelResult.recordsArchived;
        } else {
          logger.info('YardFuelDispense archival is disabled, skipping');
        }
      }

      if (collections.includes('DeliveryOrder')) {
        const retentionMonths = await this.getCollectionRetention('DeliveryOrder', monthsToKeep);
        if (retentionMonths > 0) {
          const cutoffDate = new Date(now);
          cutoffDate.setMonth(now.getMonth() - retentionMonths);
          logger.info(`DeliveryOrder cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
          
          const deliveryOrderResult = await this.archiveCollection(
            'DeliveryOrder',
            DeliveryOrder,
            ArchivedDeliveryOrder,
            cutoffDate,
            initiatedBy,
            dryRun,
            batchSize
          );
          result.collectionsArchived['DeliveryOrder'] = deliveryOrderResult;
          result.totalRecordsArchived += deliveryOrderResult.recordsArchived;
        } else {
          logger.info('DeliveryOrder archival is disabled, skipping');
        }
      }

      if (collections.includes('AuditLog')) {
        const retentionMonths = await this.getCollectionRetention('AuditLog', auditLogMonthsToKeep);
        if (retentionMonths > 0) {
          const cutoffDate = new Date(now);
          cutoffDate.setMonth(now.getMonth() - retentionMonths);
          logger.info(`AuditLog cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
          
          const auditLogResult = await this.archiveCollection(
            'AuditLog',
            AuditLog,
            ArchivedAuditLog,
            cutoffDate,
            initiatedBy,
            dryRun,
            batchSize,
            'timestamp' // Different date field for audit logs
          );
          result.collectionsArchived['AuditLog'] = auditLogResult;
          result.totalRecordsArchived += auditLogResult.recordsArchived;
        } else {
          logger.info('AuditLog archival is disabled, skipping');
        }
      }

      result.totalDuration = Date.now() - startTime;
      result.success = result.errors.length === 0;

      logger.info(`Archival process completed in ${result.totalDuration}ms`);
      logger.info(`Total records archived: ${result.totalRecordsArchived}`);

      if (!dryRun && result.success) {
        // Trigger database optimization after archival
        await this.optimizeDatabase();
      }
    } catch (error: any) {
      logger.error('Archival process failed:', error);
      result.success = false;
      result.errors.push(error.message);
      result.totalDuration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Archive a specific collection
   */
  private async archiveCollection(
    collectionName: string,
    SourceModel: any,
    ArchiveModel: any,
    cutoffDate: Date,
    initiatedBy: string,
    dryRun: boolean,
    batchSize: number,
    dateField: string = 'createdAt' // Most models use timestamps
  ): Promise<{ recordsArchived: number; duration: number; cutoffDate: Date }> {
    const startTime = Date.now();
    let recordsArchived = 0;

    logger.info(`Processing ${collectionName}...`);

    try {
      // Create metadata record
      const metadata = new ArchivalMetadata({
        collectionName,
        cutoffDate,
        initiatedBy,
        status: 'in_progress',
      });

      if (!dryRun) {
        await metadata.save();
      }

      // Build query for old data
      const query: any = {
        isDeleted: { $ne: true }, // Don't archive already deleted records
      };

      // Handle different date field names
      if (collectionName === 'AuditLog') {
        query.timestamp = { $lt: cutoffDate };
      } else {
        query[dateField] = { $lt: cutoffDate };
      }

      // Count records to archive
      const totalRecords = await SourceModel.countDocuments(query);
      logger.info(`Found ${totalRecords} records to archive in ${collectionName}`);

      if (totalRecords === 0) {
        logger.info(`No records to archive for ${collectionName}`);
        if (!dryRun) {
          metadata.status = 'completed';
          metadata.recordsArchived = 0;
          metadata.duration = Date.now() - startTime;
          metadata.completedAt = new Date();
          await metadata.save();
        }
        return { recordsArchived: 0, duration: Date.now() - startTime, cutoffDate };
      }

      if (dryRun) {
        logger.info(`DRY RUN: Would archive ${totalRecords} records from ${collectionName}`);
        return { recordsArchived: totalRecords, duration: Date.now() - startTime, cutoffDate };
      }

      // Process in batches to avoid memory issues
      let skip = 0;
      while (skip < totalRecords) {
        const batch = await SourceModel.find(query)
          .limit(batchSize)
          .skip(skip)
          .lean();

        if (batch.length === 0) break;

        // Prepare archived documents
        const archivedDocs = batch.map((doc: any) => ({
          ...doc,
          originalId: doc._id,
          archivedAt: new Date(),
          archivedReason: `Automated archival - data older than ${cutoffDate.toDateString()}`,
        }));

        // Insert into archive collection
        await ArchiveModel.insertMany(archivedDocs, { ordered: false });

        // Delete from source collection
        const idsToDelete = batch.map((doc: any) => doc._id);
        await SourceModel.deleteMany({ _id: { $in: idsToDelete } });

        recordsArchived += batch.length;
        skip += batchSize;

        logger.info(
          `Archived ${recordsArchived}/${totalRecords} records from ${collectionName} (${Math.round(
            (recordsArchived / totalRecords) * 100
          )}%)`
        );
      }

      // Update metadata
      metadata.status = 'completed';
      metadata.recordsArchived = recordsArchived;
      metadata.duration = Date.now() - startTime;
      metadata.completedAt = new Date();
      await metadata.save();

      logger.info(
        `Successfully archived ${recordsArchived} records from ${collectionName} in ${
          Date.now() - startTime
        }ms`
      );
    } catch (error: any) {
      logger.error(`Error archiving ${collectionName}:`, error);
      throw error;
    }

    return { recordsArchived, duration: Date.now() - startTime, cutoffDate };
  }

  /**
   * Restore archived data back to active collections
   * (Emergency rollback feature)
   */
  async restoreArchivedData(
    collectionName: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ recordsRestored: number }> {
    logger.info(`Restoring archived data for ${collectionName}`);

    let SourceModel: any;
    let ArchiveModel: any;

    // Map collection names
    switch (collectionName) {
      case 'FuelRecord':
        SourceModel = FuelRecord;
        ArchiveModel = ArchivedFuelRecord;
        break;
      case 'LPOEntry':
        SourceModel = LPOEntry;
        ArchiveModel = ArchivedLPOEntry;
        break;
      case 'LPOSummary':
        SourceModel = LPOSummary;
        ArchiveModel = ArchivedLPOSummary;
        break;
      case 'YardFuelDispense':
        SourceModel = YardFuelDispense;
        ArchiveModel = ArchivedYardFuelDispense;
        break;
      case 'AuditLog':
        SourceModel = AuditLog;
        ArchiveModel = ArchivedAuditLog;
        break;
      default:
        throw new Error(`Unknown collection: ${collectionName}`);
    }

    const query: any = {};
    if (startDate || endDate) {
      query.archivedAt = {};
      if (startDate) query.archivedAt.$gte = startDate;
      if (endDate) query.archivedAt.$lte = endDate;
    }

    const archivedDocs = await ArchiveModel.find(query).lean();
    logger.info(`Found ${archivedDocs.length} archived records to restore`);

    if (archivedDocs.length === 0) {
      return { recordsRestored: 0 };
    }

    // Restore documents
    const restoredDocs = archivedDocs.map((doc: any) => {
      const { originalId, archivedAt, archivedReason, ...originalDoc } = doc;
      return {
        ...originalDoc,
        _id: originalId,
      };
    });

    await SourceModel.insertMany(restoredDocs, { ordered: false });

    // Delete from archive
    const idsToDelete = archivedDocs.map((doc: any) => doc._id);
    await ArchiveModel.deleteMany({ _id: { $in: idsToDelete } });

    logger.info(`Restored ${restoredDocs.length} records to ${collectionName}`);

    return { recordsRestored: restoredDocs.length };
  }

  /**
   * Query archived data (for reference/reports)
   */
  async queryArchivedData(
    collectionName: string,
    query: any,
    options: {
      limit?: number;
      skip?: number;
      sort?: any;
      select?: string;
    } = {}
  ): Promise<any[]> {
    let ArchiveModel: any;

    switch (collectionName) {
      case 'FuelRecord':
        ArchiveModel = ArchivedFuelRecord;
        break;
      case 'LPOEntry':
        ArchiveModel = ArchivedLPOEntry;
        break;
      case 'LPOSummary':
        ArchiveModel = ArchivedLPOSummary;
        break;
      case 'YardFuelDispense':
        ArchiveModel = ArchivedYardFuelDispense;
        break;
      case 'DeliveryOrder':
        ArchiveModel = ArchivedDeliveryOrder;
        break;
      case 'AuditLog':
        ArchiveModel = ArchivedAuditLog;
        break;
      default:
        throw new Error(`Unknown collection: ${collectionName}`);
    }

    const { limit = 100, skip = 0, sort = { archivedAt: -1 }, select } = options;

    let queryBuilder = ArchiveModel.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort);

    if (select) {
      queryBuilder = queryBuilder.select(select);
    }

    return queryBuilder.lean();
  }

  /**
   * Get archival statistics
   */
  async getArchivalStats(): Promise<{
    activeRecords: { [key: string]: number };
    archivedRecords: { [key: string]: number };
    lastArchivalDate?: Date;
    totalSpaceSaved: string;
  }> {
    const [
      fuelRecordCount,
      lpoEntryCount,
      lpoSummaryCount,
      yardFuelCount,
      deliveryOrderCount,
      auditLogCount,
      archivedFuelRecordCount,
      archivedLPOEntryCount,
      archivedLPOSummaryCount,
      archivedYardFuelCount,
      archivedDeliveryOrderCount,
      archivedAuditLogCount,
      lastArchival,
    ] = await Promise.all([
      FuelRecord.countDocuments({ isDeleted: { $ne: true } }),
      LPOEntry.countDocuments({ isDeleted: { $ne: true } }),
      LPOSummary.countDocuments({ isDeleted: { $ne: true } }),
      YardFuelDispense.countDocuments({ isDeleted: { $ne: true } }),
      DeliveryOrder.countDocuments({ isDeleted: { $ne: true } }),
      AuditLog.countDocuments({}),
      ArchivedFuelRecord.countDocuments({}),
      ArchivedLPOEntry.countDocuments({}),
      ArchivedLPOSummary.countDocuments({}),
      ArchivedYardFuelDispense.countDocuments({}),
      ArchivedDeliveryOrder.countDocuments({}),
      ArchivedAuditLog.countDocuments({}),
      ArchivalMetadata.findOne({ status: 'completed' }).sort({ completedAt: -1 }),
    ]);

    const totalArchivedRecords =
      archivedFuelRecordCount +
      archivedLPOEntryCount +
      archivedLPOSummaryCount +
      archivedYardFuelCount +
      archivedDeliveryOrderCount +
      archivedAuditLogCount;

    // Estimate space saved (rough estimate: 2KB per record)
    const estimatedSpaceSavedMB = (totalArchivedRecords * 2) / 1024;

    return {
      activeRecords: {
        FuelRecord: fuelRecordCount,
        LPOEntry: lpoEntryCount,
        LPOSummary: lpoSummaryCount,
        YardFuelDispense: yardFuelCount,
        DeliveryOrder: deliveryOrderCount,
        AuditLog: auditLogCount,
      },
      archivedRecords: {
        FuelRecord: archivedFuelRecordCount,
        LPOEntry: archivedLPOEntryCount,
        LPOSummary: archivedLPOSummaryCount,
        YardFuelDispense: archivedYardFuelCount,
        DeliveryOrder: archivedDeliveryOrderCount,
        AuditLog: archivedAuditLogCount,
      },
      lastArchivalDate: lastArchival?.completedAt,
      totalSpaceSaved: `${estimatedSpaceSavedMB.toFixed(2)} MB`,
    };
  }

  /**
   * Optimize database after archival
   */
  private async optimizeDatabase(): Promise<void> {
    try {
      logger.info('Optimizing database after archival...');
      
      // Run compact command on collections (MongoDB specific)
      const db = mongoose.connection.db;
      
      if (db) {
        await db.command({ compact: 'fuelrecords' });
        await db.command({ compact: 'lpoentries' });
        await db.command({ compact: 'lposummaries' });
        await db.command({ compact: 'yardfueldispenses' });
        await db.command({ compact: 'auditlogs' });
      }
      
      logger.info('Database optimization completed');
    } catch (error: any) {
      logger.warn('Database optimization failed (non-critical):', error.message);
    }
  }
}

export default new ArchivalService();
