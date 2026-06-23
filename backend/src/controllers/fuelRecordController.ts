import { Response } from 'express';
import { matchedData } from 'express-validator';
import { FuelRecord } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, formatTruckNumber, sanitizeRegexInput, buildFuzzyRegex } from '../utils';
import { AuditService } from '../utils/auditService';
import { createMissingConfigNotification, autoResolveNotifications } from './notificationController';
import { enforceEditLock } from './editLockController';
import { attachLocks } from '../services/lockService';
import { emitDataChange } from '../services/websocket';
import { filterFuelRecordFields } from '../utils/roleFieldPolicy';
import { checkAndPromoteStartedJourney } from '../services/journeyService';

/**
 * Get available periods (year-month pairs) for the period picker dropdown.
 * Uses MongoDB distinct + aggregation so we never fetch full records.
 */
export const getAvailablePeriods = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: any = { isDeleted: false };
    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

    // Aggregate distinct year-month pairs from the date field
    const results = await FuelRecord.aggregate([
      { $match: filter },
      {
        $addFields: {
          // Parse ISO "YYYY-MM-DD" dates
          isoYear: {
            $cond: [
              { $regexMatch: { input: '$date', regex: /^\d{4}-\d{2}-\d{2}/ } },
              { $toInt: { $substr: ['$date', 0, 4] } },
              null,
            ],
          },
          isoMonth: {
            $cond: [
              { $regexMatch: { input: '$date', regex: /^\d{4}-\d{2}-\d{2}/ } },
              { $toInt: { $substr: ['$date', 5, 2] } },
              null,
            ],
          },
        },
      },
      { $match: { isoYear: { $ne: null }, isoMonth: { $ne: null } } },
      { $group: { _id: { year: '$isoYear', month: '$isoMonth' } } },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);

    // Also handle "D-Mon-YYYY" format dates via a second pass
    const legacyResults = await FuelRecord.aggregate([
      { $match: { ...filter, date: { $regex: /^\d{1,2}-[A-Za-z]{3}-\d{4}$/ } } },
      {
        $addFields: {
          parsedDate: { $dateFromString: { dateString: '$date', format: '%d-%b-%Y', onError: null } },
        },
      },
      { $match: { parsedDate: { $ne: null } } },
      {
        $group: {
          _id: {
            year: { $year: '$parsedDate' },
            month: { $month: '$parsedDate' },
          },
        },
      },
    ]);

    // Merge both sources
    const seen = new Map<string, { year: number; month: number }>();
    [...results, ...legacyResults].forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!seen.has(key)) seen.set(key, { year: r._id.year, month: r._id.month });
    });

    const periods = Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );

    res.status(200).json({ success: true, data: { periods } });
  } catch (error: any) {
    logger.error('Error getting available periods:', error);
    throw error;
  }
};

/**
 * Get available routes for a given month filter.
 * Returns unique {from, to} pairs — no full records fetched.
 */
export const getAvailableRoutes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, routeType } = req.query;
    const filter: any = { isDeleted: false };

    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

    // Apply month filter (reuse same logic as getAllFuelRecords)
    if (month) {
      const monthStr = (month as string).trim();
      const parts = monthStr.split(/\s+/);
      const rawMonth = (parts[0] || '').toLowerCase();
      const yearStr = parts[1] || '';
      const monthAbbrs: Record<string, string> = {
        'january': 'jan', 'february': 'feb', 'march': 'mar', 'april': 'apr',
        'may': 'may', 'june': 'jun', 'july': 'jul', 'august': 'aug',
        'september': 'sep', 'october': 'oct', 'november': 'nov', 'december': 'dec',
      };
      const monthNums: Record<string, string> = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
      };
      const abbr = monthAbbrs[rawMonth] || rawMonth.substring(0, 3);
      const num = monthNums[abbr] || '';
      const sanitized = sanitizeRegexInput(monthStr);

      if (yearStr && abbr && num) {
        const monthConditions: any[] = [];
        if (sanitized) monthConditions.push({ month: { $regex: sanitized, $options: 'i' } });
        monthConditions.push(
          { $and: [{ date: { $regex: abbr, $options: 'i' } }, { date: { $regex: yearStr } }] },
          { date: { $regex: `^${yearStr}-${num}-` } },
        );
        if (!filter.$and) filter.$and = [];
        (filter.$and as any[]).push({ $or: monthConditions });
      }
    }

    // Only project the fields we need
    const records = await FuelRecord.find(filter)
      .select('from to goingDo returnDo originalGoingFrom originalGoingTo')
      .lean();

    const routesMap = new Map<string, { from: string; to: string }>();
    const type = (routeType as string || 'IMPORT').toUpperCase();

    records.forEach((record: any) => {
      if (type === 'IMPORT') {
        if (record.goingDo && record.goingDo.trim() !== '') {
          const goingFrom = record.originalGoingFrom || record.from;
          const goingTo = record.originalGoingTo || record.to;
          if (goingFrom && goingTo) {
            routesMap.set(`${goingFrom}-${goingTo}`, { from: goingFrom, to: goingTo });
          }
        }
      } else {
        if (record.returnDo && record.returnDo.trim() !== '' && record.from && record.to) {
          routesMap.set(`${record.from}-${record.to}`, { from: record.from, to: record.to });
        }
      }
    });

    const routes = Array.from(routesMap.values()).sort((a, b) =>
      `${a.from} - ${a.to}`.localeCompare(`${b.from} - ${b.to}`)
    );

    res.status(200).json({ success: true, data: { routes } });
  } catch (error: any) {
    logger.error('Error getting available routes:', error);
    throw error;
  }
};

/**
 * Get all fuel records with pagination and filters
 */
