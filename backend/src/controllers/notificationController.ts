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
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // First check if notification exists and user has access
    const notification = await Notification.findOne({
      _id: id,
      recipients: { $in: [userRole, userId] },
      isDeleted: false,
    });

    if (!notification) {
      logger.warn(`User ${req.user?.username} (role: ${userRole}) attempted to dismiss notification ${id} but was not found or user lacks access`);
      throw new ApiError(404, 'Notification not found or you do not have permission to dismiss it');
    }

    // Update the notification
    const updatedNotification = await Notification.findByIdAndUpdate(
      id,
      { status: 'dismissed', isRead: true },
      { new: true }
    );

    logger.info(`Notification ${id} dismissed by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Notification dismissed',
      data: updatedNotification,
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
  createdBy: string,
  creatorRole?: string
): Promise<void> => {
  try {
    const type =
      missingFields.length === 2
        ? 'both'
        : missingFields.includes('totalLiters')
        ? 'missing_total_liters'
        : 'missing_extra_fuel';

    const isAdminCreator = creatorRole === 'admin' || creatorRole === 'super_admin';
    let title = '';
    let message = '';
    let recipients: string[] = [];

    if (isAdminCreator) {
      // Admin created this - send action-oriented message only to them
      recipients = [creatorRole];
      
      if (type === 'both') {
        title = `Action Required: Add Configuration for ${metadata.doNumber}`;
        message = `You need to add route total liters and truck batch configuration for ${metadata.truckNo}. The fuel record has been locked until configuration is complete.`;
      } else if (type === 'missing_total_liters') {
        title = `Action Required: Add Route Configuration`;
        message = `You need to add total liters configuration for route "${metadata.destination}". Please go to System Configuration > Routes to add this route.`;
      } else {
        title = `Action Required: Add Truck Batch`;
        message = `You need to assign truck suffix "${metadata.truckSuffix}" (${metadata.truckNo}) to a batch. Please go to System Configuration > Truck Batches.`;
      }
    } else {
      // Non-admin created this - notify all admins
      recipients = ['fuel_order_maker', 'admin', 'super_admin'];
      
      if (type === 'both') {
        title = `Configuration Required: ${metadata.doNumber}`;
        message = `Fuel record needs both route total liters and truck batch assignment for ${metadata.truckNo}`;
      } else if (type === 'missing_total_liters') {
        title = `Route Configuration Required: ${metadata.doNumber}`;
        message = `Route "${metadata.destination}" needs total liters assignment. Please contact admin to add this route configuration.`;
      } else {
        title = `Truck Batch Required: ${metadata.doNumber}`;
        message = `Truck suffix "${metadata.truckSuffix}" (${metadata.truckNo}) needs batch assignment. Please contact admin to add this configuration.`;
      }
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
        creatorRole: creatorRole || 'unknown',
      },
      recipients,
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

/**
 * Create notification when yard man records fuel (both linked and pending)
 */
export const createYardFuelRecordedNotification = async (
  yardFuelDispenseId: string,
  metadata: {
    truckNo: string;
    liters: number;
    yard: string;
    enteredBy: string;
    doNumber?: string;
    status: 'linked' | 'pending';
    notes?: string;
  },
  createdBy: string
): Promise<void> => {
  try {
    const title = metadata.status === 'linked' 
      ? `Yard Fuel Recorded: ${metadata.truckNo}`
      : `Yard Fuel Pending: ${metadata.truckNo}`;
    
    let message = metadata.status === 'linked'
      ? `${metadata.enteredBy} recorded ${metadata.liters}L for truck ${metadata.truckNo} at ${metadata.yard}. Linked to DO ${metadata.doNumber}.`
      : `${metadata.enteredBy} recorded ${metadata.liters}L for truck ${metadata.truckNo} at ${metadata.yard}. No active DO found - entry is pending linking.`;
    
    // Add notes to message if provided
    if (metadata.notes && metadata.notes.trim()) {
      message += ` Note: ${metadata.notes}`;
    }

    await Notification.create({
      type: 'yard_fuel_recorded',
      title,
      message,
      relatedModel: 'YardFuelDispense',
      relatedId: yardFuelDispenseId,
      metadata: {
        yardFuelDispenseId,
        truckNo: metadata.truckNo,
        liters: metadata.liters,
        yard: metadata.yard,
        enteredBy: metadata.enteredBy,
        doNumber: metadata.doNumber,
        notes: metadata.notes,
      },
      recipients: ['fuel_order_maker'],
      createdBy,
    });

    logger.info(`Created yard fuel recorded notification for truck ${metadata.truckNo} (${metadata.status})`);
  } catch (error) {
    logger.error('Failed to create yard fuel recorded notification:', error);
  }
};

/**
 * Create notification when truck is pending linking (no DO found)
 */
export const createTruckPendingLinkingNotification = async (
  yardFuelDispenseId: string,
  metadata: {
    truckNo: string;
    liters: number;
    yard: string;
    enteredBy: string;
    notes?: string;
  },
  createdBy: string
): Promise<void> => {
  try {
    const title = `Truck Pending Linking: ${metadata.truckNo}`;
    let message = `Truck ${metadata.truckNo} has ${metadata.liters}L recorded at ${metadata.yard} by ${metadata.enteredBy}, but no active DO was found. Please create the necessary DO and fuel record to link this entry.`;
    
    // Add notes to message if provided
    if (metadata.notes && metadata.notes.trim()) {
      message += ` Note: ${metadata.notes}`;
    }

    await Notification.create({
      type: 'truck_pending_linking',
      title,
      message,
      relatedModel: 'YardFuelDispense',
      relatedId: yardFuelDispenseId,
      metadata: {
        yardFuelDispenseId,
        truckNo: metadata.truckNo,
        liters: metadata.liters,
        yard: metadata.yard,
        enteredBy: metadata.enteredBy,
        notes: metadata.notes,
      },
      recipients: ['fuel_order_maker'],
      createdBy,
    });

    logger.info(`Created truck pending linking notification for truck ${metadata.truckNo}`);
  } catch (error) {
    logger.error('Failed to create truck pending linking notification:', error);
  }
};

/**
 * Create notification when fuel order maker rejects a truck entry
 */
export const createTruckEntryRejectedNotification = async (
  yardFuelDispenseId: string,
  metadata: {
    truckNo: string;
    liters: number;
    yard: string;
    enteredBy: string;
    rejectionReason: string;
    rejectedBy: string;
  },
  createdBy: string
): Promise<void> => {
  try {
    const title = `Truck Entry Rejected: ${metadata.truckNo}`;
    const message = `Your fuel entry for truck ${metadata.truckNo} (${metadata.liters}L at ${metadata.yard}) has been rejected by ${metadata.rejectedBy}. Reason: ${metadata.rejectionReason}. Please re-enter with the correct information.`;

    await Notification.create({
      type: 'truck_entry_rejected',
      title,
      message,
      relatedModel: 'YardFuelDispense',
      relatedId: yardFuelDispenseId,
      metadata: {
        yardFuelDispenseId,
        truckNo: metadata.truckNo,
        liters: metadata.liters,
        yard: metadata.yard,
        enteredBy: metadata.enteredBy,
        rejectionReason: metadata.rejectionReason,
        rejectedBy: metadata.rejectedBy,
      },
      recipients: [metadata.yard.toLowerCase().replace(' ', '_')], // Send to specific yard role
      createdBy,
    });

    logger.info(`Created truck entry rejected notification for truck ${metadata.truckNo} to ${metadata.yard}`);
  } catch (error) {
    logger.error('Failed to create truck entry rejected notification:', error);
  }
};

/**
 * Create notification when pending yard fuel entry gets successfully linked
 */
export const createYardFuelLinkedNotification = async (
  yardFuelDispenseId: string,
  metadata: {
    truckNo: string;
    liters: number;
    yard: string;
    enteredBy: string;
    doNumber: string;
  },
  createdBy: string
): Promise<void> => {
  try {
    const title = `Truck Successfully Linked: ${metadata.truckNo}`;
    const message = `Good news! Your pending fuel entry for truck ${metadata.truckNo} (${metadata.liters}L at ${metadata.yard}) has been successfully linked to DO ${metadata.doNumber}.`;

    await Notification.create({
      type: 'yard_fuel_recorded',
      title,
      message,
      relatedModel: 'YardFuelDispense',
      relatedId: yardFuelDispenseId,
      metadata: {
        yardFuelDispenseId,
        truckNo: metadata.truckNo,
        liters: metadata.liters,
        yard: metadata.yard,
        enteredBy: metadata.enteredBy,
        doNumber: metadata.doNumber,
      },
      recipients: [metadata.yard.toLowerCase().replace(' ', '_')], // Send to specific yard role
      createdBy,
    });

    logger.info(`Created yard fuel linked notification for truck ${metadata.truckNo}`);
  } catch (error) {
    logger.error('Failed to create yard fuel linked notification:', error);
  }
};

/**
 * Resolve pending yard fuel notifications when entry gets linked
 */
export const resolvePendingYardFuelNotifications = async (
  yardFuelDispenseId: string,
  resolvedBy: string
): Promise<number> => {
  try {
    const result = await Notification.updateMany(
      {
        relatedModel: 'YardFuelDispense',
        relatedId: yardFuelDispenseId,
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
      logger.info(`Resolved ${result.modifiedCount} pending yard fuel notification(s) for ${yardFuelDispenseId}`);
    }
    
    return result.modifiedCount;
  } catch (error) {
    logger.error('Failed to resolve pending yard fuel notifications:', error);
    return 0;
  }
};

/**
 * Create notification for bulk DO creation failures/skips
 */
export const createBulkDOFailureNotification = async (
  metadata: {
    totalAttempted: number;
    successCount: number;
    skippedCount: number;
    failedCount: number;
    skippedTrucks?: string[];
    failedTrucks?: string[];
    skippedReasons?: { truck: string; reason: string }[];
    failedReasons?: { truck: string; reason: string }[];
  },
  createdBy: string
): Promise<void> => {
  try {
    // Only create notification if there are failures or skips
    if (metadata.skippedCount === 0 && metadata.failedCount === 0) {
      return;
    }

    let title = 'Bulk DO Creation Issues';
    let message = `Bulk DO creation completed with ${metadata.successCount}/${metadata.totalAttempted} successful. `;

    // Add skip details
    if (metadata.skippedCount > 0) {
      message += `${metadata.skippedCount} skipped: `;
      if (metadata.skippedReasons && metadata.skippedReasons.length > 0) {
        const skipDetails = metadata.skippedReasons
          .map(s => `${s.truck} (${s.reason})`)
          .join(', ');
        message += skipDetails;
      } else if (metadata.skippedTrucks) {
        message += metadata.skippedTrucks.join(', ');
      }
      message += '. ';
    }

    // Add failure details
    if (metadata.failedCount > 0) {
      message += `${metadata.failedCount} failed: `;
      if (metadata.failedReasons && metadata.failedReasons.length > 0) {
        const failDetails = metadata.failedReasons
          .map(f => `${f.truck} (${f.reason})`)
          .join(', ');
        message += failDetails;
      } else if (metadata.failedTrucks) {
        message += metadata.failedTrucks.join(', ');
      }
      message += '.';
    }

    await Notification.create({
      type: 'bulk_do_creation_issues',
      title,
      message,
      relatedModel: 'DeliveryOrder',
      metadata: {
        totalAttempted: metadata.totalAttempted,
        successCount: metadata.successCount,
        skippedCount: metadata.skippedCount,
        failedCount: metadata.failedCount,
        skippedReasons: metadata.skippedReasons,
        failedReasons: metadata.failedReasons,
      },
      recipients: ['fuel_order_maker', 'admin', 'super_admin'],
      createdBy,
    });

    logger.info(`Created bulk DO failure notification: ${metadata.skippedCount} skipped, ${metadata.failedCount} failed`);
  } catch (error) {
    logger.error('Failed to create bulk DO failure notification:', error);
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
  createYardFuelRecordedNotification,
  createTruckPendingLinkingNotification,
  createTruckEntryRejectedNotification,
  createYardFuelLinkedNotification,
  resolvePendingYardFuelNotifications,
  createBulkDOFailureNotification,
};
