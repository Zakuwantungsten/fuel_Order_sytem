import { Response } from 'express';
import { LPOSummary, LPOWorkbook, FuelRecord, DriverAccountEntry, LPOEntry } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';
import ExcelJS from 'exceljs';

// Mapping from station to fuel record field for updating
// Updated: Removed invalid station names (MBEYA GOING, TUNDUMA RETURN, etc.)
// INFINITY = Mbeya station (both directions)
// LAKE TUNDUMA = Tunduma station (return)
// GBP KANGE = Tanga Return (for Mombasa/MSA destinations)
const STATION_TO_FUEL_FIELD: Record<string, { going?: string; returning?: string }> = {
  // Zambia stations - going direction uses zambiaGoing, return uses zambiaReturn
  'LAKE CHILABOMBWE': { going: 'zambiaGoing', returning: 'zambiaReturn' },
  'LAKE NDOLA': { going: 'zambiaGoing', returning: 'zambiaReturn' },  // Return: 50L split
  'LAKE KAPIRI': { going: 'zambiaGoing', returning: 'zambiaReturn' }, // Return: 350L split
  'LAKE KITWE': { going: 'zambiaGoing', returning: 'zambiaReturn' },
  'LAKE KABANGWA': { going: 'zambiaGoing', returning: 'zambiaReturn' },
  'LAKE CHINGOLA': { going: 'zambiaGoing', returning: 'zambiaReturn' },
  // Tanzania stations
  'LAKE TUNDUMA': { going: 'tdmGoing', returning: 'tundumaReturn' }, // Tunduma checkpoint
  'INFINITY': { going: 'mbeyaGoing', returning: 'mbeyaReturn' },      // Mbeya checkpoint (both directions)
  'GBP MOROGORO': { going: 'moroGoing', returning: 'moroReturn' },    // Morogoro checkpoint
  'GBP KANGE': { going: 'moroGoing', returning: 'tangaReturn' },      // Tanga Return (70L for Mombasa/MSA)
  'GPB KANGE': { going: 'moroGoing', returning: 'tangaReturn' },      // Typo version - Tanga Return
  // Cash can be used at any checkpoint - context determines the field
  'CASH': { going: 'darGoing', returning: 'darReturn' },              // Default to Dar fields for cash
};

// Station rates reference (for documentation/validation)
const STATION_RATES: Record<string, { rate: number; currency: 'USD' | 'TZS' }> = {
  'LAKE CHILABOMBWE': { rate: 1.2, currency: 'USD' },
  'LAKE NDOLA': { rate: 1.2, currency: 'USD' },
  'LAKE KAPIRI': { rate: 1.2, currency: 'USD' },
  'LAKE KITWE': { rate: 1.2, currency: 'USD' },
  'LAKE KABANGWA': { rate: 1.2, currency: 'USD' },
  'LAKE CHINGOLA': { rate: 1.2, currency: 'USD' },
  'LAKE TUNDUMA': { rate: 2875, currency: 'TZS' },
  'INFINITY': { rate: 2757, currency: 'TZS' },
  'GBP MOROGORO': { rate: 2710, currency: 'TZS' },
  'GBP KANGE': { rate: 2730, currency: 'TZS' },
  'GPB KANGE': { rate: 2730, currency: 'TZS' },
  'CASH': { rate: 0, currency: 'TZS' }, // Variable rate
};

/**
 * Find fuel record and determine direction
 * Search logic: current month → previous month → two months ago
 * If found with balance=0, journey is complete (no update needed)
 */
async function findFuelRecordWithDirection(
  doNumber: string,
  truckNo: string
): Promise<{ fuelRecord: any; direction: 'going' | 'returning'; journeyComplete: boolean } | null> {
  // First try to find by DO number
  let fuelRecord = await FuelRecord.findOne({
    goingDo: doNumber,
    isDeleted: false,
  });

  let direction: 'going' | 'returning' = 'going';

  if (!fuelRecord) {
    fuelRecord = await FuelRecord.findOne({
      returnDo: doNumber,
      isDeleted: false,
    });
    direction = 'returning';
  }

  // If not found by DO, search by truck number with month-based priority
  if (!fuelRecord) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    // Get all records for this truck
    const truckRecords = await FuelRecord.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ date: -1 });

    if (truckRecords.length === 0) {
      return null;
    }

    // Helper to check if a date is within a specific month
    const isInMonth = (dateStr: string, monthStart: Date): boolean => {
      const date = new Date(dateStr);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      return date >= monthStart && date <= monthEnd;
    };

    // Search for active record: current month → previous month → two months ago
    fuelRecord = truckRecords.find((r: any) => 
      isInMonth(r.date, currentMonth) && r.balance > 0
    ) || null;

    if (!fuelRecord) {
      fuelRecord = truckRecords.find((r: any) => 
        isInMonth(r.date, previousMonth) && r.balance > 0
      ) || null;
    }

    if (!fuelRecord) {
      fuelRecord = truckRecords.find((r: any) => 
        isInMonth(r.date, twoMonthsAgo) && r.balance > 0
      ) || null;
    }

    // If still no active record with balance > 0
    if (!fuelRecord) {
      const mostRecent = truckRecords[0];
      if (mostRecent && mostRecent.balance === 0) {
        // Journey complete - return record but flag it
        logger.info(`Truck ${truckNo}: Journey complete (balance=0), no fuel update needed`);
        return { fuelRecord: mostRecent, direction: 'going', journeyComplete: true };
      }
      return null;
    }
  }

  if (!fuelRecord) {
    return null;
  }

  return { fuelRecord, direction, journeyComplete: false };
}

/**
 * Update fuel record when LPO entry is created/updated
 * @param litersChange - positive for deduction, negative for reverting
 */
