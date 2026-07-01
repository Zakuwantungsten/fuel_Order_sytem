import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Notification } from '../models/Notification';
import { FuelRecord } from '../models/FuelRecord';
import { PushSubscription } from '../models/PushSubscription';
import { User } from '../models/User';
import { ApiError } from '../middleware/errorHandler';
import { config } from '../config';
import logger from '../utils/logger';
import { emitNotification, emitDataChange } from '../services/websocket';
import { sendPushToRecipients } from '../services/pushNotificationService';
import { createDriverUserId } from '../utils/truckNumber';
import { getManagerAccessConfig } from '../services/journeyService';

/** Resolve the display station name and custom-Zambia flag for LPO notifications. */
function resolveLpoNotifyContext(lpoDoc: any): { station: string; isCustomZambia: boolean } {
  const entries: any[] = lpoDoc?.entries || [];
  const isCustom =
    lpoDoc?.isCustomStation === true ||
    entries.some((e) => e?.isCustomStation === true);

  const rawStation = (lpoDoc?.station || '').toString().trim();
  const stationUp = rawStation.toUpperCase();
  const customName = (lpoDoc?.customStationName || entries.find((e) => e?.customStationName)?.customStationName || '')
    .toString()
    .trim();

  // Use the entered station name — never show the literal "CUSTOM" label.
  const displayStation = (stationUp === 'CUSTOM' && customName)
    ? customName.toUpperCase()
    : stationUp;

  const countryRaw = (
    lpoDoc?.customCountry ||
    entries.find((e) => e?.customCountry)?.customCountry ||
    'Zambia'
  ).toString().trim();

  const isCustomZambia = isCustom && countryRaw.toLowerCase() === 'zambia';

  return { station: displayStation, isCustomZambia };
}

/**
 * Build LPO notification recipients: station managers assigned to this station
 * (looked up live from the DB by role + station field), the super_manager role
 * for stations in their configured list, and specific drivers.
 *
 * When `isCustomZambia` is true and journey config allows it, super_manager is
 * always included — custom free-text station names won't match superManagerStations.
 */
async function buildLpoRecipients(
  station: string,
  truckNos: string[],
  opts?: { isCustomZambia?: boolean }
): Promise<string[]> {
  const recipients = new Set<string>();

  // Escape the station name so it is safe inside a RegExp literal.
  const escapedStation = station.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find all users with a manager role whose station matches this LPO's station.
  // Both 'manager' and 'station_manager' role variants are checked so the query
  // covers however the admin named the role at account creation time.
  const stationManagers = await User.find({
    role: { $in: ['manager', 'station_manager'] },
    station: { $regex: new RegExp(`^${escapedStation}$`, 'i') },
    isActive: true,
    isDeleted: false,
  })
    .select('_id')
    .lean();

  for (const mgr of stationManagers) {
    recipients.add((mgr._id as any).toString());
  }

  const { superManagerStations, superManagerNotifyCustomZambia } = await getManagerAccessConfig();
  const stationUp = station.toUpperCase().trim();
  const smReceivesListed =
    superManagerStations.length === 0 ||
    superManagerStations.some((s) => s.toUpperCase().trim() === stationUp);
  const smReceivesCustomZambia = !!(opts?.isCustomZambia && superManagerNotifyCustomZambia);
  if (smReceivesListed || smReceivesCustomZambia) recipients.add('super_manager');

  for (const t of truckNos) {
    if (t && t.trim()) recipients.add(createDriverUserId(t));
  }
  return Array.from(recipients);
}

const lpoWsPayload = (n: any) => ({
  id: n._id,
  type: n.type,
  title: n.title,
  message: n.message,
  relatedModel: n.relatedModel,
  relatedId: n.relatedId,
  metadata: n.metadata,
  status: n.status,
  createdAt: n.createdAt,
  isRead: false,
});

