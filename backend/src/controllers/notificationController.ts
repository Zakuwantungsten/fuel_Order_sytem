import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Notification } from '../models/Notification';
import { FuelRecord } from '../models/FuelRecord';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Get all notifications for the current user
 */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, limit = 50 } = req.query;
    const userRole = req.user?.role || 'user';

    const query: any = {
      recipients: { $in: [userRole, req.user?.userId] },
      isDeleted: false,
    };

    if (status) {
      query.status = status;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .lean();

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipients: { $in: [userRole, req.user?.userId] },
      isDeleted: false,
      status: 'pending',
      readBy: { $ne: req.user?.userId },
    });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get notification count (for badge)
 */
export const getNotificationCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role || 'user';

    const count = await Notification.countDocuments({
      recipients: { $in: [userRole, req.user?.userId] },
      isDeleted: false,
      status: 'pending',
      readBy: { $ne: req.user?.userId },
    });

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const notification = await Notification.findById(id);
    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    // Add user to readBy array if not already there
    if (!notification.readBy.includes(userId!)) {
      notification.readBy.push(userId!);
      notification.isRead = true;
      await notification.save();
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Dismiss notification
 */
export const dismissNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { status: 'dismissed', isRead: true },
      { new: true }
    );

    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    logger.info(`Notification ${id} dismissed by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Notification dismissed',
      data: notification,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Resolve notification (automatically when admin fixes the issue)
 */
export const resolveNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: req.user?.username,
        isRead: true,
      },
      { new: true }
    );

    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    logger.info(`Notification ${id} resolved by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Notification resolved',
      data: notification,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create notification for missing configuration
 */
export const createMissingConfigNotification = async (
  fuelRecordId: string,
  missingFields: ('totalLiters' | 'extraFuel')[],
  metadata: {
    doNumber: string;
    truckNo: string;
    destination?: string;
    truckSuffix?: string;
  },
  createdBy: string
): Promise<void> => {
  try {
    const type =
      missingFields.length === 2
        ? 'both'
        : missingFields.includes('totalLiters')
        ? 'missing_total_liters'
        : 'missing_extra_fuel';

    let title = '';
    let message = '';

    if (type === 'both') {
      title = `Configuration Required: ${metadata.doNumber}`;
      message = `Fuel record needs both route total liters and truck batch assignment for ${metadata.truckNo}`;
    } else if (type === 'missing_total_liters') {
      title = `Route Configuration Required: ${metadata.doNumber}`;
      message = `Route "${metadata.destination}" needs total liters assignment`;
    } else {
      title = `Truck Batch Required: ${metadata.doNumber}`;
      message = `Truck suffix "${metadata.truckSuffix}" (${metadata.truckNo}) needs batch assignment`;
    }

    await Notification.create({
      type,
      title,
      message,
      relatedModel: 'FuelRecord',
      relatedId: fuelRecordId,
      metadata: {
        fuelRecordId,
        doNumber: metadata.doNumber,
        truckNo: metadata.truckNo,
        destination: metadata.destination,
        truckSuffix: metadata.truckSuffix,
        missingFields,
      },
      recipients: ['admin', 'super_admin'],
      createdBy,
    });

    logger.info(`Created notification for fuel record ${fuelRecordId} - missing: ${missingFields.join(', ')}`);
  } catch (error) {
    logger.error('Failed to create notification:', error);
    // Don't throw - notification failure shouldn't break fuel record creation
  }
};

/**
 * Create notification for unlinked EXPORT DO (no matching fuel record found)
 */
export const createUnlinkedExportDONotification = async (
  deliveryOrderId: string,
  metadata: {
    doNumber: string;
    truckNo: string;
    destination?: string;
    loadingPoint?: string;
  },
  createdBy: string
): Promise<void> => {
  try {
    const title = `Unlinked Return DO: ${metadata.doNumber}`;
    const message = `Return DO for truck ${metadata.truckNo} has no matching fuel record. The truck number may be incorrect or the going journey was not recorded.`;

    await Notification.create({
      type: 'unlinked_export_do',
      title,
      message,
      relatedModel: 'DeliveryOrder',
      relatedId: deliveryOrderId,
      metadata: {
        doNumber: metadata.doNumber,
        truckNo: metadata.truckNo,
        destination: metadata.destination,
        loadingPoint: metadata.loadingPoint,
        importOrExport: 'EXPORT',
        deliveryOrderId,
      },
      recipients: ['fuel_order_maker'], // Only fuel order maker should see this to follow up and re-link
      createdBy,
    });

    logger.info(`Created notification for unlinked EXPORT DO ${metadata.doNumber} (truck: ${metadata.truckNo})`);
  } catch (error) {
    logger.error('Failed to create unlinked EXPORT DO notification:', error);
    // Don't throw - notification failure shouldn't break DO creation
  }
};

/**
 * Auto-resolve unlinked DO notifications when DO is linked to a fuel record
 */
export const resolveUnlinkedDONotification = async (
  deliveryOrderId: string,
  resolvedBy: string
): Promise<number> => {
  try {
    const result = await Notification.updateMany(
      {
        relatedModel: 'DeliveryOrder',
        relatedId: deliveryOrderId,
        type: 'unlinked_export_do',
        status: 'pending',
      },
      {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy,
          isRead: true,
        },
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Resolved ${result.modifiedCount} unlinked DO notification(s) for DO ${deliveryOrderId}`);
    }
    
    return result.modifiedCount;
  } catch (error) {
    logger.error('Failed to resolve unlinked DO notification:', error);
    return 0;
  }
};

/**
 * Auto-resolve notifications when fuel record is updated
 */
export const autoResolveNotifications = async (fuelRecordId: string, resolvedBy: string): Promise<void> => {
  try {
    // Find all pending notifications for this fuel record
    const notifications = await Notification.find({
      relatedModel: 'FuelRecord',
      relatedId: fuelRecordId,
      status: 'pending',
      isDeleted: false,
    });

    // Check if the fuel record is now complete
    const fuelRecord = await FuelRecord.findById(fuelRecordId);
    if (!fuelRecord) return;

    const isComplete = fuelRecord.totalLts !== null && fuelRecord.extra !== null;

    if (isComplete) {
      // Resolve all notifications for this fuel record
      await Notification.updateMany(
        {
          relatedModel: 'FuelRecord',
          relatedId: fuelRecordId,
          status: 'pending',
        },
        {
          $set: {
            status: 'resolved',
            resolvedAt: new Date(),
            resolvedBy,
            isRead: true,
          },
        }
      );

      logger.info(`Auto-resolved ${notifications.length} notifications for fuel record ${fuelRecordId}`);
    }
  } catch (error) {
    logger.error('Failed to auto-resolve notifications:', error);
  }
};

export default {
  getNotifications,
  getNotificationCount,
  markAsRead,
  dismissNotification,
  resolveNotification,
  createMissingConfigNotification,
  createUnlinkedExportDONotification,
  resolveUnlinkedDONotification,
  autoResolveNotifications,
};
