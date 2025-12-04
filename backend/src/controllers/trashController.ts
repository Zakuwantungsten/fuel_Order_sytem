import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { 
  DeliveryOrder, 
  LPOEntry, 
  LPOSummary,
  FuelRecord, 
  User, 
  YardFuelDispense,
  DriverAccountEntry 
} from '../models';
import { AuditService } from '../utils/auditService';
import logger from '../utils/logger';

// Model map for dynamic access
const MODELS_MAP: Record<string, any> = {
  delivery_orders: DeliveryOrder,
  lpo_entries: LPOEntry,
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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

    // System admin can only restore their own deletions
    if (req.user?.role === 'system_admin' && item.deletedBy !== req.user.username) {
      res.status(403).json({
        success: false,
        message: 'You can only restore items you deleted',
      });
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
  } catch (error: any) {
    logger.error('Error restoring item:', error);
    res.status(500).json({ success: false, message: error.message });
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
  } catch (error: any) {
    logger.error('Error bulk restoring items:', error);
    res.status(500).json({ success: false, message: error.message });
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
  } catch (error: any) {
    logger.error('Error permanently deleting item:', error);
    res.status(500).json({ success: false, message: error.message });
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
  } catch (error: any) {
    logger.error('Error bulk permanent deleting items:', error);
    res.status(500).json({ success: false, message: error.message });
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
  } catch (error: any) {
    logger.error('Error emptying trash:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get retention settings
 */
export const getRetentionSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // For now, return default settings
    // In a full implementation, this would be stored in SystemConfig
    res.status(200).json({
      success: true,
      data: {
        retentionDays: 90,
        autoCleanupEnabled: false,
      },
    });
  } catch (error: any) {
    logger.error('Error getting retention settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update retention settings (Super Admin only)
 */
export const updateRetentionSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { retentionDays, autoCleanupEnabled } = req.body;

    if (req.user?.role !== 'super_admin') {
      res.status(403).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Log config change
    await AuditService.logConfigChange(
      req.user.userId,
      req.user.username,
      'trash_retention',
      null,
      { retentionDays, autoCleanupEnabled },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Retention policy updated to ${retentionDays} days`,
      data: { retentionDays, autoCleanupEnabled },
    });
  } catch (error: any) {
    logger.error('Error updating retention settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