export const getAllFuelRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, truckNo, from, to, month, year, search, excludeCancelled, status } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    // Restrict drivers to their own truck's records (least-privilege)
    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

    // Status filter: 'active' excludes cancelled, 'cancelled' shows only cancelled, default shows all
    if (excludeCancelled === 'true' || status === 'active') {
      filter.isCancelled = { $ne: true };
    } else if (status === 'cancelled') {
      filter.isCancelled = true;
    }

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    // Multi-field search - searches truckNo, goingDo, and returnDo.
    // Whitespace/separator-tolerant prefix match so spacing/format drift
    // ("T598 DTB" vs "T598DTB") still matches.
    if (search) {
      const fuzzy = buildFuzzyRegex(search as string);
      if (fuzzy) {
        filter.$or = [
          { truckNo: { $regex: fuzzy, $options: 'i' } },
          { goingDo: { $regex: fuzzy, $options: 'i' } },
          { returnDo: { $regex: fuzzy, $options: 'i' } }
        ];
      }
    } else if (truckNo) {
      // Fallback to truckNo for backwards compatibility
      const sanitized = sanitizeRegexInput(truckNo as string);
      if (sanitized) {
        filter.truckNo = { $regex: sanitized, $options: 'i' };
      }
    }

    if (from) {
      const sanitized = sanitizeRegexInput(from as string);
      if (sanitized) {
        filter.from = { $regex: sanitized, $options: 'i' };
      }
    }

    if (to) {
      const sanitized = sanitizeRegexInput(to as string);
      if (sanitized) {
        filter.to = { $regex: sanitized, $options: 'i' };
      }
    }

    if (month) {
      // Parse "Full Month YYYY" or "Abbr YYYY" (e.g. "December 2025" or "Dec 2025")
      const monthStr = (month as string).trim();
      const parts = monthStr.split(/\s+/);
      const rawMonth = (parts[0] || '').toLowerCase();
      const yearPart = parts[1] || '';
      const monthAbbrs: Record<string, string> = {
        'january': 'jan', 'february': 'feb', 'march': 'mar', 'april': 'apr',
        'may': 'may', 'june': 'jun', 'july': 'jul', 'august': 'aug',
        'september': 'sep', 'october': 'oct', 'november': 'nov', 'december': 'dec',
      };
      const monthNums: Record<string, string> = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
      };
      const abbr = monthAbbrs[rawMonth] || rawMonth.substring(0, 3);
      const num = monthNums[abbr] || '';

      if (/^\d{4}$/.test(yearPart) && num) {
        // Indexed equality on the canonical monthKey ("YYYY-MM"), which the
        // model hooks maintain and the boot backfill guarantees for old rows.
        // This replaced a set of case-insensitive $regex conditions over the
        // two historical string date formats that forced a collection scan.
        filter.monthKey = `${yearPart}-${num}`;
      } else {
        const sanitized = sanitizeRegexInput(monthStr);
        if (sanitized) {
          filter.month = { $regex: sanitized, $options: 'i' };
        }
      }
    }

    // Year filter — anchored prefix regex on the indexed monthKey
    if (year && /^\d{4}$/.test(year as string) && !filter.monthKey) {
      filter.monthKey = { $regex: `^${year}-` };
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [fuelRecords, total] = await Promise.all([
      FuelRecord.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      FuelRecord.countDocuments(filter),
    ]);

    // Transform _id to id for frontend compatibility
    const transformedRecords = fuelRecords.map((record: any) => ({
      ...record,
      id: record._id,
    }));

    // Attach live edit-lock info so the "Editing: …" badge shows on load.
    await attachLocks('fuel_records', transformedRecords);

    const response = createPaginatedResponse(transformedRecords, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Fuel records retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single fuel record by ID
 */
export const getFuelRecordById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const fuelRecord = await FuelRecord.findOne({ _id: id, isDeleted: false });

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    res.status(200).json({
      success: true,
      message: 'Fuel record retrieved successfully',
      data: fuelRecord,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get fuel records by truck number
 */
export const getFuelRecordsByTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;

    const sanitizedTruckNo = sanitizeRegexInput(truckNo);
    if (!sanitizedTruckNo) {
      throw new ApiError(400, 'Invalid truck number format');
    }

    const fuelRecords = await FuelRecord.find({
      truckNo: { $regex: sanitizedTruckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ date: -1 });

    res.status(200).json({
      success: true,
      message: 'Fuel records retrieved successfully',
      data: fuelRecords,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get fuel record by DO number (searches both goingDo and returnDo)
 * Returns the fuel record along with the detected direction
 */
export const getFuelRecordByGoingDO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { doNumber } = req.params;
    
    // Check for NIL DO - these are expected for Driver Account and CASH entries
    const doNoUpper = (doNumber || '').toString().trim().toUpperCase();
    const isNilDO = doNoUpper === 'NIL' || doNoUpper === '' || doNoUpper === 'N/A';

    // Search by DO number only (DO numbers are unique enough)
    // Note: Removed date filtering because fuel record dates are stored as strings in various formats
    // (e.g., "6-Oct", "2025-10-06") which don't work reliably with $gte string comparison
    
    // Debug: Log what we're searching for
    logger.info(`[Fuel Record Lookup] Searching for DO: ${doNumber}`);
    
    // First try to find by goingDo, exclude cancelled records
    let fuelRecord = await FuelRecord.findOne({
      goingDo: doNumber,
      isDeleted: false,
      isCancelled: { $ne: true },
    }).sort({ createdAt: -1 }); // Get most recent if multiple exist

    let direction: 'going' | 'returning' = 'going';

    // If not found as goingDo, try returnDo, exclude cancelled records
    if (!fuelRecord) {
      fuelRecord = await FuelRecord.findOne({
        returnDo: doNumber,
        isDeleted: false,
        isCancelled: { $ne: true },
      }).sort({ createdAt: -1 }); // Get most recent if multiple exist
      direction = 'returning';
    }

    if (!fuelRecord) {
      // Debug: Check if record exists but is cancelled or deleted
      const anyRecord = await FuelRecord.findOne({
        $or: [{ goingDo: doNumber }, { returnDo: doNumber }]
      });
      
      if (anyRecord) {
        logger.info(`[Fuel Record Lookup] Record exists for DO ${doNumber} but is ${anyRecord.isCancelled ? 'CANCELLED' : ''} ${anyRecord.isDeleted ? 'DELETED' : ''}`);
      } else {
        logger.info(`[Fuel Record Lookup] No record exists at all for DO: ${doNumber}`);
      }
      
      // Don't log 404 for NIL DOs as they are expected
      if (!isNilDO) {
        logger.info(`Fuel record not found for DO: ${doNumber}`);
      }
      throw new ApiError(404, 'Fuel record not found');
    }
    
    // Debug: Log what we found
    logger.info(`[Fuel Record Lookup] Found record for DO ${doNumber} - Date: ${fuelRecord.date}, Truck: ${fuelRecord.truckNo}, Direction: ${direction}`);

    // Include direction in the response
    const responseData = {
      ...fuelRecord.toObject(),
      detectedDirection: direction
    };

    res.status(200).json({
      success: true,
      message: 'Fuel record retrieved successfully',
      data: responseData,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new fuel record
 */
export const createFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = matchedData(req, { locations: ['body'] }) as any;

    // Format truck number to standard format
    if (payload.truckNo) {
      payload.truckNo = formatTruckNumber(payload.truckNo);
    }
    
    // Check if truck already has an active fuel record
    const activeRecord = await FuelRecord.findOne({
      truckNo: payload.truckNo,
      journeyStatus: 'active',
      isDeleted: false,
    });

    if (activeRecord) {
      // Create as QUEUED journey instead of blocking
      const queuedRecords = await FuelRecord.countDocuments({
        truckNo: payload.truckNo,
        journeyStatus: 'queued',
        isDeleted: false,
      });
      
      payload.journeyStatus = 'queued';
      payload.queueOrder = queuedRecords + 1;
      payload.previousJourneyId = activeRecord._id.toString();
      
      logger.info(
        `Creating queued journey for truck ${payload.truckNo} (position: ${queuedRecords + 1}, waiting for: ${activeRecord.goingDo})`
      );
    } else {
      // No active journey - create as active
      payload.journeyStatus = 'active';
      payload.activatedAt = new Date();
      
      logger.info(`Creating active journey for truck ${payload.truckNo}`);
    }

    // Auto-populate month from date if date is provided
    if (payload.date && !payload.month) {
      const date = new Date(payload.date);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      payload.month = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    const fuelRecord = await FuelRecord.create(payload);

    logger.info(`Fuel record created for truck ${fuelRecord.truckNo} by ${req.user?.username}`);

    // Log audit trail
    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'FuelRecord',
      fuelRecord._id.toString(),
      { truckNo: fuelRecord.truckNo, goingDo: fuelRecord.goingDo, from: fuelRecord.from, to: fuelRecord.to },
      req.ip
    );

    // Check if configuration is missing and create notification
    if (fuelRecord.isLocked && fuelRecord.pendingConfigReason) {
      const missingFields: ('totalLiters' | 'extraFuel')[] = [];
      
      if (fuelRecord.pendingConfigReason === 'both') {
        missingFields.push('totalLiters', 'extraFuel');
      } else if (fuelRecord.pendingConfigReason === 'missing_total_liters') {
        missingFields.push('totalLiters');
      } else if (fuelRecord.pendingConfigReason === 'missing_extra_fuel') {
        missingFields.push('extraFuel');
      }

      // Extract truck suffix for notification
      const truckSuffix = fuelRecord.truckNo.split(' ').pop() || '';

      await createMissingConfigNotification(
        fuelRecord._id.toString(),
        missingFields,
        {
          doNumber: fuelRecord.goingDo,
          truckNo: fuelRecord.truckNo,
          destination: fuelRecord.to,
          truckSuffix,
        },
        req.user?.username || 'system',
        req.user?.role,
        req.user?.userId
      );

      logger.info(`Created notifications for locked fuel record ${fuelRecord._id} - missing: ${missingFields.join(', ')}`);
    }

    // Auto-link any pending yard fuel entries for this truck
    try {
      const { linkPendingYardFuelDirect } = await import('./yardFuelController');
      const linkResult = await linkPendingYardFuelDirect(
        fuelRecord._id.toString(),
        fuelRecord.truckNo,
        fuelRecord.goingDo,
        fuelRecord.date,
        req.user?.username || 'system'
      );

      if (linkResult.linkedCount > 0) {
        logger.info(
          `Auto-linked ${linkResult.linkedCount} pending yard fuel entry(ies) for truck ${fuelRecord.truckNo}`
        );
      }
    } catch (linkError: any) {
      // Don't fail the fuel record creation if linking fails
      logger.warn(`Failed to auto-link pending yard fuel for ${fuelRecord.truckNo}:`, linkError.message);
    }

    res.status(201).json({
      success: true,
      message: fuelRecord.isLocked 
        ? 'Fuel record created but locked - admin notification sent for missing configuration'
        : 'Fuel record created successfully',
      data: fuelRecord,
    });
    emitDataChange('fuel_records', 'create', fuelRecord.toObject());
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update fuel record
 */
export const updateFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = matchedData(req, { locations: ['body'] }) as any;

    // Extract version token and reason — must NOT be written to the DB
    const { clientUpdatedAt, reason: _reason, ...rawUpdates } = updates;

    // Enforce edit lock — the caller must hold a valid lock to update
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');
    await enforceEditLock(FuelRecord, id, username, 'fuel_records');

    // Strip fields the caller’s role is not allowed to write
    const safeUpdates = filterFuelRecordFields(rawUpdates, req.user?.role || 'fuel_order_maker') as any;

    // Auto-populate month from date if date is provided
    if (safeUpdates.date && !safeUpdates.month) {
      const date = new Date(safeUpdates.date);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      safeUpdates.month = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    // Check if we're filling in missing configuration
    const existingRecord = await FuelRecord.findOne({ _id: id, isDeleted: false });
    if (!existingRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    const wasLocked = existingRecord.isLocked;
    const fillingTotalLiters = existingRecord.totalLts === null && safeUpdates.totalLts !== null && safeUpdates.totalLts !== undefined;
    const fillingExtraFuel = existingRecord.extra === null && safeUpdates.extra !== null && safeUpdates.extra !== undefined;

    // Check if any balance-affecting fields are being updated
    const checkpointFields = [
      'mmsaYard', 'tangaYard', 'darYard', 'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing',
      'tdmGoing', 'zambiaGoing', 'congoFuel', 'zambiaReturn', 'tundumaReturn',
      'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn'
    ];
    
    const balanceFieldsUpdated = (
      safeUpdates.totalLts !== undefined ||
      safeUpdates.extra !== undefined ||
      checkpointFields.some(field => safeUpdates[field] !== undefined)
    );

    // Auto-unlock if all required fields are now provided
    if (wasLocked && (fillingTotalLiters || fillingExtraFuel)) {
      const willHaveTotalLts = fillingTotalLiters ? safeUpdates.totalLts : existingRecord.totalLts;
      const willHaveExtra = fillingExtraFuel ? safeUpdates.extra : existingRecord.extra;

      // Unlock if both values are now filled (not null)
      if (willHaveTotalLts !== null && willHaveExtra !== null) {
        safeUpdates.isLocked = false;
        safeUpdates.pendingConfigReason = null;
        logger.info(`Unlocking fuel record ${id} - all required fields now provided`);
      }
    }

    // ALWAYS recalculate balance when any balance-affecting field is updated
    // This ensures balance is correct whether record is locked or unlocked
    if (balanceFieldsUpdated) {
      // Get the final values (use updated values if provided, otherwise existing)
      const finalTotalLts = safeUpdates.totalLts !== undefined ? safeUpdates.totalLts : existingRecord.totalLts;
      const finalExtra = safeUpdates.extra !== undefined ? safeUpdates.extra : existingRecord.extra;
      
      // Get all checkpoint values (updated or existing)
      const getFinalValue = (field: string) => {
        return safeUpdates[field] !== undefined ? safeUpdates[field] : (existingRecord as any)[field];
      };
      
      // Calculate total fuel (handle null values for locked records)
      const totalFuel = (finalTotalLts || 0) + (finalExtra || 0);
      
      // Calculate total checkpoints (all stored as positive values)
      const totalCheckpoints = checkpointFields.reduce((sum, field) => {
        return sum + Math.abs(getFinalValue(field) || 0);
      }, 0);
      
      // Apply formula: Balance = (Total + Extra) - (All Checkpoints)
      safeUpdates.balance = totalFuel - totalCheckpoints;
      
      logger.info(`Recalculating balance for fuel record ${id}: (${finalTotalLts || 0} + ${finalExtra || 0}) - ${totalCheckpoints} = ${safeUpdates.balance}L`);
    }

    const fuelRecord = await FuelRecord.findOneAndUpdate(
      { _id: id, isDeleted: false },
      safeUpdates,
      { new: true, runValidators: true }
    );

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    logger.info(`Fuel record updated for truck ${fuelRecord.truckNo} by ${req.user?.username}`);

    // Log audit trail — capture every field that actually changed
    const auditFields = [
      'truckNo', 'goingDo', 'totalLts', 'extra', 'balance', 'isLocked',
      'mmsaYard', 'tangaYard', 'darYard', 'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing',
      'tdmGoing', 'zambiaGoing', 'congoFuel', 'zambiaReturn', 'tundumaReturn',
      'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
      'date', 'month', 'lpoNo', 'routeFrom', 'routeTo',
    ];
    const previousSnapshot: Record<string, any> = {};
    const newSnapshot: Record<string, any> = {};
    for (const field of auditFields) {
      const prev = (existingRecord as any)[field];
      const next = (fuelRecord as any)[field];
      const prevStr = JSON.stringify(prev);
      const nextStr = JSON.stringify(next);
      if (prevStr !== nextStr) {
        previousSnapshot[field] = prev;
        newSnapshot[field] = next;
      }
    }
    await AuditService.logUpdate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'FuelRecord',
      fuelRecord._id.toString(),
      Object.keys(previousSnapshot).length > 0 ? previousSnapshot : { truckNo: existingRecord.truckNo, goingDo: existingRecord.goingDo },
      Object.keys(newSnapshot).length > 0 ? newSnapshot : { truckNo: fuelRecord.truckNo, goingDo: fuelRecord.goingDo, isLocked: fuelRecord.isLocked },
      req.ip
    );

    // Auto-resolve notifications if record was unlocked
    if (wasLocked && !fuelRecord.isLocked) {
      await autoResolveNotifications(id, req.user?.username || 'admin');
      logger.info(`Fuel record ${id} unlocked and notifications resolved`);
    }

    // If this queued journey's start columns were just filled, the truck has begun
    // it — auto-complete the previous active journey and promote this one (live).
    await checkAndPromoteStartedJourney(fuelRecord, req.user?.username || 'system');

    res.status(200).json({
      success: true,
      message: wasLocked && !fuelRecord.isLocked 
        ? 'Fuel record updated and unlocked successfully'
        : 'Fuel record updated successfully',
      data: fuelRecord,
    });
    emitDataChange('fuel_records', 'update', fuelRecord.toObject());
  } catch (error: any) {
    throw error;
  }
};

export const cancelFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const existingRecord = await FuelRecord.findOne({ _id: id, isDeleted: false });
    if (!existingRecord) throw new ApiError(404, 'Fuel record not found');

    if (existingRecord.isCancelled) {
      throw new ApiError(409, 'Fuel record is already cancelled');
    }

    const fuelRecord = await FuelRecord.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isCancelled: true, cancelledAt: new Date(), cancelledBy: username },
      { new: true, runValidators: true }
    );

    if (!fuelRecord) throw new ApiError(404, 'Fuel record not found');

    await AuditService.logUpdate(
      req.user?.userId || 'system',
      username,
      'FuelRecord',
      fuelRecord._id.toString(),
      { isCancelled: false },
      { isCancelled: true, cancelledBy: username },
      req.ip
    );

    logger.info(`Fuel record ${id} cancelled by ${username}`);

    res.status(200).json({
      success: true,
      message: 'Fuel record cancelled successfully',
      data: fuelRecord,
    });
    emitDataChange('fuel_records', 'update', fuelRecord.toObject());
  } catch (error: any) {
    throw error;
  }
};

export const uncancelFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const existingRecord = await FuelRecord.findOne({ _id: id, isDeleted: false });
    if (!existingRecord) throw new ApiError(404, 'Fuel record not found');

    if (!existingRecord.isCancelled) {
      throw new ApiError(409, 'Fuel record is not cancelled');
    }

    const fuelRecord = await FuelRecord.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        isCancelled: false,
        uncancelledAt: new Date(),
        uncancelledBy: username,
        $unset: { cancelledAt: '', cancelledBy: '', cancellationReason: '' },
      },
      { new: true, runValidators: true }
    );

    if (!fuelRecord) throw new ApiError(404, 'Fuel record not found');

    await AuditService.logUpdate(
      req.user?.userId || 'system',
      username,
      'FuelRecord',
      fuelRecord._id.toString(),
      { isCancelled: true },
      { isCancelled: false, uncancelledBy: username },
      req.ip
    );

    logger.info(`Fuel record ${id} uncancelled by ${username}`);

    res.status(200).json({
      success: true,
      message: 'Fuel record uncancelled successfully',
      data: fuelRecord,
    });
    emitDataChange('fuel_records', 'update', fuelRecord.toObject());
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get monthly fuel summary
 */
export const getMonthlyFuelSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year } = req.query;

    const filter: any = { isDeleted: false };
    
    if (month) {
      const sanitized = sanitizeRegexInput(month as string);
      if (sanitized) {
        filter.month = { $regex: sanitized, $options: 'i' };
      }
    }

    const fuelRecords = await FuelRecord.find(filter).lean();

    // Calculate summary
    const summary = {
      totalRecords: fuelRecords.length,
      totalFuel: fuelRecords.reduce((sum, record) => sum + (record.totalLts || 0), 0),
      totalBalance: fuelRecords.reduce((sum, record) => sum + record.balance, 0),
      yardTotals: {
        mmsa: fuelRecords.reduce((sum, record) => sum + (record.mmsaYard || 0), 0),
        tanga: fuelRecords.reduce((sum, record) => sum + (record.tangaYard || 0), 0),
        dar: fuelRecords.reduce((sum, record) => sum + (record.darYard || 0), 0),
      },
    };

    res.status(200).json({
      success: true,
      message: 'Monthly fuel summary retrieved successfully',
      data: summary,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get comprehensive details for a fuel record including all LPOs, delivery orders, and fuel allocations
 */
export const getFuelRecordDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get the fuel record
    const fuelRecord = await FuelRecord.findOne({ _id: id, isDeleted: false }).lean();

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    // Import models we need
    const DeliveryOrder = require('../models').DeliveryOrder;
    const YardFuelDispense = require('../models').YardFuelDispense;
    const DriverAccountEntry = require('../models').DriverAccountEntry;
    const LPOSummary = require('../models').LPOSummary;
    const TangaLPODocument = require('../models').TangaLPODocument;
    const DarLPODocument = require('../models').DarLPODocument;

    // Get the going delivery order
    const goingDO = await DeliveryOrder.findOne({
      doNumber: fuelRecord.goingDo,
      isDeleted: false,
    }).lean();

    // Get the return delivery order (if exists)
    let returnDO = null;
    if (fuelRecord.returnDo) {
      returnDO = await DeliveryOrder.findOne({
        doNumber: fuelRecord.returnDo,
        isDeleted: false,
      }).lean();
    }

    // Get all LPO entries for this truck that are related to this journey
    // Use DO numbers as the primary reference since they are unique per journey
    // A journey has a goingDo (IMPORT) and optionally a returnDo (EXPORT)
    // LPOs are linked to the journey via the doSdo field matching either DO number
    
    const doConditions: any[] = [
      { 'entries.doNo': fuelRecord.goingDo, 'entries.truckNo': fuelRecord.truckNo },
    ];
    if (fuelRecord.returnDo && fuelRecord.returnDo.trim() !== '') {
      doConditions.push({ 'entries.doNo': fuelRecord.returnDo, 'entries.truckNo': fuelRecord.truckNo });
    }

    const lpoEntries = await LPOSummary.aggregate([
      { $match: { isDeleted: false, $or: doConditions } },
      { $unwind: '$entries' },
      { $match: { $or: doConditions } },
      {
        $project: {
          _id: '$entries._id',
          lpoNo: 1,
          date: 1,
          dieselAt: '$station',
          doSdo: { $ifNull: ['$entries.doNo', 'PENDING'] },
          truckNo: '$entries.truckNo',
          ltrs: '$entries.liters',
          pricePerLtr: '$entries.rate',
          destinations: { $ifNull: ['$entries.dest', 'PENDING'] },
          isDriverAccount: { $ifNull: ['$entries.isDriverAccount', false] },
          isCancelled: { $ifNull: ['$entries.isCancelled', false] },
          originalLtrs: '$entries.originalLiters',
          goingCheckpoint: '$entries.goingCheckpoint',
          returningCheckpoint: '$entries.returningCheckpoint',
        },
      },
      { $sort: { date: 1 } },
    ]);

    // Calculate journey date range for CASH/NIL DO entries
    // Journey starts from fuel record date and ends when balance reaches 0 or the last LPO date
    const journeyStartDate = new Date(fuelRecord.date);
    let journeyEndDate: Date;
    
    // Find the last LPO date to determine journey end
    if (lpoEntries.length > 0) {
      const lastLpoDate = new Date(lpoEntries[lpoEntries.length - 1].date);
      // Add buffer of 7 days after last LPO for any additional CASH entries
      journeyEndDate = new Date(lastLpoDate);
      journeyEndDate.setDate(journeyEndDate.getDate() + 7);
    } else {
      // If no LPOs found, use 60 days from start as maximum journey duration
      journeyEndDate = new Date(journeyStartDate);
      journeyEndDate.setDate(journeyEndDate.getDate() + 60);
    }
    
    // Also fetch CASH mode entries with NIL DO for this truck within the journey date range
    // These are additional fuel entries when:
    // 1. A station is out of fuel and driver gets fuel from another station via cash
    // 2. Driver gets extra fuel due to circumstances (theft, etc.)
    // These entries have doSdo = 'NIL' and destinations = 'NIL'
    const journeyFromStr = journeyStartDate.toISOString().split('T')[0];
    const journeyToStr   = journeyEndDate.toISOString().split('T')[0];

    const cashLpoEntries = await LPOSummary.aggregate([
      {
        $match: {
          isDeleted: false,
          date: { $gte: journeyFromStr, $lte: journeyToStr },
          'entries.truckNo': fuelRecord.truckNo,
          $or: [
            { 'entries.doNo': { $in: ['NIL', 'nil', ''] } },
            { 'entries.dest': { $in: ['NIL', 'nil'] } },
          ],
        },
      },
      { $unwind: '$entries' },
      {
        $match: {
          'entries.truckNo': fuelRecord.truckNo,
          $or: [
            { 'entries.doNo': { $in: ['NIL', 'nil', ''] } },
            { 'entries.dest': { $in: ['NIL', 'nil'] } },
          ],
        },
      },
      {
        $project: {
          _id: '$entries._id',
          lpoNo: 1,
          date: 1,
          dieselAt: '$station',
          doSdo: { $ifNull: ['$entries.doNo', 'NIL'] },
          truckNo: '$entries.truckNo',
          ltrs: '$entries.liters',
          pricePerLtr: '$entries.rate',
          destinations: { $ifNull: ['$entries.dest', 'NIL'] },
          isDriverAccount: { $ifNull: ['$entries.isDriverAccount', false] },
          isCancelled: { $ifNull: ['$entries.isCancelled', false] },
          originalLtrs: '$entries.originalLiters',
          goingCheckpoint: '$entries.goingCheckpoint',
          returningCheckpoint: '$entries.returningCheckpoint',
        },
      },
      { $sort: { date: 1 } },
    ]);

    // Also fetch Driver Account LPO entries from LPO Summary
    // These are created when driver account entries are added
    const driverAccountLPOs = await LPOSummary.find({
      orderOf: 'DRIVER ACCOUNT',
      'entries.truckNo': fuelRecord.truckNo,
      date: { 
        $gte: journeyStartDate.toISOString().split('T')[0],
        $lte: journeyEndDate.toISOString().split('T')[0]
      },
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Convert driver account LPO summaries to LPO entry format
    const driverAccountEntryFormat: any[] = [];
    for (const summary of driverAccountLPOs) {
      for (const entry of summary.entries) {
        if (entry.truckNo === fuelRecord.truckNo) {
          driverAccountEntryFormat.push({
            _id: entry._id,
            lpoNo: summary.lpoNo,
            date: summary.date,
            dieselAt: summary.station,
            doSdo: entry.doNo,  // This will be 'NIL'
            truckNo: entry.truckNo,
            ltrs: entry.liters,
            pricePerLtr: entry.rate,
            destinations: entry.dest,  // This will be 'NIL'
            isDriverAccount: true,
            originalDoNo: entry.originalDoNo,  // The reference DO
            isCancelled: entry.isCancelled ?? false,
            originalLtrs: entry.originalLiters ?? null,
            goingCheckpoint: entry.goingCheckpoint ?? null,
            returningCheckpoint: entry.returningCheckpoint ?? null,
          });
        }
      }
    }

    // Fetch Tanga depot LPOs for this truck's going/return DO
    const tangaLpoEntries = await TangaLPODocument.aggregate([
      { $match: { isDeleted: false, $or: doConditions } },
      { $unwind: '$entries' },
      { $match: { $or: doConditions } },
      {
        $project: {
          _id: '$entries._id',
          lpoNo: 1,
          date: 1,
          dieselAt: { $literal: 'Tanga' },
          doSdo: { $ifNull: ['$entries.doNo', 'PENDING'] },
          truckNo: '$entries.truckNo',
          ltrs: { $ifNull: ['$entries.dispenseLiters', '$entries.liters'] },
          pricePerLtr: '$entries.rate',
          destinations: { $ifNull: ['$entries.dest', 'PENDING'] },
          isDriverAccount: { $literal: false },
          isCancelled: { $ifNull: ['$entries.isCancelled', false] },
          originalLtrs: '$entries.liters',
          goingCheckpoint: { $literal: null },
          returningCheckpoint: { $literal: null },
          source: { $literal: 'tanga' },
        },
      },
      { $sort: { date: 1 } },
    ]);

    // Fetch Dar depot LPOs for this truck's going/return DO
    const darLpoEntries = await DarLPODocument.aggregate([
      { $match: { isDeleted: false, $or: doConditions } },
      { $unwind: '$entries' },
      { $match: { $or: doConditions } },
      {
        $project: {
          _id: '$entries._id',
          lpoNo: 1,
          date: 1,
          dieselAt: { $literal: 'Dar' },
          doSdo: { $ifNull: ['$entries.doNo', 'PENDING'] },
          truckNo: '$entries.truckNo',
          ltrs: { $ifNull: ['$entries.dispenseLiters', '$entries.liters'] },
          pricePerLtr: '$entries.rate',
          destinations: { $ifNull: ['$entries.dest', 'PENDING'] },
          isDriverAccount: { $literal: false },
          isCancelled: { $ifNull: ['$entries.isCancelled', false] },
          originalLtrs: '$entries.liters',
          goingCheckpoint: { $literal: null },
          returningCheckpoint: { $literal: null },
          source: { $literal: 'dar' },
        },
      },
      { $sort: { date: 1 } },
    ]);

    // Combine regular LPO entries with CASH/NIL entries
    const allLpoEntries = [...lpoEntries];

    // Add CASH entries that aren't already included (check by _id to avoid duplicates)
    const existingIds = new Set(lpoEntries.map((e: any) => e._id?.toString()));
    for (const cashEntry of cashLpoEntries) {
      if (!existingIds.has(cashEntry._id?.toString())) {
        allLpoEntries.push(cashEntry);
      }
    }

    // Add driver account entries (with unique check)
    for (const daEntry of driverAccountEntryFormat) {
      if (!existingIds.has(daEntry._id?.toString())) {
        allLpoEntries.push(daEntry);
        existingIds.add(daEntry._id?.toString());
      }
    }

    // Add Tanga and Dar depot LPO entries (with unique check)
    for (const entry of [...tangaLpoEntries, ...darLpoEntries]) {
      if (!existingIds.has(entry._id?.toString())) {
        allLpoEntries.push(entry);
        existingIds.add(entry._id?.toString());
      }
    }
    
    // Sort combined entries by date
    allLpoEntries.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Since we're using the unique DO numbers to fetch LPOs, all results are already 
    // specific to this journey - no additional date filtering needed
    const filteredLPOs = allLpoEntries;

    // Get yard fuel dispenses for this truck related to this journey
    // Use the same logic - DO numbers are the primary reference
    const yardQueryConditions: any[] = [
      { linkedDONumber: fuelRecord.goingDo },
      { truckNo: fuelRecord.truckNo, linkedFuelRecordId: id }
    ];
    
    if (fuelRecord.returnDo && fuelRecord.returnDo.trim() !== '') {
      yardQueryConditions.push({ linkedDONumber: fuelRecord.returnDo });
    }
    
    const yardDispenses = await YardFuelDispense.find({
      $or: yardQueryConditions,
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Calculate fuel allocation summary
    const goingFuelAllocations = {
      tangaYard: fuelRecord.tangaYard || 0,
      darYard: fuelRecord.darYard || 0,
      tangaGoing: fuelRecord.tangaGoing || 0,
      darGoing: fuelRecord.darGoing || 0,
      moroGoing: fuelRecord.moroGoing || 0,
      mbeyaGoing: fuelRecord.mbeyaGoing || 0,
      tdmGoing: fuelRecord.tdmGoing || 0,
      zambiaGoing: fuelRecord.zambiaGoing || 0,
      congoFuel: fuelRecord.congoFuel || 0,
    };

    const returnFuelAllocations = {
      zambiaReturn: fuelRecord.zambiaReturn || 0,
      tundumaReturn: fuelRecord.tundumaReturn || 0,
      mbeyaReturn: fuelRecord.mbeyaReturn || 0,
      moroReturn: fuelRecord.moroReturn || 0,
      darReturn: fuelRecord.darReturn || 0,
      tangaReturn: fuelRecord.tangaReturn || 0,
    };

    // Compile comprehensive response
    const details = {
      fuelRecord: {
        ...fuelRecord,
        id: fuelRecord._id,
      },
      journeyInfo: {
        // Going journey info (original if EXPORT changed it)
        goingJourney: {
          from: fuelRecord.originalGoingFrom || fuelRecord.from,
          to: fuelRecord.originalGoingTo || fuelRecord.to,
          doNumber: fuelRecord.goingDo,
          start: fuelRecord.start,
          deliveryOrder: goingDO ? {
            ...goingDO,
            id: goingDO._id,
          } : null,
        },
        // Return journey info (if exists)
        returnJourney: fuelRecord.returnDo ? {
          from: fuelRecord.from, // Current from is the return journey from
          to: fuelRecord.to, // Current to is the return journey to
          doNumber: fuelRecord.returnDo,
          deliveryOrder: returnDO ? {
            ...returnDO,
            id: returnDO._id,
          } : null,
        } : null,
        // Current status
        isOnReturnJourney: !!fuelRecord.returnDo,
        hasDestinationChanged: !!(fuelRecord.originalGoingFrom || fuelRecord.originalGoingTo),
      },
      fuelAllocations: {
        total: fuelRecord.totalLts,
        extra: fuelRecord.extra || 0,
        balance: fuelRecord.balance,
        going: goingFuelAllocations,
        return: returnFuelAllocations,
        totalGoingFuel: Object.values(goingFuelAllocations).reduce((a, b) => a + Math.abs(b), 0),
        totalReturnFuel: Object.values(returnFuelAllocations).reduce((a, b) => a + Math.abs(b), 0),
      },
      lpoEntries: filteredLPOs.map((lpo: any) => {
        // Checkpoint label lookup
        const CHECKPOINT_LABELS: Record<string, string> = {
          DAR_GOING: 'DrG', MORO_GOING: 'MoG', MBEYA_GOING: 'MbG', INFINITY_GOING: 'MbG',
          TDM_GOING: 'TdG', ZAMBIA_GOING: 'ZmG', CONGO_GOING: 'Cng',
          ZAMBIA_RETURNING: 'ZmR', TDM_RETURN: 'TdR', MBEYA_RETURN: 'MbR',
          MORO_RETURN: 'MoR', DAR_RETURN: 'DrR', TANGA_RETURN: 'TnR',
          CONGO_RETURNING: 'Cng', CUSTOM_GOING: 'Cst', CUSTOM_RETURN: 'Cst',
        };
        const stationCheckpointFallback = (station: string, isReturn: boolean): string => {
          const s = (station || '').toUpperCase();
          if (s.startsWith('LAKE') && !s.includes('TUNDUMA')) return isReturn ? 'ZmR' : 'ZmG';
          if (s.includes('TUNDUMA')) return isReturn ? 'TdR' : 'TdG';
          if (s.includes('INFINITY') || s.includes('MBEYA')) return isReturn ? 'MbR' : 'MbG';
          if (s.includes('MOROGORO') || s.includes('KANGE') || s.includes('GBP') || s.includes('GPB')) return isReturn ? 'MoR' : 'MoG';
          if (s.includes('TANGA')) return isReturn ? 'TnR' : 'TnG';
          if (s.includes('DAR') || s === 'CASH') return isReturn ? 'DrR' : 'DrG';
          return '';
        };

        // Determine journey type
        let journeyType: 'going' | 'return' | 'cash' | 'driver_account' | 'related';
        const isNilDo = !lpo.doSdo || lpo.doSdo === 'NIL' || lpo.doSdo === 'nil' || lpo.doSdo === '';
        const isNilDest = !lpo.destinations || lpo.destinations === 'NIL' || lpo.destinations === 'nil' || lpo.destinations === '';
        const isDriverAccount = lpo.isDriverAccount === true;
        
        if (isDriverAccount) {
          journeyType = 'driver_account'; // Driver's account entry
        } else if (isNilDo || isNilDest) {
          journeyType = 'cash'; // Cash mode payment (extra fuel or station out of fuel)
        } else if (lpo.doSdo === fuelRecord.goingDo) {
          journeyType = 'going';
        } else if (lpo.doSdo === fuelRecord.returnDo) {
          journeyType = 'return';
        } else {
          journeyType = 'related';
        }
        
        const isReturn = journeyType === 'return';
        const rawCheckpoint = isReturn ? lpo.returningCheckpoint : lpo.goingCheckpoint;
        const checkpoint = rawCheckpoint
          ? (CHECKPOINT_LABELS[rawCheckpoint] || rawCheckpoint)
          : stationCheckpointFallback(lpo.dieselAt, isReturn);

        return {
          ...lpo,
          id: lpo._id,
          journeyType,
          checkpoint,
          isDriverAccount: lpo.isDriverAccount || false,
          originalDoNo: lpo.originalDoNo,  // Reference DO for driver account entries
        };
      }),
      yardDispenses: yardDispenses.map((dispense: any) => ({
        ...dispense,
        id: dispense._id,
      })),
      summary: {
        totalLPOs: filteredLPOs.length,
        totalYardDispenses: yardDispenses.length,
        totalFuelOrdered: filteredLPOs.reduce((sum: number, lpo: any) => sum + (lpo.ltrs || 0), 0),
        totalYardFuel: yardDispenses.reduce((sum: number, d: any) => sum + (d.liters || 0), 0),
        goingLPOs: filteredLPOs.filter((lpo: any) => lpo.doSdo === fuelRecord.goingDo).length,
        returnLPOs: filteredLPOs.filter((lpo: any) => lpo.doSdo === fuelRecord.returnDo).length,
        cashLPOs: filteredLPOs.filter((lpo: any) => {
          const isNilDo = !lpo.doSdo || lpo.doSdo === 'NIL' || lpo.doSdo === 'nil' || lpo.doSdo === '';
          return isNilDo && !lpo.isDriverAccount;
        }).length,
        driverAccountLPOs: filteredLPOs.filter((lpo: any) => lpo.isDriverAccount === true).length,
        tangaLPOs: filteredLPOs.filter((lpo: any) => lpo.source === 'tanga').length,
        darLPOs: filteredLPOs.filter((lpo: any) => lpo.source === 'dar').length,
      },
    };

    res.status(200).json({
      success: true,
      message: 'Fuel record details retrieved successfully',
      data: details,
    });
  } catch (error: any) {
    throw error;
  }
};
