import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  DeliveryOrder,
  LPOSummary,
  FuelRecord,
  User,
  YardFuelDispense,
  DriverAccountEntry
} from '../models';
import { AuditService } from '../utils/auditService';
import logger from '../utils/logger';
import { emitDataChange } from '../services/websocket';

// Model map for dynamic access
const MODELS_MAP: Record<string, any> = {
  delivery_orders: DeliveryOrder,
  lpo_summaries: LPOSummary,
  fuel_records: FuelRecord,
  users: User,
  yard_dispenses: YardFuelDispense,
  driver_accounts: DriverAccountEntry,
};

/**
 * Get all deleted items by type
 */
export const getDeletedItems = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.params;
    const { dateFrom, dateTo, deletedBy, page = 1, limit = 50 } = req.query;

    const Model = MODELS_MAP[type];
    if (!Model) {
      res.status(400).json({ success: false, message: 'Invalid resource type' });
      return;
    }

    const filter: any = { isDeleted: true };

    if (dateFrom || dateTo) {
      filter.deletedAt = {};
      if (dateFrom) filter.deletedAt.$gte = new Date(dateFrom as string);
      if (dateTo) filter.deletedAt.$lte = new Date(dateTo as string);
    }

    if (deletedBy) {
      filter.deletedBy = deletedBy;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Model.find(filter)
        .sort({ deletedAt: -1 })
        .limit(Number(limit))
        .skip(skip)
        .lean(),
      Model.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    logger.error('Error getting deleted items:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get trash statistics
 */
export const getTrashStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await Promise.all(
      Object.entries(MODELS_MAP).map(async ([type, Model]) => {
        const [count, oldestItem] = await Promise.all([
          Model.countDocuments({ isDeleted: true }),
          Model.findOne({ isDeleted: true })
            .sort({ deletedAt: 1 })
            .select('deletedAt')
            .lean(),
        ]);
        return {
          type,
          count,
          oldestItem: oldestItem ? { deletedAt: oldestItem.deletedAt } : null,
        };
      })
    );

    const totalItems = stats.reduce((sum, s) => sum + s.count, 0);

    res.status(200).json({
      success: true,
      data: {
        stats,
        totalItems,
      },
    });
  } catch (error: any) {
    logger.error('Error getting trash stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Restore a deleted item
 */
export const restoreItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;

    const Model = MODELS_MAP[type];
    if (!Model) {
      res.status(400).json({ success: false, message: 'Invalid resource type' });
      return;
    }

    const item = await Model.findById(id);
    if (!item || !item.isDeleted) {
      res.status(404).json({ success: false, message: 'Item not found in trash' });
      return;
    }

    item.isDeleted = false;
    item.deletedAt = undefined;
    item.restoredAt = new Date();
    item.restoredBy = req.user?.username;
    await item.save();

    // Log the restoration
    await AuditService.logRestore(
      req.user?.userId || '',
      req.user?.username || 'unknown',
      type,
      id,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Item restored successfully',
      data: item,
    });
    emitDataChange(type, 'update');
  } catch (error: any) {
    logger.error('Error restoring item:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Bulk restore items (Super Admin only)
 */
export const bulkRestore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, ids } = req.body;

    // Only super_admin can bulk restore
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can bulk restore items',
      });
      return;
    }

    const Model = MODELS_MAP[type];
    if (!Model) {
      res.status(400).json({ success: false, message: 'Invalid resource type' });
      return;
    }

    const result = await Model.updateMany(
      { _id: { $in: ids }, isDeleted: true },
      {
        isDeleted: false,
        deletedAt: null,
        restoredAt: new Date(),
        restoredBy: req.user.username,
      }
    );

    // Log bulk restoration
    await AuditService.logBulkOperation(
      req.user.userId,
      req.user.username,
      type,
      'restore',
      result.modifiedCount,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} items restored`,
      data: { restoredCount: result.modifiedCount },
    });
    emitDataChange(type, 'update');
  } catch (error: any) {
    logger.error('Error bulk restoring items:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Permanently delete (Super Admin only)
 */
export const permanentDelete = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;

    // Only super_admin can permanently delete
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can permanently delete items',
      });
      return;
    }

    const Model = MODELS_MAP[type];
    if (!Model) {
      res.status(400).json({ success: false, message: 'Invalid resource type' });
      return;
    }

    // Require item to be soft-deleted first
    const item = await Model.findOne({ _id: id, isDeleted: true }).lean();
    if (!item) {
      res.status(404).json({
        success: false,
        message: 'Item not found in trash. Items must be soft-deleted before permanent deletion.',
      });
      return;
    }

    // Actually delete from database
    await Model.deleteOne({ _id: id });

    // Log permanent deletion
    await AuditService.logPermanentDelete(
      req.user.userId,
      req.user.username,
      type,
      id,
      item,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Item permanently deleted',
    });
    emitDataChange(type, 'delete');
  } catch (error: any) {
    logger.error('Error permanently deleting item:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Bulk permanent delete (Super Admin only)
 */
export const bulkPermanentDelete = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, ids } = req.body;

    // Only super_admin can bulk permanent delete
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can bulk permanent delete items',
      });
      return;
    }

    const Model = MODELS_MAP[type];
    if (!Model) {
      res.status(400).json({ success: false, message: 'Invalid resource type' });
      return;
    }

    // Only delete items that are already soft-deleted
    const result = await Model.deleteMany({ _id: { $in: ids }, isDeleted: true });

    // Log bulk permanent deletion
    await AuditService.logBulkOperation(
      req.user.userId,
      req.user.username,
      type,
      'permanent_delete',
      result.deletedCount,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} items permanently deleted`,
      data: { deletedCount: result.deletedCount },
    });
    emitDataChange(type, 'delete');
  } catch (error: any) {
    logger.error('Error bulk permanent deleting items:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Empty trash for a specific type (Super Admin only)
 */
export const emptyTrash = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    // Only super_admin can empty trash
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can empty trash',
      });
      return;
    }

    const Model = MODELS_MAP[type];
    if (!Model) {
      res.status(400).json({ success: false, message: 'Invalid resource type' });
      return;
    }

    const result = await Model.deleteMany({ isDeleted: true });

    // Log empty trash operation
    await AuditService.logBulkOperation(
      req.user.userId,
      req.user.username,
      type,
      'empty_trash',
      result.deletedCount,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Trash emptied. ${result.deletedCount} items permanently deleted.`,
      data: { deletedCount: result.deletedCount },
    });
    emitDataChange(type, 'delete');
  } catch (error: any) {
    logger.error('Error emptying trash:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Types whose lifecycle is cancellation, not deletion
const CANCELLABLE_TYPES = new Set(['fuel_records', 'delivery_orders', 'lpo_summaries']);

/**
 * Get cancelled items (fuel_records, delivery_orders, lpo_summaries only)
 * LPO returns one row per cancelled entry (truckNo + lpoNo)
 */
export const getCancelledItems = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.params;
    const { dateFrom, dateTo, page = 1, limit = 50 } = req.query;

    if (!CANCELLABLE_TYPES.has(type)) {
      res.status(400).json({ success: false, message: 'Resource type does not support cancellation view' });
      return;
    }

    const skip = (Number(page) - 1) * Number(limit);

    if (type === 'lpo_summaries') {
      const pipeline: any[] = [
        { $match: { isDeleted: false } },
        { $unwind: { path: '$entries', includeArrayIndex: 'entryIndex' } },
        { $match: { 'entries.isCancelled': true } },
      ];

      if (dateFrom || dateTo) {
        const df: any = {};
        if (dateFrom) df.$gte = new Date(dateFrom as string);
        if (dateTo) df.$lte = new Date(dateTo as string);
        pipeline.push({ $match: { 'entries.cancelledAt': df } });
      }

      pipeline.push({ $sort: { 'entries.cancelledAt': -1 } });
      pipeline.push({
        $facet: {
          items: [
            { $skip: skip },
            { $limit: Number(limit) },
            {
              $project: {
                _id: 1,
                lpoNo: 1,
                truckNo: '$entries.truckNo',
                cancelledAt: '$entries.cancelledAt',
                cancellationPoint: '$entries.cancellationPoint',
                cancellationReason: '$entries.cancellationReason',
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      });

      const [result] = await LPOSummary.aggregate(pipeline);
      const items = result?.items || [];
      const total = result?.total?.[0]?.count || 0;

      res.status(200).json({
        success: true,
        data: items,
        pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
      });
      return;
    }

    // fuel_records and delivery_orders
    const Model = MODELS_MAP[type];
    const filter: any = { isCancelled: true, isDeleted: false };

    if (dateFrom || dateTo) {
      filter.cancelledAt = {};
      if (dateFrom) filter.cancelledAt.$gte = new Date(dateFrom as string);
      if (dateTo) filter.cancelledAt.$lte = new Date(dateTo as string);
    }

    const [items, total] = await Promise.all([
      Model.find(filter).sort({ cancelledAt: -1 }).limit(Number(limit)).skip(skip).lean(),
      Model.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: items,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error: any) {
    logger.error('Error getting cancelled items:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Uncancel a single item (fuel_records, delivery_orders, lpo_summaries)
 * For lpo_summaries pass { truckNo } in the request body to identify the entry
 */
export const uncancelItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;
    const { truckNo } = req.body;
    const username = req.user?.username;
    if (!username) { res.status(401).json({ success: false, message: 'Authentication required' }); return; }

    if (!CANCELLABLE_TYPES.has(type)) {
      res.status(400).json({ success: false, message: 'Resource type does not support uncancel' });
      return;
    }

    if (type === 'lpo_summaries') {
      if (!truckNo) { res.status(400).json({ success: false, message: 'truckNo is required for LPO entry uncancel' }); return; }

      const lpo = await LPOSummary.findOne({ _id: id, isDeleted: false });
      if (!lpo) { res.status(404).json({ success: false, message: 'LPO not found' }); return; }

      const entryIndex = (lpo as any).entries.findIndex(
        (e: any) => e.truckNo === truckNo && e.isCancelled === true
      );
      if (entryIndex === -1) {
        res.status(404).json({ success: false, message: 'Cancelled entry not found in this LPO' });
        return;
      }

      (lpo as any).entries[entryIndex].isCancelled = false;
      (lpo as any).entries[entryIndex].cancellationPoint = undefined;
      (lpo as any).entries[entryIndex].cancellationReason = undefined;
      (lpo as any).entries[entryIndex].cancelledAt = undefined;
      await (lpo as any).save();

      await AuditService.logUpdate(
        req.user?.userId || 'system', username,
        'LPOSummary', id,
        { isCancelled: true, truckNo },
        { isCancelled: false, truckNo },
        req.ip
      );

      logger.info(`LPO ${id} entry ${truckNo} uncancelled by ${username}`);
      res.status(200).json({ success: true, message: 'LPO entry uncancelled successfully' });
      emitDataChange('lpo_summaries', 'update');
      return;
    }

    if (type === 'fuel_records') {
      const record = await FuelRecord.findOne({ _id: id, isCancelled: true, isDeleted: false });
      if (!record) { res.status(404).json({ success: false, message: 'Cancelled fuel record not found' }); return; }

      await FuelRecord.findOneAndUpdate(
        { _id: id },
        { isCancelled: false, uncancelledAt: new Date(), uncancelledBy: username, $unset: { cancelledAt: '', cancelledBy: '', cancellationReason: '' } }
      );

      await AuditService.logUpdate(
        req.user?.userId || 'system', username,
        'FuelRecord', id,
        { isCancelled: true },
        { isCancelled: false, uncancelledBy: username },
        req.ip
      );

      logger.info(`Fuel record ${id} uncancelled by ${username} via trash`);
      res.status(200).json({ success: true, message: 'Fuel record uncancelled successfully' });
      emitDataChange('fuel_records', 'update');
      return;
    }

    if (type === 'delivery_orders') {
      const order = await DeliveryOrder.findOne({ _id: id, isCancelled: true, isDeleted: false });
      if (!order) { res.status(404).json({ success: false, message: 'Cancelled delivery order not found' }); return; }

      await DeliveryOrder.findOneAndUpdate(
        { _id: id },
        { isCancelled: false, status: 'active', uncancelledAt: new Date(), uncancelledBy: username, $unset: { cancelledAt: '', cancelledBy: '', cancellationReason: '' } }
      );

      await AuditService.logUpdate(
        req.user?.userId || 'system', username,
        'DeliveryOrder', id,
        { isCancelled: true },
        { isCancelled: false, uncancelledBy: username },
        req.ip
      );

      logger.info(`Delivery order ${id} uncancelled by ${username} via trash`);
      res.status(200).json({ success: true, message: 'Delivery order uncancelled successfully' });
      emitDataChange('delivery_orders', 'update');
      return;
    }
  } catch (error: any) {
    logger.error('Error uncancelling item:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get retention settings
 */
export const getRetentionSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get retention settings from SystemConfig
    const SystemConfig = (await import('../models/SystemConfig')).SystemConfig;
    const systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    const retentionSettings = {
      retentionDays: systemConfig?.systemSettings?.data?.trashRetention || 90,
      autoCleanupEnabled: systemConfig?.systemSettings?.data?.autoCleanupEnabled || false,
      backupRetention: systemConfig?.systemSettings?.data?.backupRetention || 30,
      archivalMonths: systemConfig?.systemSettings?.data?.archivalMonths || 6,
    };

    res.status(200).json({
      success: true,
      data: retentionSettings,
    });
  } catch (error: any) {
    logger.error('Error getting retention settings:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Update retention settings (Super Admin only)
 */
export const updateRetentionSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { retentionDays, autoCleanupEnabled, backupRetention, archivalMonths } = req.body;

    if (req.user?.role !== 'super_admin') {
      res.status(403).json({ success: false, message: 'Unauthorized - Super Admin only' });
      return;
    }

    // Update retention settings in SystemConfig
    const SystemConfig = (await import('../models/SystemConfig')).SystemConfig;
    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      res.status(404).json({ success: false, message: 'System configuration not found' });
      return;
    }

    const oldSettings = systemConfig.systemSettings?.data;

    // Update data retention settings
    if (systemConfig.systemSettings?.data) {
      if (retentionDays !== undefined) systemConfig.systemSettings.data.trashRetention = retentionDays;
      if (autoCleanupEnabled !== undefined) systemConfig.systemSettings.data.autoCleanupEnabled = autoCleanupEnabled;
      if (backupRetention !== undefined) systemConfig.systemSettings.data.backupRetention = backupRetention;
      if (archivalMonths !== undefined) systemConfig.systemSettings.data.archivalMonths = archivalMonths;
    }

    systemConfig.lastUpdatedBy = req.user.username;
    await systemConfig.save();

    // Log config change
    await AuditService.logConfigChange(
      req.user.userId,
      req.user.username,
      'retention_policy',
      oldSettings,
      systemConfig.systemSettings?.data,
      req.ip
    );

    logger.info(`Retention policy updated by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Retention policy updated successfully',
      data: {
        retentionDays: systemConfig.systemSettings?.data?.trashRetention,
        autoCleanupEnabled: systemConfig.systemSettings?.data?.autoCleanupEnabled,
        backupRetention: systemConfig.systemSettings?.data?.backupRetention,
        archivalMonths: systemConfig.systemSettings?.data?.archivalMonths,
      },
    });
  } catch (error: any) {
    logger.error('Error updating retention settings:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