async function updateFuelRecordForLPOEntry(
  doNumber: string,
  litersChange: number,
  station: string,
  truckNo: string
): Promise<void> {
  try {
    logger.info(`Updating fuel record: DO=${doNumber}, truck=${truckNo}, station=${station}, litersChange=${litersChange}`);
    
    const result = await findFuelRecordWithDirection(doNumber, truckNo);
    
    if (!result) {
      logger.warn(`No fuel record found for DO ${doNumber} or truck ${truckNo} to update`);
      return;
    }

    const { fuelRecord, direction, journeyComplete } = result;

    // If journey is complete (balance=0), don't update
    if (journeyComplete) {
      logger.warn(`Journey complete for truck ${truckNo} (balance=0). No fuel update needed.`);
      return;
    }

    const stationUpper = station.toUpperCase().trim();
    const fieldMapping = STATION_TO_FUEL_FIELD[stationUpper];

    logger.info(`Found fuel record ${fuelRecord._id} for truck ${truckNo}, direction=${direction}, station=${stationUpper}`);

    if (!fieldMapping) {
      logger.warn(`No field mapping for station "${stationUpper}" - available: ${Object.keys(STATION_TO_FUEL_FIELD).join(', ')}`);
      return;
    }

    let fieldToUpdate = direction === 'going' ? fieldMapping.going : fieldMapping.returning;

    if (!fieldToUpdate) {
      fieldToUpdate = direction === 'going' ? fieldMapping.returning : fieldMapping.going;
    }

    if (!fieldToUpdate) {
      logger.warn(`No valid field to update for station ${station} direction ${direction}`);
      return;
    }

    const currentValue = (fuelRecord as any)[fieldToUpdate] || 0;
    const newValue = currentValue - litersChange;
    const updateData: any = {};
    updateData[fieldToUpdate] = newValue;
    updateData.balance = fuelRecord.balance - litersChange;

    logger.info(`Updating field ${fieldToUpdate}: ${currentValue} -> ${newValue} (change: ${litersChange})`);

    await FuelRecord.findByIdAndUpdate(
      fuelRecord._id,
      { $set: updateData },
      { new: true }
    );

    logger.info(`✓ Updated fuel record ${fuelRecord._id} field ${fieldToUpdate}: ${litersChange > 0 ? '-' : '+'}${Math.abs(litersChange)}L`);
  } catch (error: any) {
    logger.error(`Error updating fuel record for LPO: ${error.message}`);
  }
}

/**
 * Get or create workbook for a specific year
 */
async function getOrCreateWorkbook(year: number): Promise<any> {
  let workbook = await LPOWorkbook.findOne({ year, isDeleted: false });

  if (!workbook) {
    workbook = await LPOWorkbook.create({
      year,
      name: `LPOS ${year}`,
    });
    logger.info(`Created new workbook for year ${year}`);
  }

  return workbook;
}

/**
 * Get all workbooks
 */
