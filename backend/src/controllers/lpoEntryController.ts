import { Response } from 'express';
import { LPOEntry } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput } from '../utils';
import { AuditService } from '../utils/auditService';

/**
 * Get all LPO entries with pagination and filters
 */
export const getAllLPOEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, lpoNo, truckNo, station, search } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    // Use actualDate for date filtering (actual LPO date) instead of createdAt
    // Falls back to createdAt for legacy records that don't have actualDate
    if (dateFrom || dateTo) {
      // Try to filter by actualDate first, fallback to createdAt for old records
      const dateFilter: any = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom as string);
        fromDate.setHours(0, 0, 0, 0);
        dateFilter.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo as string);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
      
      // Filter by actualDate, or fallback to createdAt for legacy records
      filter.$and = [
        {
          $or: [
            { actualDate: dateFilter },
            { actualDate: { $exists: false }, createdAt: dateFilter }
          ]
        }
      ];
    }

    // Unified search parameter - searches across multiple fields
    // Use ^ anchor to match from beginning of string for more precise results
    if (search) {
      const sanitized = sanitizeRegexInput(search as string);
      logger.info('LPO Search - Original:', { search });
      logger.info('LPO Search - Sanitized:', { sanitized });
      logger.info('LPO Search - Final Pattern:', { pattern: `^${sanitized}` });
      
      if (sanitized) {
        // Pattern explanation: ^T158 matches strings starting with exactly "T158"
        // The pattern must match the complete search term as prefix, not partial matches
        const searchOr = {
          $or: [
            { lpoNo: { $regex: `^${sanitized}`, $options: 'i' } },
            { truckNo: { $regex: `^${sanitized}`, $options: 'i' } },
            { dieselAt: { $regex: `^${sanitized}`, $options: 'i' } },
            { doSdo: { $regex: `^${sanitized}`, $options: 'i' } }
          ]
        };
        
        // Combine with date filter if it exists
        if (filter.$and) {
          filter.$and.push(searchOr);
        } else {
          filter.$and = [searchOr];
        }
      }
    } else {
      // Individual field filters (backward compatibility)
      if (lpoNo) {
        const sanitized = sanitizeRegexInput(lpoNo as string);
        if (sanitized) {
          filter.lpoNo = { $regex: `^${sanitized}`, $options: 'i' };
        }
      }

      if (truckNo) {
        const sanitized = sanitizeRegexInput(truckNo as string);
        if (sanitized) {
          filter.truckNo = { $regex: `^${sanitized}`, $options: 'i' };
        }
      }

      if (station) {
        const sanitized = sanitizeRegexInput(station as string);
        if (sanitized) {
          filter.dieselAt = { $regex: `^${sanitized}`, $options: 'i' };
        }
      }
    }

    // Log filter for debugging
    logger.info('LPO Entry search filter:', { filter: JSON.stringify(filter), dateFrom, dateTo, search });

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [lpoEntries, total] = await Promise.all([
      LPOEntry.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      LPOEntry.countDocuments(filter),
    ]);

    const response = createPaginatedResponse(lpoEntries, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'LPO entries retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single LPO entry by ID
 */
export const getLPOEntryById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lpoEntry = await LPOEntry.findOne({ _id: id, isDeleted: false });

    if (!lpoEntry) {
      throw new ApiError(404, 'LPO entry not found');
    }

    res.status(200).json({
      success: true,
      message: 'LPO entry retrieved successfully',
      data: lpoEntry,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new LPO entry
 */
export const createLPOEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lpoEntry = await LPOEntry.create(req.body);

    logger.info(`LPO entry created: ${lpoEntry.lpoNo} by ${req.user?.username}`);

    // Log audit trail
    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'LPOEntry',
      lpoEntry._id.toString(),
      { lpoNo: lpoEntry.lpoNo, truckNo: lpoEntry.truckNo, station: lpoEntry.dieselAt },
      req.ip
    );

    // Create notification for station manager(s)
    try {
      const { createLPOCreatedNotification } = await import('./notificationController');
      await createLPOCreatedNotification(lpoEntry, req.user?.username || 'system');
    } catch (notifError) {
      logger.error('Failed to create LPO notification:', notifError);
      // Don't fail the request if notification creation fails
    }

    res.status(201).json({
      success: true,
      message: 'LPO entry created successfully',
      data: lpoEntry,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update LPO entry
 */
export const updateLPOEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lpoEntry = await LPOEntry.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!lpoEntry) {
      throw new ApiError(404, 'LPO entry not found');
    }

    logger.info(`LPO entry updated: ${lpoEntry.lpoNo} by ${req.user?.username}`);

    // Log audit trail
    await AuditService.logUpdate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'LPOEntry',
      lpoEntry._id.toString(),
      {},
      { lpoNo: lpoEntry.lpoNo, truckNo: lpoEntry.truckNo },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'LPO entry updated successfully',
      data: lpoEntry,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get LPO entries by LPO number
 */
export const getLPOEntriesByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lpoNo } = req.params;

    const lpoEntries = await LPOEntry.find({
      lpoNo,
      isDeleted: false,
    }).sort({ sn: 1 });

    res.status(200).json({
      success: true,
      message: 'LPO entries retrieved successfully',
      data: lpoEntries,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get next LPO number
 * Resets to 1 every new year
 */
export const getNextLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentYear = new Date().getFullYear();
    
    const lastLPO = await LPOEntry.findOne({ 
      year: currentYear 
    })
      .sort({ lpoNo: -1 })
      .limit(1)
      .lean();

    let nextLPONo = '1'; // Start from 1 each year
    
    if (lastLPO && lastLPO.lpoNo) {
      const currentNumber = parseInt(lastLPO.lpoNo);
      if (!isNaN(currentNumber)) {
        nextLPONo = (currentNumber + 1).toString();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Next LPO number retrieved successfully',
      data: { nextLPONo },
    });
  } catch (error: any) {
    throw error;
  }
};
