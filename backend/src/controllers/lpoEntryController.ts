import { Response } from 'express';
import { matchedData } from 'express-validator';
import { LPOEntry } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput } from '../utils';
import { AuditService } from '../utils/auditService';
import { emitDataChange } from '../services/websocket';

/**
 * Get all LPO entries with pagination and filters
 */
export const getAllLPOEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, lpoNo, truckNo, station, search } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    // Restrict drivers to their own truck's records (least-privilege)
    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

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
 * Get distinct year-month periods and stations that have LPO data.
 * Lightweight query used by the frontend period/station pickers.
 */
export const getAvailableFilters = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: any = { isDeleted: false };
    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

    // Fetch periods via aggregation on actualDate (ISO dates)
    const isoResults = await LPOEntry.aggregate([
      { $match: { ...filter, actualDate: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: {
            year: { $year: '$actualDate' },
            month: { $month: '$actualDate' },
          },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);

    // For records without actualDate, parse the "date" string field
    const legacyEntries = await LPOEntry.find({
      ...filter,
      $or: [{ actualDate: { $exists: false } }, { actualDate: null }],
    }).select('date createdAt').lean();

    const seen = new Map<string, { year: number; month: number }>();
    isoResults.forEach(r => {
      const key = `${r._id.year}-${r._id.month}`;
      seen.set(key, { year: r._id.year, month: r._id.month });
    });

    const MON: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    for (const entry of legacyEntries) {
      const dateStr = entry.date;
      if (!dateStr) continue;
      let year: number | null = null;
      let month: number | null = null;

      const iso = (dateStr as string).match(/^(\d{4})-(\d{2})-\d{2}/);
      if (iso) {
        year = parseInt(iso[1]);
        month = parseInt(iso[2]);
      } else {
        const dmon = (dateStr as string).match(/^\d{1,2}[\-\/\s]([A-Za-z]{3,})/i);
        if (dmon) month = MON[dmon[1].toLowerCase().substring(0, 3)] ?? null;
        const yr = (dateStr as string).match(/(\d{4})$/);
        if (yr) year = parseInt(yr[1]);
        if (year === null && entry.createdAt) year = new Date(entry.createdAt).getFullYear();
      }
      if (year !== null && month !== null) {
        const key = `${year}-${month}`;
        if (!seen.has(key)) seen.set(key, { year, month });
      }
    }

    // Always include the current month so users can filter/create entries
    const now = new Date();
    const curKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (!seen.has(curKey)) {
      seen.set(curKey, { year: now.getFullYear(), month: now.getMonth() + 1 });
    }

    const periods = Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );

    // Stations via distinct
    const stations = await LPOEntry.distinct('dieselAt', { ...filter, dieselAt: { $nin: [null, ''] } });
    const sortedStations = (stations as string[])
      .filter(s => s && s.trim())
      .map(s => s.trim().toUpperCase())
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();

    res.json({ periods, stations: sortedStations });
  } catch (error) {
    logger.error('Error fetching LPO available filters:', error);
    throw new ApiError(500, 'Failed to fetch available filters');
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
    const payload = matchedData(req, { locations: ['body'] }) as any;
    const lpoEntry = await LPOEntry.create(payload);

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
    emitDataChange('lpo_entries', 'create');
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
    const updates = matchedData(req, { locations: ['body'] }) as any;

    const lpoEntry = await LPOEntry.findOneAndUpdate(
      { _id: id, isDeleted: false },
      updates,
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
    emitDataChange('lpo_entries', 'update');
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
