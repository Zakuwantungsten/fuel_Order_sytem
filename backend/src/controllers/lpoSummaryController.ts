import { Response } from 'express';
import { LPOSummary, LPOWorkbook, FuelRecord } from '../models';
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
 */
export const getWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    let workbook = await LPOWorkbook.findOne({ year, isDeleted: false });

    // Auto-create workbook if it doesn't exist
    if (!workbook) {
      workbook = await getOrCreateWorkbook(year);
    }

    const sheets = await LPOSummary.find({ year, isDeleted: false })
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

    res.status(200).json({
      success: true,
      message: 'LPO document retrieved successfully',
      data: lpoSummary,
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

    res.status(200).json({
      success: true,
      message: 'LPO document retrieved successfully',
      data: lpoSummary,
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
 * Create new LPO document (sheet in a workbook)
 */
export const createLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Extract year from date
    const dateObj = new Date(data.date);
    const year = dateObj.getFullYear();

    // Ensure workbook exists for this year
    await getOrCreateWorkbook(year);

    // Create the LPO document with year
    const lpoSummary = await LPOSummary.create({
      ...data,
      year,
    });

    // Update fuel records for each entry
    if (lpoSummary.entries && lpoSummary.entries.length > 0) {
      for (const entry of lpoSummary.entries) {
        await updateFuelRecordForLPOEntry(
          entry.doNo,
          entry.liters,
          lpoSummary.station,
          entry.truckNo
        );
      }
    }

    logger.info(`LPO document created: ${lpoSummary.lpoNo} for year ${year} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: 'LPO document created successfully',
      data: lpoSummary,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update LPO document (sheet) with fuel record adjustment
 */
export const updateLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const newData = req.body;

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
    }

    // Calculate fuel record adjustments
    const oldEntriesMap = new Map<string, EntryType>(
      existingLpo.entries.map((e) => [`${e.doNo}-${e.truckNo}`, e as EntryType])
    );
    const newEntries: EntryType[] = newData.entries || existingLpo.entries;
    const newEntriesMap = new Map<string, EntryType>(
      newEntries.map((e: EntryType) => [`${e.doNo}-${e.truckNo}`, e])
    );

    logger.info(`Old entries: ${JSON.stringify([...oldEntriesMap.entries()])}`);
    logger.info(`New entries: ${JSON.stringify([...newEntriesMap.entries()])}`);

    // Revert old entries that are removed or changed
    for (const [key, oldEntry] of oldEntriesMap) {
      const newEntry = newEntriesMap.get(key);
      if (!newEntry) {
        // Entry was removed - revert the fuel deduction
        logger.info(`Entry removed: ${key}, reverting ${oldEntry.liters}L`);
        await updateFuelRecordForLPOEntry(
          oldEntry.doNo,
          -oldEntry.liters,
          existingLpo.station,
          oldEntry.truckNo
        );
      } else if (newEntry.liters !== oldEntry.liters) {
        // Entry liters changed - adjust the difference
        const difference = newEntry.liters - oldEntry.liters;
        logger.info(`Entry ${key} liters changed: ${oldEntry.liters} -> ${newEntry.liters} (diff: ${difference})`);
        await updateFuelRecordForLPOEntry(
          oldEntry.doNo,
          difference,
          newData.station || existingLpo.station,
          oldEntry.truckNo
        );
      } else {
        logger.info(`Entry ${key} unchanged: ${oldEntry.liters}L`);
      }
    }

    // Add new entries that didn't exist before
    for (const [key, newEntry] of newEntriesMap) {
      if (!oldEntriesMap.has(key)) {
        logger.info(`New entry: ${key}, adding ${newEntry.liters}L`);
        await updateFuelRecordForLPOEntry(
          newEntry.doNo,
          newEntry.liters,
          newData.station || existingLpo.station,
          newEntry.truckNo
        );
      }
    }

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

    logger.info(`LPO document updated: ${lpoSummary?.lpoNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'LPO document updated successfully',
      data: lpoSummary,
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

    // Create a summary sheet first
    const summarySheet = excelWorkbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'LPO No', key: 'lpoNo', width: 12 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Station', key: 'station', width: 20 },
      { header: 'Order Of', key: 'orderOf', width: 15 },
      { header: 'Total (TZS)', key: 'total', width: 15 },
      { header: 'Entries', key: 'entries', width: 10 },
    ];

    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    lpoDocuments.forEach((lpo) => {
      summarySheet.addRow({
        lpoNo: lpo.lpoNo,
        date: lpo.date,
        station: lpo.station,
        orderOf: lpo.orderOf,
        total: lpo.total,
        entries: lpo.entries.length,
      });
    });

    // Create individual sheets for each LPO
    for (const lpo of lpoDocuments) {
      const sheetName = `LPO ${lpo.lpoNo}`.substring(0, 31);
      const sheet = excelWorkbook.addWorksheet(sheetName);

      // Header info
      sheet.mergeCells('A1:F1');
      sheet.getCell('A1').value = `LPO No: ${lpo.lpoNo}`;
      sheet.getCell('A1').font = { bold: true, size: 14 };

      sheet.mergeCells('A2:F2');
      sheet.getCell('A2').value = `Date: ${lpo.date} | Station: ${lpo.station} | Order Of: ${lpo.orderOf}`;

      // Column headers at row 4
      const headerRow = sheet.getRow(4);
      headerRow.values = ['DO No', 'Truck No', 'Liters', 'Rate', 'Amount', 'Destination'];
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      // Set column widths
      sheet.getColumn(1).width = 15;
      sheet.getColumn(2).width = 15;
      sheet.getColumn(3).width = 12;
      sheet.getColumn(4).width = 12;
      sheet.getColumn(5).width = 15;
      sheet.getColumn(6).width = 20;

      // Add entry data
      let rowNum = 5;
      for (const entry of lpo.entries) {
        const row = sheet.getRow(rowNum);
        row.values = [
          entry.doNo,
          entry.truckNo,
          entry.liters,
          entry.rate,
          entry.amount,
          entry.dest,
        ];
        rowNum++;
      }

      // Total row
      const totalRow = sheet.getRow(rowNum);
      totalRow.values = ['', '', '', 'TOTAL:', lpo.total, ''];
      totalRow.font = { bold: true };
    }

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