export const getAllWorkbooks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workbooks = await LPOWorkbook.find({ isDeleted: false })
      .sort({ year: -1 })
      .lean();

    const workbooksWithCounts = await Promise.all(
      workbooks.map(async (wb) => {
        const sheetCount = await LPOSummary.countDocuments({ year: wb.year, isDeleted: false });
        return {
          ...wb,
          id: wb._id,
          sheetCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Workbooks retrieved successfully',
      data: workbooksWithCounts,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get workbook by year with all its sheets (LPO documents)
 * Supports optional month filtering via query params
 * - months: comma-separated list of months (1-12) e.g., "11,12" for Nov & Dec
 */
export const getWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);
    const { months } = req.query;

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    let workbook = await LPOWorkbook.findOne({ year, isDeleted: false });

    // Auto-create workbook if it doesn't exist
    if (!workbook) {
      workbook = await getOrCreateWorkbook(year);
    }

    // Build filter for sheets
    const sheetFilter: any = { year, isDeleted: false };
    
    // If months parameter is provided, filter by month
    if (months && typeof months === 'string') {
      const monthNumbers = months.split(',').map(m => parseInt(m.trim(), 10)).filter(m => m >= 1 && m <= 12);
      
      if (monthNumbers.length > 0) {
        // Filter by date field - extract month from date string (YYYY-MM-DD format)
        sheetFilter.$expr = {
          $in: [{ $month: { $dateFromString: { dateString: '$date' } } }, monthNumbers]
        };
      }
    }

    const sheets = await LPOSummary.find(sheetFilter)
      .sort({ lpoNo: 1 })
      .lean();

    res.status(200).json({
      success: true,
      message: 'Workbook retrieved successfully',
      data: {
        ...workbook!.toObject(),
        id: workbook!._id,
        sheets: sheets.map((s) => ({ ...s, id: s._id })),
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all LPO documents with pagination and filters
 */
export const getAllLPOSummaries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, lpoNo, station, year } = req.query;

    const filter: any = { isDeleted: false };

    if (year) {
      filter.year = parseInt(year as string, 10);
    }

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    if (lpoNo) {
      filter.lpoNo = { $regex: lpoNo, $options: 'i' };
    }

    if (station) {
      filter.station = { $regex: station, $options: 'i' };
    }

    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [lpoSummaries, total] = await Promise.all([
      LPOSummary.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      LPOSummary.countDocuments(filter),
    ]);

    const response = createPaginatedResponse(lpoSummaries, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'LPO documents retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single LPO document by ID
 */
export const getLPOSummaryById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lpoSummary = await LPOSummary.findOne({ _id: id, isDeleted: false });

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    // Return with id field for frontend compatibility
    const responseData = lpoSummary.toObject();
    
    res.status(200).json({
      success: true,
      message: 'LPO document retrieved successfully',
      data: { ...responseData, id: responseData._id },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get LPO document by LPO number
 */
export const getLPOSummaryByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lpoNo } = req.params;

    const lpoSummary = await LPOSummary.findOne({ lpoNo, isDeleted: false });

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    // Return with id field for frontend compatibility
    const responseData = lpoSummary.toObject();
    
    res.status(200).json({
      success: true,
      message: 'LPO document retrieved successfully',
      data: { ...responseData, id: responseData._id },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get the next available LPO number
 */
export const getNextLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lastLpo = await LPOSummary.findOne({ isDeleted: false })
      .sort({ lpoNo: -1 })
      .select('lpoNo')
      .lean();

    let nextNumber = 2445;

    if (lastLpo && lastLpo.lpoNo) {
      const lastNumber = parseInt(lastLpo.lpoNo, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    let exists = await LPOSummary.exists({ lpoNo: nextNumber.toString(), isDeleted: false });
    while (exists) {
      nextNumber++;
      exists = await LPOSummary.exists({ lpoNo: nextNumber.toString(), isDeleted: false });
    }

    res.status(200).json({
      success: true,
      message: 'Next LPO number retrieved successfully',
      data: { nextLpoNo: nextNumber.toString() },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Helper function to sync LPOEntry records with LPOSummary
 * Creates corresponding LPOEntry records for each entry in the LPOSummary
 * This ensures the list view stays in sync with the workbook view
 */
const syncLPOEntriesToList = async (
  lpoSummary: any,
  station: string,
  date: string
): Promise<void> => {
  try {
    if (!lpoSummary.entries || lpoSummary.entries.length === 0) {
      return;
    }

    // Get the highest SN for LPOEntry to continue numbering
    const lastEntry = await LPOEntry.findOne({ isDeleted: false })
      .sort({ sn: -1 })
      .select('sn')
      .lean();
    let nextSn = lastEntry ? lastEntry.sn + 1 : 1;

    // Create LPOEntry records for each entry in the LPOSummary
    for (const entry of lpoSummary.entries) {
      // Skip cancelled entries - they shouldn't appear in list view
      if (entry.isCancelled) {
        logger.info(`Skipping LPOEntry creation for cancelled entry: ${entry.truckNo}`);
        continue;
      }

      // Create the LPOEntry record
      await LPOEntry.create({
        sn: nextSn++,
        date: date,
        lpoNo: lpoSummary.lpoNo,
        dieselAt: station,
        doSdo: entry.doNo || 'PENDING',
        truckNo: entry.truckNo,
        ltrs: entry.liters,
        pricePerLtr: entry.rate,
        destinations: entry.dest || 'PENDING',
        originalLtrs: entry.originalLiters || null,
        amendedAt: entry.amendedAt || null,
      });
    }

    logger.info(`Synced ${lpoSummary.entries.length} LPOEntry records for LPO ${lpoSummary.lpoNo}`);
  } catch (error: any) {
    logger.error(`Error syncing LPOEntry records for LPO ${lpoSummary.lpoNo}: ${error.message}`);
    // Don't throw - this is a sync operation, main LPO creation should succeed
  }
};

/**
 * Helper function to update LPOEntry records when LPOSummary is updated
 * Syncs changes from workbook to list view
 */
const syncLPOEntriesOnUpdate = async (
  lpoNo: string,
  entries: any[],
  station: string,
  date: string
): Promise<void> => {
  try {
    // Delete existing LPOEntry records for this LPO
    await LPOEntry.updateMany(
      { lpoNo, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() }
    );

    // Get the highest SN for LPOEntry to continue numbering
    const lastEntry = await LPOEntry.findOne({ isDeleted: false })
      .sort({ sn: -1 })
      .select('sn')
      .lean();
    let nextSn = lastEntry ? lastEntry.sn + 1 : 1;

    // Recreate LPOEntry records from updated entries
    for (const entry of entries) {
      // Skip cancelled entries
      if (entry.isCancelled) {
        continue;
      }

      await LPOEntry.create({
        sn: nextSn++,
        date: date,
        lpoNo: lpoNo,
        dieselAt: station,
        doSdo: entry.doNo || 'PENDING',
        truckNo: entry.truckNo,
        ltrs: entry.liters,
        pricePerLtr: entry.rate,
        destinations: entry.dest || 'PENDING',
        originalLtrs: entry.originalLiters || null,
        amendedAt: entry.amendedAt || null,
      });
    }

    logger.info(`Updated LPOEntry records for LPO ${lpoNo}`);
  } catch (error: any) {
    logger.error(`Error updating LPOEntry records for LPO ${lpoNo}: ${error.message}`);
  }
};

/**
 * Helper function to delete LPOEntry records when LPOSummary is deleted
 */
const syncLPOEntriesOnDelete = async (lpoNo: string): Promise<void> => {
  try {
    await LPOEntry.updateMany(
      { lpoNo, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() }
    );
    logger.info(`Deleted LPOEntry records for LPO ${lpoNo}`);
  } catch (error: any) {
    logger.error(`Error deleting LPOEntry records for LPO ${lpoNo}: ${error.message}`);
  }
};

/**
 * Create new LPO document (sheet in a workbook)
 * Handles regular entries, cancelled entries, and driver account entries
 */
export const createLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Extract year from date
    const dateObj = new Date(data.date);
    const year = dateObj.getFullYear();
    const month = dateObj.toLocaleString('default', { month: 'long' });

    // Ensure workbook exists for this year
    await getOrCreateWorkbook(year);

    // Create the LPO document with year
    const lpoSummary = await LPOSummary.create({
      ...data,
      year,
    });

    // Update fuel records for each entry (skip cancelled and driver account entries)
    if (lpoSummary.entries && lpoSummary.entries.length > 0) {
      for (const entry of lpoSummary.entries) {
        // Skip fuel record update for cancelled entries
        if (entry.isCancelled) {
          logger.info(`Skipping fuel record update for cancelled entry: ${entry.truckNo}`);
          continue;
        }

        // For driver account entries: skip fuel record but create driver account entry
        if (entry.isDriverAccount) {
          logger.info(`Creating driver account entry for: ${entry.truckNo}`);
          
          await DriverAccountEntry.create({
            date: data.date,
            month,
            year,
            lpoNo: lpoSummary.lpoNo,
            truckNo: entry.truckNo,
            liters: entry.liters,
            rate: entry.rate,
            amount: entry.amount,
            station: lpoSummary.station,
            cancellationPoint: entry.cancellationPoint || 'DAR_GOING',
            originalDoNo: entry.originalDoNo || entry.doNo,
            status: 'pending',
            createdBy: req.user?.username || 'system',
          });
          
          continue; // Skip fuel record update
        }

        // Regular entry - update fuel record
        await updateFuelRecordForLPOEntry(
          entry.doNo,
          entry.liters,
          lpoSummary.station,
          entry.truckNo
        );
      }
    }

    // Sync LPOEntry records for the list view
    await syncLPOEntriesToList(lpoSummary, data.station || lpoSummary.station, data.date);

    logger.info(`LPO document created: ${lpoSummary.lpoNo} for year ${year} by ${req.user?.username}`);

    // Return with id field for frontend compatibility
    const responseData = lpoSummary.toObject();
    
    res.status(201).json({
      success: true,
      message: 'LPO document created successfully',
      data: { ...responseData, id: responseData._id },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update LPO document (sheet) with fuel record adjustment
 * Tracks amendments and prevents double updates
 */
export const updateLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const newData = req.body;

    // Use findOneAndUpdate with a version check to prevent race conditions
    const existingLpo = await LPOSummary.findOne({ _id: id, isDeleted: false });

    if (!existingLpo) {
      throw new ApiError(404, 'LPO document not found');
    }

    logger.info(`Updating LPO ${existingLpo.lpoNo}, station: ${existingLpo.station}`);

    // Define entry type for proper typing
    interface EntryType {
      doNo: string;
      truckNo: string;
      liters: number;
      rate: number;
      amount: number;
      dest: string;
      originalLiters?: number | null;
      amendedAt?: Date | null;
      isCancelled?: boolean;
      isDriverAccount?: boolean;
      cancellationPoint?: string;
      originalDoNo?: string;
      cancellationReason?: string;
      cancelledAt?: Date;
      _id?: any;
    }

    // Calculate fuel record adjustments using database values (not request values)
    const oldEntriesMap = new Map<string, EntryType>(
      existingLpo.entries.map((e) => [`${e.doNo}-${e.truckNo}`, e as unknown as EntryType])
    );
    const newEntries: EntryType[] = newData.entries || existingLpo.entries;
    const newEntriesMap = new Map<string, EntryType>(
      newEntries.map((e: EntryType) => [`${e.doNo}-${e.truckNo}`, e])
    );

    logger.info(`Old entries (from DB): ${JSON.stringify([...oldEntriesMap.entries()])}`);
    logger.info(`New entries (from request): ${JSON.stringify([...newEntriesMap.entries()])}`);

    // Track entries that need fuel record updates and amendment tracking
    const entriesToUpdate: EntryType[] = [];

    // Get date info for driver account entries
    const dateObj = new Date(newData.date || existingLpo.date);
    const month = dateObj.toLocaleString('default', { month: 'long' });
    const year = dateObj.getFullYear();

    // Revert old entries that are removed or changed
    for (const [key, oldEntry] of oldEntriesMap) {
      const newEntry = newEntriesMap.get(key);
      
      // Skip if old entry was already cancelled or driver account (no fuel record to revert)
      if (oldEntry.isCancelled || oldEntry.isDriverAccount) {
        continue;
      }
      
      if (!newEntry) {
        // Entry was removed - revert the fuel deduction
        logger.info(`Entry removed: ${key}, reverting ${oldEntry.liters}L`);
        await updateFuelRecordForLPOEntry(
          oldEntry.doNo,
          -oldEntry.liters,
          existingLpo.station,
          oldEntry.truckNo
        );
      } else if (newEntry.isCancelled && !oldEntry.isCancelled) {
        // Entry was just marked as cancelled - revert the fuel deduction
        logger.info(`Entry cancelled: ${key}, reverting ${oldEntry.liters}L`);
        await updateFuelRecordForLPOEntry(
          oldEntry.doNo,
          -oldEntry.liters,
          existingLpo.station,
          oldEntry.truckNo
        );
        
        // Mark cancellation time
        newEntry.cancelledAt = new Date();
      } else if (newEntry.isDriverAccount && !oldEntry.isDriverAccount) {
        // Entry was converted to driver account - revert fuel and create driver account entry
        logger.info(`Entry converted to driver account: ${key}, reverting ${oldEntry.liters}L`);
        await updateFuelRecordForLPOEntry(
          oldEntry.doNo,
          -oldEntry.liters,
          existingLpo.station,
          oldEntry.truckNo
        );
        
        // Create driver account entry
        await DriverAccountEntry.create({
          date: newData.date || existingLpo.date,
          month,
          year,
          lpoNo: existingLpo.lpoNo,
          truckNo: newEntry.truckNo,
          liters: newEntry.liters,
          rate: newEntry.rate,
          amount: newEntry.amount,
          station: newData.station || existingLpo.station,
          cancellationPoint: newEntry.cancellationPoint || 'DAR_GOING',
          originalDoNo: newEntry.originalDoNo || oldEntry.doNo,
          status: 'pending',
          createdBy: req.user?.username || 'system',
        });
      } else if (newEntry.liters !== oldEntry.liters) {
        // Entry liters changed - adjust the difference
        const difference = newEntry.liters - oldEntry.liters;
        logger.info(`Entry ${key} liters changed: ${oldEntry.liters} -> ${newEntry.liters} (diff: ${difference})`);
        
        // Track amendment - store original liters if this is the first change
        const originalLiters = oldEntry.originalLiters ?? oldEntry.liters;
        newEntry.originalLiters = originalLiters;
        newEntry.amendedAt = new Date();
        
        await updateFuelRecordForLPOEntry(
          oldEntry.doNo,
          difference,
          newData.station || existingLpo.station,
          oldEntry.truckNo
        );
        
        entriesToUpdate.push(newEntry);
      } else {
        logger.info(`Entry ${key} unchanged: ${oldEntry.liters}L`);
        // Preserve amendment history if it exists
        if (oldEntry.originalLiters !== undefined && oldEntry.originalLiters !== null) {
          newEntry.originalLiters = oldEntry.originalLiters;
          newEntry.amendedAt = oldEntry.amendedAt;
        }
      }
    }

    // Add new entries that didn't exist before
    for (const [key, newEntry] of newEntriesMap) {
      if (!oldEntriesMap.has(key)) {
        // Skip fuel record update for cancelled entries
        if (newEntry.isCancelled) {
          logger.info(`New cancelled entry: ${key}, skipping fuel record update`);
          continue;
        }
        
        // For driver account entries: skip fuel record but create driver account entry
        if (newEntry.isDriverAccount) {
          logger.info(`New driver account entry: ${key}, creating driver account record`);
          
          await DriverAccountEntry.create({
            date: newData.date || existingLpo.date,
            month,
            year,
            lpoNo: existingLpo.lpoNo,
            truckNo: newEntry.truckNo,
            liters: newEntry.liters,
            rate: newEntry.rate,
            amount: newEntry.amount,
            station: newData.station || existingLpo.station,
            cancellationPoint: newEntry.cancellationPoint || 'DAR_GOING',
            originalDoNo: newEntry.originalDoNo || newEntry.doNo,
            status: 'pending',
            createdBy: req.user?.username || 'system',
          });
          
          continue;
        }
        
        // Regular new entry - update fuel record
        logger.info(`New entry: ${key}, adding ${newEntry.liters}L`);
        await updateFuelRecordForLPOEntry(
          newEntry.doNo,
          newEntry.liters,
          newData.station || existingLpo.station,
          newEntry.truckNo
        );
      }
    }

    // Update the newData.entries with amendment tracking
    newData.entries = newEntries.map((entry: EntryType) => {
      const key = `${entry.doNo}-${entry.truckNo}`;
      const oldEntry = oldEntriesMap.get(key);
      if (oldEntry && entry.liters !== oldEntry.liters) {
        return {
          ...entry,
          originalLiters: oldEntry.originalLiters ?? oldEntry.liters,
          amendedAt: new Date()
        };
      } else if (oldEntry?.originalLiters !== undefined && oldEntry.originalLiters !== null) {
        // Preserve existing amendment history
        return {
          ...entry,
          originalLiters: oldEntry.originalLiters,
          amendedAt: oldEntry.amendedAt
        };
      }
      return entry;
    });

    // Update year if date changed
    if (newData.date) {
      const dateObj = new Date(newData.date);
      newData.year = dateObj.getFullYear();
      await getOrCreateWorkbook(newData.year);
    }

    const lpoSummary = await LPOSummary.findOneAndUpdate(
      { _id: id, isDeleted: false },
      newData,
      { new: true, runValidators: true }
    );

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    // Sync LPOEntry records for the list view
    await syncLPOEntriesOnUpdate(
      lpoSummary.lpoNo,
      lpoSummary.entries,
      lpoSummary.station,
      lpoSummary.date
    );

    logger.info(`LPO document updated: ${lpoSummary?.lpoNo} by ${req.user?.username}`);

    // Return with id field for frontend compatibility
    const responseData = lpoSummary.toObject();
    
    res.status(200).json({
      success: true,
      message: 'LPO document updated successfully',
      data: { ...responseData, id: responseData._id },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Soft delete LPO document and revert fuel records
 */
export const deleteLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lpoSummary = await LPOSummary.findOne({ _id: id, isDeleted: false });

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    // Revert fuel records for all entries
    for (const entry of lpoSummary.entries) {
      await updateFuelRecordForLPOEntry(
        entry.doNo,
        -entry.liters,
        lpoSummary.station,
        entry.truckNo
      );
    }

    await LPOSummary.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    // Sync delete to LPOEntry records
    await syncLPOEntriesOnDelete(lpoSummary.lpoNo);

    logger.info(`LPO document deleted: ${lpoSummary.lpoNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'LPO document deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export workbook as Excel file
 * Each LPO sheet matches the PDF/image export format exactly
 * Sheet names are just the LPO number (e.g., "2444" instead of "LPO 2444")
 * Summary sheet is placed at the end
 */
export const exportWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    // Get all LPO documents for this year
    const lpoDocuments = await LPOSummary.find({ year, isDeleted: false })
      .sort({ lpoNo: 1 })
      .lean();

    if (lpoDocuments.length === 0) {
      throw new ApiError(404, 'No LPO documents found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Define border styles
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const thickBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      right: { style: 'medium', color: { argb: 'FF000000' } },
    };

    // Alignment styles
    const centerAlignment: Partial<ExcelJS.Alignment> = {
      horizontal: 'center',
      vertical: 'middle',
    };

    const leftAlignment: Partial<ExcelJS.Alignment> = {
      horizontal: 'left',
      vertical: 'middle',
    };

    const rightAlignment: Partial<ExcelJS.Alignment> = {
      horizontal: 'right',
      vertical: 'middle',
    };

    // Create individual sheets for each LPO FIRST (before summary)
    for (const lpo of lpoDocuments) {
      // Sheet name is just the LPO number (e.g., "2444")
      const sheetName = lpo.lpoNo.substring(0, 31);
      const sheet = excelWorkbook.addWorksheet(sheetName);

      // Set column widths to match PDF layout
      sheet.getColumn(1).width = 18; // DO No.
      sheet.getColumn(2).width = 16; // Truck No.
      sheet.getColumn(3).width = 12; // Liters
      sheet.getColumn(4).width = 12; // Rate
      sheet.getColumn(5).width = 16; // Amount
      sheet.getColumn(6).width = 22; // Dest.

      // Row 1: Title - LOCAL PURCHASE ORDER
      sheet.mergeCells('A1:D1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'LOCAL PURCHASE ORDER';
      titleCell.font = { bold: true, size: 18, color: { argb: 'FF000000' } };
      titleCell.alignment = leftAlignment;

      // Row 1 Right: LPO No.
      sheet.mergeCells('E1:F1');
      const lpoNoCell = sheet.getCell('E1');
      lpoNoCell.value = `LPO No. ${lpo.lpoNo}`;
      lpoNoCell.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
      lpoNoCell.alignment = rightAlignment;

      // Row 2: Subtitle - FUEL SUPPLY
      sheet.mergeCells('A2:D2');
      const subtitleCell = sheet.getCell('A2');
      subtitleCell.value = 'FUEL SUPPLY';
      subtitleCell.font = { size: 11, color: { argb: 'FF444444' } };
      subtitleCell.alignment = leftAlignment;

      // Row 2 Right: Date
      sheet.mergeCells('E2:F2');
      const dateCell = sheet.getCell('E2');
      const formattedDate = new Date(lpo.date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      dateCell.value = `Date: ${formattedDate}`;
      dateCell.font = { size: 11, color: { argb: 'FF555555' } };
      dateCell.alignment = rightAlignment;

      // Row 3: Border separator
      sheet.getRow(3).height = 8;
      sheet.mergeCells('A3:F3');
      sheet.getCell('A3').border = { bottom: { style: 'thick', color: { argb: 'FF000000' } } };

      // Row 4: Station and Order Of
      sheet.mergeCells('A4:C4');
      const stationCell = sheet.getCell('A4');
      stationCell.value = `Station: ${lpo.station}`;
      stationCell.font = { size: 11, color: { argb: 'FF333333' } };
      stationCell.alignment = leftAlignment;

      sheet.mergeCells('D4:F4');
      const orderOfCell = sheet.getCell('D4');
      orderOfCell.value = `Order of: ${lpo.orderOf}`;
      orderOfCell.font = { size: 11, color: { argb: 'FF333333' } };
      orderOfCell.alignment = leftAlignment;

      // Row 5: Empty row for spacing
      sheet.getRow(5).height = 8;

      // Row 6: Instructions
      sheet.mergeCells('A6:F6');
      const instructionsCell = sheet.getCell('A6');
      instructionsCell.value = 'KINDLY SUPPLY THE FOLLOWING LITERS';
      instructionsCell.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
      instructionsCell.alignment = leftAlignment;
      instructionsCell.border = {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };

      // Row 7: Empty row for spacing
      sheet.getRow(7).height = 8;

      // Row 8: Table Headers
      const headerRow = sheet.getRow(8);
      headerRow.values = ['DO No.', 'Truck No.', 'Liters', 'Rate', 'Amount', 'Dest.'];
      headerRow.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
      headerRow.height = 24;
      // Apply styling only to table columns (1-6)
      for (let colNum = 1; colNum <= 6; colNum++) {
        const cell = headerRow.getCell(colNum);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        };
        cell.border = thickBorder;
        if (colNum === 3 || colNum === 4 || colNum === 5) {
          cell.alignment = rightAlignment;
        } else {
          cell.alignment = leftAlignment;
        }
      }

      // Add entry data starting at row 9
      let rowNum = 9;
      let totalLiters = 0;
      let totalAmount = 0;

      for (const entry of lpo.entries) {
        const row = sheet.getRow(rowNum);
        const isCancelled = entry.isCancelled;
        const isDriverAccount = entry.isDriverAccount;
        
        // Determine display values
        const displayDoNo = isCancelled ? 'CANCELLED' : isDriverAccount ? 'NIL' : entry.doNo;
        const displayDest = isDriverAccount ? 'NIL' : entry.dest;
        
        row.values = [
          displayDoNo,
          entry.truckNo,
          entry.liters.toLocaleString(),
          entry.rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          displayDest,
        ];
        
        row.height = 22;
        
        // Apply styling only to table columns (1-6)
        for (let colNum = 1; colNum <= 6; colNum++) {
          const cell = row.getCell(colNum);
          cell.border = thinBorder;
          
          if (colNum === 3 || colNum === 4 || colNum === 5) {
            cell.alignment = rightAlignment;
          } else {
            cell.alignment = leftAlignment;
          }
          
          // Color for cancelled entries
          if (isCancelled) {
            cell.font = { color: { argb: 'FFCC0000' }, strike: true };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFE6E6' },
            };
          } else if (isDriverAccount) {
            // Color for driver account entries
            if (colNum === 1 || colNum === 6) {
              cell.font = { color: { argb: 'FFCC6600' } };
            }
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF3E6' },
            };
          } else {
            // Alternating row colors
            if ((rowNum - 9) % 2 === 1) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFAFAFA' },
              };
            }
          }
        }

        // Sum up totals (excluding cancelled entries)
        if (!isCancelled) {
          totalLiters += entry.liters;
          totalAmount += entry.amount;
        }

        rowNum++;
      }

      // Total Row
      const totalRow = sheet.getRow(rowNum);
      totalRow.values = [
        'TOTAL',
        '',
        totalLiters.toLocaleString(),
        '',
        totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        '',
      ];
      totalRow.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
      totalRow.height = 26;
      // Apply styling only to table columns (1-6)
      for (let colNum = 1; colNum <= 6; colNum++) {
        const cell = totalRow.getCell(colNum);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8E8E8' },
        };
        cell.border = thickBorder;
        if (colNum === 3 || colNum === 5) {
          cell.alignment = rightAlignment;
        } else if (colNum === 1) {
          cell.alignment = leftAlignment;
        } else {
          cell.alignment = centerAlignment;
        }
      }

      // Merge TOTAL label cells
      sheet.mergeCells(`A${rowNum}:B${rowNum}`);

      rowNum += 2; // Skip a row

      // Signatures Section - Row after totals + 2
      const sigRowNum = rowNum;
      
      // Add signature lines
      const preparedByCell = sheet.getCell(`A${sigRowNum}`);
      preparedByCell.value = 'Prepared By';
      preparedByCell.font = { bold: true, size: 10 };
      preparedByCell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };

      const approvedByCell = sheet.getCell(`C${sigRowNum}`);
      approvedByCell.value = 'Approved By';
      approvedByCell.font = { bold: true, size: 10 };
      approvedByCell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };

      const receivedByCell = sheet.getCell(`E${sigRowNum}`);
      receivedByCell.value = 'Received By';
      receivedByCell.font = { bold: true, size: 10 };
      receivedByCell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };

      // Signature labels
      const sigLabelRow = sheet.getRow(sigRowNum + 1);
      sheet.getCell(`A${sigRowNum + 1}`).value = 'Signature';
      sheet.getCell(`A${sigRowNum + 1}`).font = { size: 9, color: { argb: 'FF666666' } };
      sheet.getCell(`C${sigRowNum + 1}`).value = 'Name & Signature';
      sheet.getCell(`C${sigRowNum + 1}`).font = { size: 9, color: { argb: 'FF666666' } };
      sheet.getCell(`E${sigRowNum + 1}`).value = 'Station Attendant';
      sheet.getCell(`E${sigRowNum + 1}`).font = { size: 9, color: { argb: 'FF666666' } };

      // Footer
      const footerRowNum = sigRowNum + 4;
      sheet.mergeCells(`A${footerRowNum}:F${footerRowNum}`);
      const footerCell = sheet.getCell(`A${footerRowNum}`);
      footerCell.value = 'This is a computer-generated document. No signature is required.';
      footerCell.font = { size: 9, color: { argb: 'FF666666' } };
      footerCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
      
      sheet.mergeCells(`A${footerRowNum + 1}:F${footerRowNum + 1}`);
      const footerCell2 = sheet.getCell(`A${footerRowNum + 1}`);
      footerCell2.value = 'For any queries, please contact the logistics department.';
      footerCell2.font = { size: 9, color: { argb: 'FF666666' } };
    }

    // Create summary sheet LAST
    const summarySheet = excelWorkbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'LPO No', key: 'lpoNo', width: 12 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Station', key: 'station', width: 20 },
      { header: 'Order Of', key: 'orderOf', width: 15 },
      { header: 'Total Amount', key: 'total', width: 18 },
      { header: 'Entries', key: 'entries', width: 10 },
    ];

    // Style summary header row
    const summaryHeaderRow = summarySheet.getRow(1);
    summaryHeaderRow.font = { bold: true, size: 11 };
    summaryHeaderRow.height = 24;
    summaryHeaderRow.alignment = centerAlignment;
    // Apply styling only to table columns (1-6)
    for (let colNum = 1; colNum <= 6; colNum++) {
      const cell = summaryHeaderRow.getCell(colNum);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.border = thickBorder;
    }

    // Add summary data
    lpoDocuments.forEach((lpo, index) => {
      const row = summarySheet.addRow({
        lpoNo: lpo.lpoNo,
        date: new Date(lpo.date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        station: lpo.station,
        orderOf: lpo.orderOf,
        total: lpo.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        entries: lpo.entries.filter((e: any) => !e.isCancelled).length,
      });
      row.alignment = centerAlignment;
      row.height = 20;
      // Apply borders and alternating colors only to table columns (1-6)
      for (let colNum = 1; colNum <= 6; colNum++) {
        const cell = row.getCell(colNum);
        cell.border = thinBorder;
        // Alternating row colors
        if (index % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFAFAFA' },
          };
        }
      }
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=LPOS_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`Workbook exported for year ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get available years (for workbook selection)
 */
export const getAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const years = await LPOSummary.distinct('year', { isDeleted: false });
    years.sort((a, b) => b - a);

    res.status(200).json({
      success: true,
      message: 'Available years retrieved successfully',
      data: years,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Find LPOs at a specific checkpoint/station that have a particular truck
 * Used for auto-cancellation when creating CASH LPOs
 */
export const findLPOsAtCheckpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo, station, cancellationPoint } = req.query;

    if (!truckNo) {
      throw new ApiError(400, 'Truck number is required');
    }

    // Find LPOs where this truck has an active (non-cancelled) entry at the given station
    const query: any = {
      isDeleted: false,
      'entries.truckNo': truckNo,
      'entries.isCancelled': { $ne: true }
    };

    // If station is provided, filter by station
    if (station) {
      query.station = station;
    }

    const lpos = await LPOSummary.find(query).lean();

    // Filter entries to only include matching truck entries that are not cancelled
    const matchingLpos = lpos.map(lpo => ({
      ...lpo,
      entries: lpo.entries.filter((e: any) => 
        e.truckNo === truckNo && !e.isCancelled
      )
    })).filter(lpo => lpo.entries.length > 0);

    res.status(200).json({
      success: true,
      message: `Found ${matchingLpos.length} LPOs with truck ${truckNo}`,
      data: matchingLpos,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Cancel a specific truck entry in an LPO by marking it as cancelled
 * This also reverts the fuel record deduction
 */
export const cancelTruckInLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lpoId, truckNo, cancellationPoint, reason } = req.body;

    if (!lpoId || !truckNo || !cancellationPoint) {
      throw new ApiError(400, 'LPO ID, truck number, and cancellation point are required');
    }

    // Find the LPO
    const lpo = await LPOSummary.findOne({ _id: lpoId, isDeleted: false });
    if (!lpo) {
      throw new ApiError(404, 'LPO not found');
    }

    // Find the entry for this truck
    const entryIndex = lpo.entries.findIndex((e: any) => 
      e.truckNo === truckNo && !e.isCancelled
    );

    if (entryIndex === -1) {
      throw new ApiError(404, 'Active entry for this truck not found in the LPO');
    }

    const entry = lpo.entries[entryIndex];

    // Revert the fuel record deduction
    await updateFuelRecordForLPOEntry(
      entry.doNo,
      -entry.liters,
      lpo.station,
      entry.truckNo
    );

    // Mark the entry as cancelled
    lpo.entries[entryIndex].isCancelled = true;
    lpo.entries[entryIndex].cancellationPoint = cancellationPoint;
    lpo.entries[entryIndex].cancellationReason = reason || 'Cash mode payment - station was out of fuel';
    lpo.entries[entryIndex].cancelledAt = new Date();

    // Recalculate total (excluding cancelled entries)
    lpo.total = lpo.entries
      .filter((e: any) => !e.isCancelled)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    await lpo.save();

    logger.info(`Truck ${truckNo} cancelled in LPO ${lpo.lpoNo} at ${cancellationPoint} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: `Successfully cancelled truck ${truckNo} in LPO ${lpo.lpoNo}`,
      data: lpo,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Forward an LPO to a new station
 * Creates a new LPO with the same truck entries but at a different station with new default liters
 * 
 * Common Use Cases:
 * - Zambia Returning: Ndola (50L) → Kapiri (350L)
 * - Tunduma Returning: Lake Tunduma (100L) → Infinity/Mbeya (400L)
 */
export const forwardLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      sourceLpoId, 
      targetStation, 
      defaultLiters, 
      rate, 
      date, 
      orderOf,
      includeOnlyActive = true 
    } = req.body;

    if (!sourceLpoId || !targetStation || !defaultLiters || !rate) {
      throw new ApiError(400, 'Source LPO ID, target station, default liters, and rate are required');
    }

    // Find the source LPO
    const sourceLpo = await LPOSummary.findOne({ _id: sourceLpoId, isDeleted: false });
    if (!sourceLpo) {
      throw new ApiError(404, 'Source LPO not found');
    }

    // Validate target station is different
    if (sourceLpo.station.toUpperCase() === targetStation.toUpperCase()) {
      throw new ApiError(400, 'Target station cannot be the same as source station');
    }

    // Filter entries (only active, non-cancelled entries if specified)
    const entriesToForward = includeOnlyActive
      ? sourceLpo.entries.filter((e: any) => !e.isCancelled)
      : sourceLpo.entries;

    if (entriesToForward.length === 0) {
      throw new ApiError(400, 'Source LPO has no active entries to forward');
    }

    // Create forwarded entries with new liters and rate
    const forwardedEntries = entriesToForward.map((entry: any) => ({
      doNo: entry.doNo,
      truckNo: entry.truckNo,
      liters: defaultLiters,
      rate: rate,
      amount: defaultLiters * rate,
      dest: entry.dest,
      // Reset cancellation/driver account fields
      isCancelled: false,
      isDriverAccount: false,
      originalLiters: null,
      amendedAt: null,
    }));

    // Get next LPO number
    let nextNumber = 2445;
    const lastLpo = await LPOSummary.findOne({ isDeleted: false })
      .sort({ lpoNo: -1 })
      .select('lpoNo')
      .lean();

    if (lastLpo && (lastLpo as any).lpoNo) {
      const lastNumber = parseInt((lastLpo as any).lpoNo, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    // Make sure the number doesn't already exist
    let exists = await LPOSummary.exists({ lpoNo: nextNumber.toString(), isDeleted: false });
    while (exists) {
      nextNumber++;
      exists = await LPOSummary.exists({ lpoNo: nextNumber.toString(), isDeleted: false });
    }

    // Calculate total
    const total = forwardedEntries.reduce((sum: number, entry: any) => sum + entry.amount, 0);

    // Create new LPO date
    const lpoDate = date || new Date().toISOString().split('T')[0];
    const dateObj = new Date(lpoDate);
    const year = dateObj.getFullYear();

    // Ensure workbook exists for this year
    await getOrCreateWorkbook(year);

    // Create the forwarded LPO
    const forwardedLpo = await LPOSummary.create({
      lpoNo: nextNumber.toString(),
      date: lpoDate,
      year,
      station: targetStation.toUpperCase(),
      orderOf: orderOf || sourceLpo.orderOf,
      entries: forwardedEntries,
      total,
      // Track the source LPO for reference
      forwardedFrom: {
        lpoId: sourceLpo._id,
        lpoNo: sourceLpo.lpoNo,
        station: sourceLpo.station,
      },
    });

    // Update fuel records for each entry (regular LPO entries)
    for (const entry of forwardedEntries) {
      await updateFuelRecordForLPOEntry(
        entry.doNo,
        entry.liters,
        targetStation,
        entry.truckNo
      );
    }

    logger.info(`LPO ${sourceLpo.lpoNo} forwarded to ${targetStation} as LPO ${forwardedLpo.lpoNo} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: `Successfully forwarded LPO ${sourceLpo.lpoNo} to ${targetStation} as LPO ${forwardedLpo.lpoNo}`,
      data: {
        sourceLpo: {
          id: sourceLpo._id,
          lpoNo: sourceLpo.lpoNo,
          station: sourceLpo.station,
        },
        forwardedLpo: forwardedLpo,
        entriesForwarded: forwardedEntries.length,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

// Legacy methods for backward compatibility
export const addSheetToWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  return createLPOSummary(req, res);
};

export const updateSheetInWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  req.params.id = req.params.sheetId;
  return updateLPOSummary(req, res);
};

export const deleteSheetFromWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  req.params.id = req.params.sheetId;
  return deleteLPOSummary(req, res);
};