// Helper: build the clean notification message used for config-missing alerts
function buildConfigMessage(
  type: 'both' | 'missing_total_liters' | 'missing_extra_fuel',
  metadata: { doNumber: string; truckNo: string; destination?: string; truckSuffix?: string }
): string {
  const actionLine =
    type === 'both'
      ? 'Add route total liters and truck batch in System Configuration.'
      : type === 'missing_total_liters'
      ? 'Add route total liters in System Configuration.'
      : 'Add truck batch assignment in System Configuration.';

  const now = new Date();
  // Format: DD/MM/YYYY, HH:MM:SS
  const timestamp = now.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  const lines = [
    actionLine,
    '',
    `DO: ${metadata.doNumber}`,
    `Truck: ${metadata.truckNo}`,
  ];
  if (metadata.destination) lines.push(`Destination: ${metadata.destination}`);
  if (metadata.truckSuffix) lines.push(`Suffix: ${metadata.truckSuffix}`);
  lines.push(timestamp);

  return lines.join('\n');
}

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
    const userRole = req.user?.role;

    const notification = await Notification.findOne({
      _id: id,
      recipients: { $in: [userRole, userId] },
      isDeleted: false,
    });
    if (!notification) {
      throw new ApiError(404, 'Notification not found or you do not have permission to access it');
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
 * Dismiss all notifications for the current user
 */
export const dismissAllNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role || 'user';

    const result = await Notification.updateMany(
      {
        recipients: { $in: [userRole, userId] },
        isDeleted: false,
        status: 'pending',
      },
      { status: 'dismissed', isRead: true }
    );

    logger.info(`User ${req.user?.username} dismissed all notifications (${result.modifiedCount} updated)`);

    res.status(200).json({
      success: true,
      message: `Dismissed ${result.modifiedCount} notification(s)`,
      count: result.modifiedCount,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Mark ALL of the current user's pending notifications as read.
 *
 * Unlike dismissAllNotifications (which hides them), this only clears the
 * "unread" state — the notifications stay visible in the list. Used to reset the
 * badge counter when the user opens the notifications panel.
 */
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role || 'user';

    const result = await Notification.updateMany(
      {
        recipients: { $in: [userRole, userId] },
        isDeleted: false,
        status: 'pending',
        readBy: { $ne: userId },
      },
      { $addToSet: { readBy: userId }, $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} notification(s) as read`,
      count: result.modifiedCount,
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
  creatorRole?: string,
  creatorUserId?: string
): Promise<void> => {
  try {
    const type: 'both' | 'missing_total_liters' | 'missing_extra_fuel' =
      missingFields.length === 2
        ? 'both'
        : missingFields.includes('totalLiters')
        ? 'missing_total_liters'
        : 'missing_extra_fuel';

    // Title: same clean format for both creator and admin
    const title =
      type === 'missing_extra_fuel'
        ? `Add Truck Batch: ${metadata.truckSuffix || metadata.doNumber}`
        : `New Configuration Needed: ${metadata.doNumber}`;

    // Message: clean formatted block with DO details
    const message = buildConfigMessage(type, metadata);

    const notifMeta = {
      fuelRecordId,
      doNumber: metadata.doNumber,
      truckNo: metadata.truckNo,
      destination: metadata.destination,
      truckSuffix: metadata.truckSuffix,
      missingFields,
      creatorRole: creatorRole || 'unknown',
    };

    // ── Creator notification (fuel_order_maker or admin who created the DO) ──
    // super_admin does NOT receive config alerts
    const creatorRecipients = creatorUserId ? [creatorUserId] : [creatorRole || 'fuel_order_maker'];

    const creatorNotif = await Notification.create({
      type, title, message,
      relatedModel: 'FuelRecord',
      relatedId: fuelRecordId,
      metadata: notifMeta,
      recipients: creatorRecipients,
      createdBy,
    });

    const wsPayload = (n: any) => ({
      id: n._id,
      type: n.type,
      title: n.title,
      message: n.message,
      relatedModel: n.relatedModel,
      relatedId: n.relatedId,
      metadata: n.metadata,
      status: n.status,
      createdAt: n.createdAt,
      isRead: false,
    });

    emitNotification(creatorRecipients, wsPayload(creatorNotif));
    // Send browser push to creator (async via BullMQ — does not block)
    sendPushToRecipients(creatorRecipients, { title, body: message.split('\n')[0] });
    logger.info(`Config notification sent to creator: ${createdBy}`);

    // ── Admin notification (only if creator is NOT admin) ──
    // super_admin is intentionally excluded from config alerts
    const isAdminCreator = creatorRole === 'admin';
    if (!isAdminCreator) {
      const adminNotif = await Notification.create({
        type, title, message,
        relatedModel: 'FuelRecord',
        relatedId: fuelRecordId,
        metadata: { ...notifMeta, requestedBy: createdBy },
        recipients: ['admin'],  // NOT super_admin
        createdBy,
      });

      emitNotification(['admin'], wsPayload(adminNotif));
      // Send browser push to admins (async via BullMQ — does not block)
      sendPushToRecipients(['admin'], { title, body: message.split('\n')[0] });
      logger.info('Config notification sent to admin role');
    }

    logger.info(`Notifications created for fuel record ${fuelRecordId} — missing: ${missingFields.join(', ')}`);

    // Broadcast a generic notifications-changed event so every connected client's
    // NotificationBell reloads from the DB. This is more reliable than the
    // room-targeted emitNotification above (which can miss across instances or if
    // room membership is stale), and is what makes new notifications appear live
    // without a page refresh — including for bulk DO creation.
    emitDataChange('notifications', 'create');
  } catch (error) {
    logger.error('Failed to create config notification:', error);
    // Don't throw — notification failure should never break fuel record creation
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

    // Broadcast so every client's NotificationBell reloads from the DB (live update,
    // no refresh needed). This is the only real-time signal for this notification type.
    emitDataChange('notifications', 'create');
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
      emitDataChange('notifications', 'update');
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

    const notification = await Notification.create({
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

    // Emit real-time WebSocket notification
    try {
      emitNotification(['fuel_order_maker'], {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedModel: notification.relatedModel,
        relatedId: notification.relatedId,
        metadata: notification.metadata,
        status: notification.status,
        createdAt: notification.createdAt,
        isRead: false,
      });
    } catch (wsError) {
      logger.error('Failed to emit yard fuel WebSocket notification:', wsError);
    }

    // Send push notification (async via BullMQ — does not block)
    sendPushToRecipients(['fuel_order_maker'], { title, body: message.split('.')[0] });

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

    const notification = await Notification.create({
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

    // Emit real-time WebSocket notification
    try {
      emitNotification(['fuel_order_maker'], {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedModel: notification.relatedModel,
        relatedId: notification.relatedId,
        metadata: notification.metadata,
        status: notification.status,
        createdAt: notification.createdAt,
        isRead: false,
      });
    } catch (wsError) {
      logger.error('Failed to emit pending linking WebSocket notification:', wsError);
    }

    // Send push notification (async via BullMQ — does not block)
    sendPushToRecipients(['fuel_order_maker'], { title, body: message.split('.')[0] });

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

/**
 * Create notification when an LPO is created for a station
 * Notifies the station manager and super manager (for LAKE stations)
 */
/**
 * Create a notification when an LPO is created.
 * Notifies the station manager, super_manager (LAKE/custom stations), and the
 * driver(s) of the trucks on the LPO. One notification per LPO.
 */
export const createLPOCreatedNotification = async (
  lpoDoc: any,
  createdBy: string
): Promise<void> => {
  try {
    const { station, isCustomZambia } = resolveLpoNotifyContext(lpoDoc);
    if (!station || station === 'CASH') return;

    const activeEntries = (lpoDoc.entries || []).filter((e: any) => !e.isCancelled);
    if (activeEntries.length === 0) return;

    const truckNos: string[] = activeEntries.map((e: any) => e.truckNo).filter(Boolean);
    const recipients = await buildLpoRecipients(station, truckNos, { isCustomZambia });
    if (recipients.length === 0) return;

    const totalLtrs = activeEntries.reduce((s: number, e: any) => s + (e.liters || 0), 0);
    const trucksLabel = truckNos.length === 1 ? truckNos[0] : `${truckNos.length} trucks`;
    const title = `New LPO — ${station}`;
    const message = `LPO ${lpoDoc.lpoNo} created at ${station} for ${trucksLabel} (${totalLtrs}L).`;

    const notification = await Notification.create({
      type: 'lpo_created',
      title,
      message,
      relatedModel: 'LPO',
      relatedId: lpoDoc._id.toString(),
      metadata: { lpoNo: lpoDoc.lpoNo, station, truckNo: truckNos.join(', ') },
      recipients,
      createdBy,
    });

    emitNotification(recipients, lpoWsPayload(notification));
    sendPushToRecipients(recipients, { title, body: message });
    emitDataChange('notifications', 'create');
    logger.info(`LPO created notification: ${lpoDoc.lpoNo} @ ${station} → ${recipients.join(', ')}`);
  } catch (error) {
    logger.error('Failed to create LPO created notification:', error);
  }
};

/**
 * Notify when a truck entry on an LPO is cancelled.
 */
export const createLPOCancelledNotification = async (
  lpoDoc: any,
  entry: any,
  createdBy: string
): Promise<void> => {
  try {
    const { station, isCustomZambia } = resolveLpoNotifyContext(lpoDoc);
    if (!station || station === 'CASH') return;

    const recipients = await buildLpoRecipients(station, [entry.truckNo], { isCustomZambia });
    if (recipients.length === 0) return;

    const title = `LPO Cancelled — ${station}`;
    const message = `Truck ${entry.truckNo} on LPO ${lpoDoc.lpoNo} was cancelled${entry.cancellationReason ? `: ${entry.cancellationReason}` : ''}.`;

    const notification = await Notification.create({
      type: 'lpo_cancelled',
      title,
      message,
      relatedModel: 'LPO',
      relatedId: lpoDoc._id.toString(),
      metadata: { lpoNo: lpoDoc.lpoNo, station, truckNo: entry.truckNo },
      recipients,
      createdBy,
    });

    emitNotification(recipients, lpoWsPayload(notification));
    sendPushToRecipients(recipients, { title, body: message });
    emitDataChange('notifications', 'create');
    logger.info(`LPO cancelled notification: ${lpoDoc.lpoNo} truck ${entry.truckNo} @ ${station}`);
  } catch (error) {
    logger.error('Failed to create LPO cancelled notification:', error);
  }
};

/**
 * Notify when a truck entry's liters are amended on an LPO.
 */
export const createLPOAmendedNotification = async (
  lpoDoc: any,
  entry: any,
  createdBy: string
): Promise<void> => {
  try {
    const { station, isCustomZambia } = resolveLpoNotifyContext(lpoDoc);
    if (!station || station === 'CASH') return;

    const recipients = await buildLpoRecipients(station, [entry.truckNo], { isCustomZambia });
    if (recipients.length === 0) return;

    const change =
      entry.originalLiters != null ? ` ${entry.originalLiters}L → ${entry.liters}L` : ` (now ${entry.liters}L)`;
    const title = `LPO Amended — ${station}`;
    const message = `Truck ${entry.truckNo} on LPO ${lpoDoc.lpoNo} liters updated${change}.`;

    const notification = await Notification.create({
      type: 'lpo_amended',
      title,
      message,
      relatedModel: 'LPO',
      relatedId: lpoDoc._id.toString(),
      metadata: { lpoNo: lpoDoc.lpoNo, station, truckNo: entry.truckNo },
      recipients,
      createdBy,
    });

    emitNotification(recipients, lpoWsPayload(notification));
    sendPushToRecipients(recipients, { title, body: message });
    emitDataChange('notifications', 'create');
    logger.info(`LPO amended notification: ${lpoDoc.lpoNo} truck ${entry.truckNo} @ ${station}`);
  } catch (error) {
    logger.error('Failed to create LPO amended notification:', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Browser Push Subscription endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/notifications/vapid-public-key
 * Returns the VAPID public key so the frontend can create a push subscription.
 */
export const getVapidPublicKey = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, publicKey: config.vapidPublicKey || '' });
};

/**
 * POST /api/v1/notifications/push-subscribe
 * Stores a browser push subscription for the authenticated user.
 * Body: { endpoint, keys: { p256dh, auth } }  (standard PushSubscription JSON)
 */
export const subscribePush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new ApiError(400, 'Invalid push subscription: endpoint and keys (p256dh, auth) are required');
    }

    const userId = req.user!.userId;
    const role   = req.user!.role || 'user';

    // Upsert by endpoint so re-subscribing doesn't create duplicates
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId, role, endpoint, keys },
      { upsert: true, new: true }
    );

    logger.info(`Push subscription registered for user ${req.user?.username} (${role})`);
    res.status(201).json({ success: true, message: 'Push subscription registered' });
  } catch (error: any) {
    throw error;
  }
};

/**
 * DELETE /api/v1/notifications/push-subscribe
 * Removes the browser push subscription for the given endpoint.
 * Body: { endpoint }
 */
export const unsubscribePush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) throw new ApiError(400, 'endpoint is required');

    await PushSubscription.deleteOne({ endpoint, userId: req.user!.userId });
    logger.info(`Push subscription removed for user ${req.user?.username}`);
    res.status(200).json({ success: true, message: 'Push subscription removed' });
  } catch (error: any) {
    throw error;
  }
};

/**
 * POST /api/v1/notifications/mobile-subscribe
 * Stores an Expo push token for the authenticated user (mobile app).
 * Body: { expoPushToken }
 */
export const subscribeMobilePush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { expoPushToken } = req.body;
    if (!expoPushToken || typeof expoPushToken !== 'string') {
      throw new ApiError(400, 'expoPushToken is required');
    }

    const userId = req.user!.userId;
    const role   = req.user!.role || 'user';

    await PushSubscription.findOneAndUpdate(
      { expoPushToken },
      { userId, role, platform: 'expo', expoPushToken },
      { upsert: true, new: true }
    );

    logger.info(`Expo push token registered for user ${req.user?.username} (${role})`);
    res.status(201).json({ success: true, message: 'Mobile push subscription registered' });
  } catch (error: any) {
    throw error;
  }
};

/**
 * DELETE /api/v1/notifications/mobile-subscribe
 * Removes the Expo push token for the authenticated user.
 * Body: { expoPushToken }
 */
export const unsubscribeMobilePush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { expoPushToken } = req.body;
    if (!expoPushToken) throw new ApiError(400, 'expoPushToken is required');

    await PushSubscription.deleteOne({ expoPushToken, userId: req.user!.userId });
    logger.info(`Expo push token removed for user ${req.user?.username}`);
    res.status(200).json({ success: true, message: 'Mobile push subscription removed' });
  } catch (error: any) {
    throw error;
  }
};

export default {
  getNotifications,
  getNotificationCount,
  markAsRead,
  dismissNotification,
  dismissAllNotifications,
  resolveNotification,
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  subscribeMobilePush,
  unsubscribeMobilePush,
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
  createLPOCreatedNotification,
  createLPOCancelledNotification,
  createLPOAmendedNotification,
};
