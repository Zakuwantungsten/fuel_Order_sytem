import { Response } from 'express';
import { YardFuelDispense, FuelRecord } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, formatTruckNumber } from '../utils';
import { AuditService } from '../utils/auditService';

/**
 * Get all yard fuel dispenses with pagination and filters
 */
export const getAllYardFuelDispenses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, truckNo, yard, status } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    if (truckNo) {
      filter.truckNo = { $regex: truckNo, $options: 'i' };
    }

    if (yard) {
      filter.yard = yard;
    }

    if (status) {
      filter.status = status;
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [yardFuelDispenses, total] = await Promise.all([
      YardFuelDispense.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      YardFuelDispense.countDocuments(filter),
    ]);

    const response = createPaginatedResponse(yardFuelDispenses, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispenses retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single yard fuel dispense by ID
 */
export const getYardFuelDispenseById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const yardFuelDispense = await YardFuelDispense.findOne({ _id: id, isDeleted: false });

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense retrieved successfully',
      data: yardFuelDispense,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new yard fuel dispense
 */
export const createYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Format truck number to standard format
    if (req.body.truckNo) {
      req.body.truckNo = formatTruckNumber(req.body.truckNo);
    }
    
    // Auto-detect yard based on user role
    let yard = req.body.yard;
    const userRole = req.user?.role;
    
    if (userRole === 'dar_yard') {
      yard = 'DAR YARD';
    } else if (userRole === 'tanga_yard') {
      yard = 'TANGA YARD';
    } else if (userRole === 'mmsa_yard') {
      yard = 'MMSA YARD';
    }

    const yardFuelDispense = await YardFuelDispense.create({
      ...req.body,
      yard,
      enteredBy: req.user?.username || 'system',
      timestamp: new Date(),
      status: 'pending', // Will be updated to 'linked' if auto-linking succeeds
      history: [{
        action: 'created',
        performedBy: req.user?.username || 'system',
        timestamp: new Date(),
        details: {
          truckNo: req.body.truckNo,
          liters: req.body.liters,
          yard,
        },
      }],
    });

    logger.info(
      `Yard fuel dispense created: ${yardFuelDispense.truckNo} at ${yardFuelDispense.yard} by ${req.user?.username}`
    );

    // Log audit trail
    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'YardFuelDispense',
      yardFuelDispense._id.toString(),
      { truckNo: yardFuelDispense.truckNo, liters: yardFuelDispense.liters, yard: yardFuelDispense.yard },
      req.ip
    );

    // Auto-update fuel record if exists
    let linkedInfo = null;
    try {
      const truckNo = yardFuelDispense.truckNo;
      
      // Find matching fuel record (most recent active record for truck)
      const fuelRecord = await FuelRecord.findOne({
        truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
        isDeleted: false,
        isCancelled: false,
      }).sort({ date: -1 });

      if (fuelRecord) {
        // Update the appropriate yard column
        let updateField = '';
        if (yard === 'DAR YARD') {
          updateField = 'darYard';
        } else if (yard === 'TANGA YARD') {
          updateField = 'tangaYard';
        } else if (yard === 'MMSA YARD') {
          updateField = 'mmsaYard';
        }

        if (updateField) {
          // Store yard fuel as positive value and subtract from total to get balance
          const currentValue = Math.abs((fuelRecord as any)[updateField] || 0);
          const newCheckpointValue = currentValue + yardFuelDispense.liters;
          
          // Recalculate balance: Balance = (Total + Extra) - (All Checkpoints)
          const newBalance = fuelRecord.balance - yardFuelDispense.liters;
          
          await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
            [updateField]: newCheckpointValue,
            balance: newBalance,
          });

          // Update yard fuel dispense status
          await YardFuelDispense.findByIdAndUpdate(yardFuelDispense._id, {
            status: 'linked',
            linkedFuelRecordId: fuelRecord._id.toString(),
            linkedDONumber: fuelRecord.goingDo,
            autoLinked: true,
          });

          linkedInfo = {
            linked: true,
            doNumber: fuelRecord.goingDo,
            fieldUpdated: updateField,
          };

          logger.info(
            `Fuel record auto-updated: ${fuelRecord.goingDo} ${updateField} = ${newCheckpointValue}L (balance: ${newBalance}L)`
          );
        }
      } else {
        // Check if cancelled records exist to provide better diagnostics
        const cancelledRecordCount = await FuelRecord.countDocuments({
          truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
          isDeleted: false,
          isCancelled: true,
        });

        if (cancelledRecordCount > 0) {
          logger.info(
            `No active fuel record found for ${truckNo}, but ${cancelledRecordCount} cancelled record(s) exist. Dispense saved as pending.`
          );
        } else {
          logger.info(
            `No matching fuel record found for ${truckNo}. Dispense saved as pending.`
          );
        }
      }
    } catch (linkError: any) {
      logger.warn('Failed to auto-link fuel record:', linkError);
      // Continue even if linking fails
    }

    const responseMessage = linkedInfo?.linked
      ? `Fuel recorded and linked to DO ${linkedInfo.doNumber}`
      : 'Fuel recorded successfully. Will be linked when fuel record is created.';

    // Create notifications for fuel order maker
    try {
      const { createYardFuelRecordedNotification, createTruckPendingLinkingNotification } = await import('./notificationController');
      
      // Always notify about yard fuel being recorded
      await createYardFuelRecordedNotification(
        yardFuelDispense._id.toString(),
        {
          truckNo: yardFuelDispense.truckNo,
          liters: yardFuelDispense.liters,
          yard: yardFuelDispense.yard,
          enteredBy: yardFuelDispense.enteredBy,
          doNumber: linkedInfo?.doNumber,
          status: linkedInfo?.linked ? 'linked' : 'pending',
          notes: yardFuelDispense.notes,
        },
        req.user?.username || 'system'
      );

      // If pending, also create a specific pending linking notification
      if (!linkedInfo?.linked) {
        await createTruckPendingLinkingNotification(
          yardFuelDispense._id.toString(),
          {
            truckNo: yardFuelDispense.truckNo,
            liters: yardFuelDispense.liters,
            yard: yardFuelDispense.yard,
            enteredBy: yardFuelDispense.enteredBy,
            notes: yardFuelDispense.notes,
          },
          req.user?.username || 'system'
        );
      }
    } catch (notifError: any) {
      logger.warn('Failed to create yard fuel notifications:', notifError);
      // Continue even if notification fails
    }

    // Fetch the updated dispense record to return the latest status
    const updatedDispense = await YardFuelDispense.findById(yardFuelDispense._id).lean();

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        ...(updatedDispense || yardFuelDispense.toObject()),
        linkedInfo,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update yard fuel dispense
 */
export const updateYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const yardFuelDispense = await YardFuelDispense.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    logger.info(
      `Yard fuel dispense updated: ${yardFuelDispense.truckNo} by ${req.user?.username}`
    );

    // Log audit trail
    await AuditService.logUpdate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'YardFuelDispense',
      yardFuelDispense._id.toString(),
      {},
      { truckNo: yardFuelDispense.truckNo, liters: yardFuelDispense.liters },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense updated successfully',
      data: yardFuelDispense,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Soft delete yard fuel dispense
 */
export const deleteYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const yardFuelDispense = await YardFuelDispense.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    logger.info(
      `Yard fuel dispense deleted: ${yardFuelDispense.truckNo} by ${req.user?.username}`
    );

    // Log audit trail
    await AuditService.logDelete(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'YardFuelDispense',
      yardFuelDispense._id.toString(),
      { truckNo: yardFuelDispense.truckNo, liters: yardFuelDispense.liters },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get yard fuel dispenses by truck number
 */
export const getYardFuelDispensesByTruck = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { truckNo } = req.params;

    const yardFuelDispenses = await YardFuelDispense.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispenses retrieved successfully',
      data: yardFuelDispenses,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get pending yard fuel dispenses (not linked to fuel records)
 */
export const getPendingYardFuelDispenses = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const yardFuelDispenses = await YardFuelDispense.find({
      status: 'pending',
      isDeleted: false,
    }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      message: 'Pending yard fuel dispenses retrieved successfully',
      data: yardFuelDispenses,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get yard fuel summary by yard
 */
export const getYardFuelSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { yard, dateFrom, dateTo } = req.query;

    const filter: any = { isDeleted: false };

    if (yard) {
      filter.yard = yard;
    }

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    const yardFuelDispenses = await YardFuelDispense.find(filter).lean();

    // Calculate summary
    const summary = {
      totalDispenses: yardFuelDispenses.length,
      totalLiters: yardFuelDispenses.reduce((sum, dispense) => sum + dispense.liters, 0),
      byStatus: {
        pending: yardFuelDispenses.filter((d) => d.status === 'pending').length,
        linked: yardFuelDispenses.filter((d) => d.status === 'linked').length,
        manual: yardFuelDispenses.filter((d) => d.status === 'manual').length,
      },
    };

    res.status(200).json({
      success: true,
      message: 'Yard fuel summary retrieved successfully',
      data: summary,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get rejection history for a specific yard
 */
export const getYardRejectionHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { yard, dateFrom, dateTo, limit = 50, showResolved } = req.query;
    
    const filter: any = { 
      isDeleted: true,
      rejectionReason: { $exists: true, $ne: null },
    };

    // Filter by resolved status
    if (showResolved === 'false') {
      filter.rejectionResolved = false;
    }

    if (yard) {
      filter.yard = yard;
    }

    if (dateFrom || dateTo) {
      filter.rejectedAt = {};
      if (dateFrom) filter.rejectedAt.$gte = new Date(dateFrom as string);
      if (dateTo) filter.rejectedAt.$lte = new Date(dateTo as string);
    }

    const rejectedEntries = await YardFuelDispense.find(filter)
      .sort({ rejectedAt: -1 })
      .limit(parseInt(limit as string))
      .lean();

    res.status(200).json({
      success: true,
      message: 'Rejection history retrieved successfully',
      data: rejectedEntries,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reject a pending yard fuel dispense (fuel order maker action)
 * Marks the entry as rejected and notifies the yard personnel
 */
export const rejectYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      throw new ApiError(400, 'Rejection reason is required');
    }

    const yardFuelDispense = await YardFuelDispense.findOne({ _id: id, isDeleted: false });

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    // Mark as deleted/rejected and store rejection info
    yardFuelDispense.isDeleted = true;
    yardFuelDispense.deletedAt = new Date();
    yardFuelDispense.rejectionReason = rejectionReason;
    yardFuelDispense.rejectedBy = req.user?.username || 'Fuel Order Maker';
    yardFuelDispense.rejectedAt = new Date();
    
    // Add to history
    if (!yardFuelDispense.history) {
      yardFuelDispense.history = [];
    }
    yardFuelDispense.history.push({
      action: 'rejected',
      performedBy: req.user?.username || 'Fuel Order Maker',
      timestamp: new Date(),
      details: {
        reason: rejectionReason,
        originalEntry: {
          truckNo: yardFuelDispense.truckNo,
          liters: yardFuelDispense.liters,
          date: yardFuelDispense.date,
        },
      },
    });
    
    await yardFuelDispense.save();

    // Create rejection notification for yard personnel
    try {
      const { createTruckEntryRejectedNotification } = await import('./notificationController');
      await createTruckEntryRejectedNotification(
        yardFuelDispense._id.toString(),
        {
          truckNo: yardFuelDispense.truckNo,
          liters: yardFuelDispense.liters,
          yard: yardFuelDispense.yard,
          enteredBy: yardFuelDispense.enteredBy,
          rejectionReason,
          rejectedBy: req.user?.username || 'Fuel Order Maker',
        },
        req.user?.username || 'system'
      );
    } catch (notifError: any) {
      logger.warn('Failed to create rejection notification:', notifError);
      // Continue even if notification fails
    }

    // Resolve any pending linking notifications for this entry
    try {
      const { Notification } = await import('../models');
      await Notification.updateMany(
        {
          relatedModel: 'YardFuelDispense',
          relatedId: id,
          status: 'pending',
        },
        {
          $set: {
            status: 'dismissed',
            resolvedAt: new Date(),
            resolvedBy: req.user?.username || 'system',
            isRead: true,
          },
        }
      );
    } catch (resolveError: any) {
      logger.warn('Failed to resolve notifications:', resolveError);
    }

    logger.info(
      `Yard fuel dispense rejected: ${yardFuelDispense.truckNo} by ${req.user?.username}. Reason: ${rejectionReason}`
    );

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense rejected and yard personnel notified',
      data: {
        rejectedEntry: {
          id: yardFuelDispense._id,
          truckNo: yardFuelDispense.truckNo,
          liters: yardFuelDispense.liters,
          yard: yardFuelDispense.yard,
        },
        rejectionReason,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Auto-link pending yard fuel entries to a newly created fuel record
 * Called when a fuel record is created
 */
export const linkPendingYardFuelToFuelRecord = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { fuelRecordId, truckNo, doNumber, date } = req.body;

    if (!fuelRecordId || !truckNo || !doNumber) {
      throw new ApiError(400, 'Missing required fields: fuelRecordId, truckNo, doNumber');
    }

    // Verify fuel record exists and is active
    const fuelRecord = await FuelRecord.findOne({
      _id: fuelRecordId,
      isDeleted: false,
      isCancelled: false,
    });

    if (!fuelRecord) {
      throw new ApiError(400, 'Fuel record not found or is cancelled. Cannot link yard fuel to inactive records.');
    }

    logger.info(
      `Linking pending yard fuel entries for truck ${truckNo} to active DO ${doNumber} (Fuel Record: ${fuelRecordId})`
    );

    // Find all pending yard fuel entries for this truck (no date restriction)
    const pendingEntries = await YardFuelDispense.find({
      truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
      status: 'pending',
      isDeleted: false,
    });

    let linkedCount = 0;
    const linkedEntries = [];

    for (const entry of pendingEntries) {
      // Update yard fuel entry status
      entry.status = 'linked';
      entry.linkedFuelRecordId = fuelRecordId;
      entry.linkedDONumber = doNumber;
      entry.autoLinked = true;
      
      // Add to history
      if (!entry.history) {
        entry.history = [];
      }
      entry.history.push({
        action: 'linked',
        performedBy: req.user?.username || 'system',
        timestamp: new Date(),
        details: {
          doNumber,
          fuelRecordId,
          linkedAt: new Date(),
        },
      });

      await entry.save();
      linkedCount++;
      linkedEntries.push(entry);

      // Resolve pending notifications
      try {
        const { resolvePendingYardFuelNotifications, createYardFuelLinkedNotification } = await import('./notificationController');
        
        // Resolve pending notifications for this entry
        await resolvePendingYardFuelNotifications(
          entry._id.toString(),
          req.user?.username || 'system'
        );

        // Notify yard man of successful linking
        await createYardFuelLinkedNotification(
          entry._id.toString(),
          {
            truckNo: entry.truckNo,
            liters: entry.liters,
            yard: entry.yard,
            enteredBy: entry.enteredBy,
            doNumber,
          },
          req.user?.username || 'system'
        );
      } catch (notifError: any) {
        logger.warn('Failed to handle notifications for linked yard fuel:', notifError);
      }

      logger.info(
        `Linked pending yard fuel entry ${entry._id} to DO ${doNumber} (${entry.truckNo})`
      );

      // Check if this truck/yard has recent rejections and mark them as resolved
      try {
        const recentRejections = await YardFuelDispense.find({
          truckNo: { $regex: new RegExp(`^${entry.truckNo}$`, 'i') },
          yard: entry.yard,
          isDeleted: true,
          rejectionReason: { $exists: true, $ne: null },
          rejectionResolved: false,
          rejectedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
        });

        if (recentRejections.length > 0) {
          await YardFuelDispense.updateMany(
            {
              _id: { $in: recentRejections.map(r => r._id) },
            },
            {
              $set: {
                rejectionResolved: true,
                rejectionResolvedAt: new Date(),
                rejectionResolvedBy: entry.enteredBy,
              },
            }
          );
          logger.info(
            `Marked ${recentRejections.length} rejection(s) as resolved for truck ${entry.truckNo} at ${entry.yard}`
          );
        }
      } catch (resolveError: any) {
        logger.warn('Failed to mark rejections as resolved:', resolveError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully linked ${linkedCount} pending yard fuel ${linkedCount === 1 ? 'entry' : 'entries'}`,
      data: {
        linkedCount,
        entries: linkedEntries.map(e => ({
          id: e._id,
          truckNo: e.truckNo,
          liters: e.liters,
          yard: e.yard,
          doNumber: e.linkedDONumber,
        })),
      },
    });
  } catch (error: any) {
    throw error;
  }
};
