import { Response } from 'express';
import { DriverAccountEntry, LPOSummary, LPOEntry } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';
import ExcelJS from 'exceljs';
import unifiedExportService from '../services/unifiedExportService';

/**
 * Get the next available LPO number by checking both LPOSummary and DriverAccountEntry
 * Resets to 1 every new year
 */
async function getNextAvailableLPONumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  
  // Get the highest LPO number from LPOSummary for current year
  const lastLpoSummary = await LPOSummary.findOne({ 
    isDeleted: false,
    year: currentYear 
  })
    .sort({ lpoNo: -1 })
    .select('lpoNo')
    .lean();

  // Get the highest LPO number from DriverAccountEntry for current year
  const lastDriverAccount = await DriverAccountEntry.findOne({ 
    isDeleted: false,
    year: currentYear 
  })
    .sort({ lpoNo: -1 })
    .select('lpoNo')
    .lean();

  // Get the highest LPO number from LPOEntry for current year
  const lastLpoEntry = await LPOEntry.findOne({ 
    isDeleted: false,
    year: currentYear 
  })
    .sort({ lpoNo: -1 })
    .select('lpoNo')
    .lean();

  let maxNumber = 0; // Start from 0 (will become 1)

  if (lastLpoSummary?.lpoNo) {
    const num = parseInt(lastLpoSummary.lpoNo, 10);
    if (!isNaN(num) && num > maxNumber) {
      maxNumber = num;
    }
  }

  if (lastDriverAccount?.lpoNo) {
    const num = parseInt(lastDriverAccount.lpoNo, 10);
    if (!isNaN(num) && num > maxNumber) {
      maxNumber = num;
    }
  }

  if (lastLpoEntry?.lpoNo) {
    const num = parseInt(lastLpoEntry.lpoNo, 10);
    if (!isNaN(num) && num > maxNumber) {
      maxNumber = num;
    }
  }

  return (maxNumber + 1).toString();
}

/**
 * Get the next LPO number for driver account entries
 */
export const getNextLPONumber = async (req: AuthRequest, res: Response) => {
  const nextLpoNo = await getNextAvailableLPONumber();

  res.json({
    success: true,
    data: {
      nextLpoNo,
    },
  });
};

/**
 * Get all driver account entries with pagination and filtering
 */
export const getAllDriverAccountEntries = async (req: AuthRequest, res: Response) => {
  const { page, limit, sort, order } = getPaginationParams(req.query);
  const { year, month, truckNo, status, search } = req.query;

  const query: any = { isDeleted: false };

  // Restrict drivers to their own truck's records (least-privilege)
  if (req.user?.role === 'driver') {
    query.truckNo = req.user.username;
  }

  // Apply filters
  if (year) {
    query.year = parseInt(year as string);
  }
  if (month) {
    query.month = month;
  }
  if (truckNo) {
    query.truckNo = { $regex: truckNo, $options: 'i' };
  }
  if (status) {
    query.status = status;
  }
  if (search) {
    query.$or = [
      { truckNo: { $regex: search, $options: 'i' } },
      { lpoNo: { $regex: search, $options: 'i' } },
      { driverName: { $regex: search, $options: 'i' } },
      { station: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = calculateSkip(page, limit);
  const sortOptions: any = { [sort]: order === 'asc' ? 1 : -1 };

  const [entries, total] = await Promise.all([
    DriverAccountEntry.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    DriverAccountEntry.countDocuments(query),
  ]);

  const response = createPaginatedResponse(entries, total, page, limit);
  res.json(response);
};

/**
 * Get driver account entry by ID
 */
export const getDriverAccountEntryById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const entry = await DriverAccountEntry.findOne({ _id: id, isDeleted: false });

  if (!entry) {
    throw new ApiError(404, 'Driver account entry not found');
  }

  res.json({
    success: true,
    data: entry,
  });
};

/**
 * Get driver account entries by year (for workbook view)
 */
export const getDriverAccountEntriesByYear = async (req: AuthRequest, res: Response) => {
  const { year } = req.params;

  const entries = await DriverAccountEntry.find({
    year: parseInt(year),
    isDeleted: false,
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // Group entries by month
  const entriesByMonth: Record<string, any[]> = {};
  entries.forEach((entry) => {
    if (!entriesByMonth[entry.month]) {
      entriesByMonth[entry.month] = [];
    }
    entriesByMonth[entry.month].push(entry);
  });

  res.json({
    success: true,
    data: {
      year: parseInt(year),
      entriesByMonth,
      totalEntries: entries.length,
      totalAmount: entries.reduce((sum, e) => sum + e.amount, 0),
      totalLiters: entries.reduce((sum, e) => sum + e.liters, 0),
    },
  });
};

/**
 * Get available years for driver account workbooks
 */
export const getAvailableYears = async (req: AuthRequest, res: Response) => {
  const years = await DriverAccountEntry.distinct('year', { isDeleted: false });
  
  // Sort years in descending order
  years.sort((a, b) => b - a);

  // If no years exist, return current year
  if (years.length === 0) {
    years.push(new Date().getFullYear());
  }

  res.json({
    success: true,
    data: years,
  });
};

/**
 * Create a new driver account entry
 * This also creates an LPO entry that appears in LPO sheets and management
 */
export const createDriverAccountEntry = async (req: AuthRequest, res: Response) => {
  const {
    date,
    lpoNo,
    truckNo,
    driverName,
    liters,
    rate,
    station,
    cancellationPoint,
    journeyDirection = 'going',
    originalDoNo,
    paymentMode = 'CASH',
    paybillOrMobile,
    approvedBy,
    notes,
  } = req.body;

  // Prevent self-approval fraud
  if (approvedBy && approvedBy.trim().toLowerCase() === (req.user?.username || '').toLowerCase()) {
    throw new ApiError(403, 'You cannot approve your own entry.');
  }

  // Parse date to extract month and year
  const dateObj = new Date(date);
  const month = dateObj.toLocaleString('default', { month: 'long' });
  const year = dateObj.getFullYear();

  // Determine the LPO number - use provided or get next available
  const finalLpoNo = lpoNo || await getNextAvailableLPONumber();

  // Create the driver account entry
  const entry = new DriverAccountEntry({
    date,
    month,
    year,
    lpoNo: finalLpoNo,
    truckNo,
    driverName,
    liters,
    rate,
    amount: liters * rate,
    station,
    cancellationPoint,
    journeyDirection,
    originalDoNo,
    paymentMode,
    paybillOrMobile,
    approvedBy,
    notes,
    status: 'pending',
    createdBy: req.user?.username || 'system',
  });

  await entry.save();

  // Also create an LPO Summary entry so it appears in LPO sheets and management
  // For driver account entries, DO and destination are set to NIL
  try {
    const lpoSummary = new LPOSummary({
      lpoNo: finalLpoNo,
      date,
      year,
      station: station,
      orderOf: 'DRIVER ACCOUNT',
      entries: [{
        doNo: 'NIL',  // DO is NIL for driver account
        truckNo,
        liters,
        rate,
        amount: liters * rate,
        dest: 'NIL',  // Destination is NIL for driver account
        isDriverAccount: true,
        originalDoNo,  // Keep the reference DO
        sortOrder: 1,
      }],
      total: liters * rate,
      createdBy: req.user?.username || 'Unknown',
    });

    await lpoSummary.save();

    // Update the driver account entry with the LPO summary reference
    entry.lpoCreated = true;
    entry.lpoSummaryId = lpoSummary._id.toString();
    await entry.save();

    logger.info(`Driver account entry created: ${entry._id} for truck ${truckNo} with LPO ${finalLpoNo}`);
  } catch (lpoError: any) {
    // If LPO creation fails due to duplicate, still keep the driver account entry
    if (lpoError.code === 11000) {
      logger.warn(`LPO ${finalLpoNo} already exists, driver account entry created without separate LPO`);
    } else {
      logger.error(`Error creating LPO for driver account: ${lpoError.message}`);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Driver account entry created successfully',
    data: entry,
  });
};

/**
 * Create multiple driver account entries (batch)
 * Supports multiple trucks in a single LPO
 */
export const createBatchDriverAccountEntries = async (req: AuthRequest, res: Response) => {
  const { entries, sharedLpoNo } = req.body;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    throw new ApiError(400, 'Entries array is required');
  }

  // Get or generate a shared LPO number for all entries in this batch
  const batchLpoNo = sharedLpoNo || await getNextAvailableLPONumber();
  
  const createdEntries = [];
  const lpoDetails = [];
  let totalAmount = 0;

  for (const entryData of entries) {
    const dateObj = new Date(entryData.date);
    const month = dateObj.toLocaleString('default', { month: 'long' });
    const year = dateObj.getFullYear();

    const entry = new DriverAccountEntry({
      ...entryData,
      lpoNo: batchLpoNo,  // Use shared LPO number
      month,
      year,
      journeyDirection: entryData.journeyDirection || 'going',
      paymentMode: entryData.paymentMode || 'CASH',
      amount: entryData.liters * entryData.rate,
      status: 'pending',
      createdBy: req.user?.username || 'system',
    });

    await entry.save();
    createdEntries.push(entry);

    // Build LPO detail for this entry
    lpoDetails.push({
      doNo: 'NIL',  // DO is NIL for driver account
      truckNo: entryData.truckNo,
      liters: entryData.liters,
      rate: entryData.rate,
      amount: entryData.liters * entryData.rate,
      dest: 'NIL',  // Destination is NIL for driver account
      isDriverAccount: true,
      originalDoNo: entryData.originalDoNo,
      sortOrder: lpoDetails.length + 1,
    });
    totalAmount += entryData.liters * entryData.rate;
  }

  // Create a single LPO Summary with all entries
  try {
    const firstEntry = entries[0];
    const dateObj = new Date(firstEntry.date);
    const year = dateObj.getFullYear();

    const lpoSummary = new LPOSummary({
      lpoNo: batchLpoNo,
      date: firstEntry.date,
      year,
      station: firstEntry.station,
      orderOf: 'DRIVER ACCOUNT',
      entries: lpoDetails,
      total: totalAmount,
      createdBy: req.user?.username || 'Unknown',
    });

    await lpoSummary.save();

    // Update all driver account entries with the LPO summary reference
    for (const entry of createdEntries) {
      entry.lpoCreated = true;
      entry.lpoSummaryId = lpoSummary._id.toString();
      await entry.save();
    }

    logger.info(`Batch created ${createdEntries.length} driver account entries with LPO ${batchLpoNo}`);
  } catch (lpoError: any) {
    if (lpoError.code === 11000) {
      logger.warn(`LPO ${batchLpoNo} already exists, driver account entries created without separate LPO`);
    } else {
      logger.error(`Error creating LPO for batch driver account: ${lpoError.message}`);
    }
  }

  res.status(201).json({
    success: true,
    message: `${createdEntries.length} driver account entries created successfully`,
    data: {
      entries: createdEntries,
      lpoNo: batchLpoNo,
    },
  });
};

/**
 * Update a driver account entry
 */
export const updateDriverAccountEntry = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const entry = await DriverAccountEntry.findOne({ _id: id, isDeleted: false });

  if (!entry) {
    throw new ApiError(404, 'Driver account entry not found');
  }

  // Prevent self-approval fraud on update
  if (updates.approvedBy && updates.approvedBy.trim().toLowerCase() === (req.user?.username || '').toLowerCase()) {
    throw new ApiError(403, 'You cannot approve your own entry.');
  }

  // If liters or rate changed, recalculate amount
  if (updates.liters !== undefined || updates.rate !== undefined) {
    const liters = updates.liters ?? entry.liters;
    const rate = updates.rate ?? entry.rate;
    updates.amount = liters * rate;
  }

  // If date changed, update month and year
  if (updates.date) {
    const dateObj = new Date(updates.date);
    updates.month = dateObj.toLocaleString('default', { month: 'long' });
    updates.year = dateObj.getFullYear();
  }

  Object.assign(entry, updates);
  await entry.save();

  logger.info(`Driver account entry updated: ${id}`);

  res.json({
    success: true,
    message: 'Driver account entry updated successfully',
    data: entry,
  });
};

/**
 * Update driver account entry status (settle/dispute)
 */
export const updateDriverAccountStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const entry = await DriverAccountEntry.findOne({ _id: id, isDeleted: false });

  if (!entry) {
    throw new ApiError(404, 'Driver account entry not found');
  }

  if (!['pending', 'settled', 'disputed'].includes(status)) {
    throw new ApiError(400, 'Invalid status. Must be pending, settled, or disputed');
  }

  entry.status = status;
  if (notes) {
    entry.notes = notes;
  }

  if (status === 'settled') {
    entry.settledAt = new Date();
    entry.settledBy = req.user?.username;
  }

  await entry.save();

  logger.info(`Driver account entry ${id} status updated to ${status}`);

  res.json({
    success: true,
    message: `Entry marked as ${status}`,
    data: entry,
  });
};

/**
 * Delete a driver account entry (soft delete)
 */
export const deleteDriverAccountEntry = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const entry = await DriverAccountEntry.findOne({ _id: id, isDeleted: false });

  if (!entry) {
    throw new ApiError(404, 'Driver account entry not found');
  }

  entry.isDeleted = true;
  entry.deletedAt = new Date();
  await entry.save();

  logger.info(`Driver account entry deleted: ${id}`);

  res.json({
    success: true,
    message: 'Driver account entry deleted successfully',
  });
};

/**
 * Get summary statistics for driver accounts
 */
export const getDriverAccountSummary = async (req: AuthRequest, res: Response) => {
  const { year, month } = req.query;

  const matchQuery: any = { isDeleted: false };
  if (year) {
    matchQuery.year = parseInt(year as string);
  }
  if (month) {
    matchQuery.month = month;
  }

  const summary = await DriverAccountEntry.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { status: '$status' },
        count: { $sum: 1 },
        totalLiters: { $sum: '$liters' },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  // Also get by month if year is specified
  let monthlyBreakdown = [];
  if (year) {
    monthlyBreakdown = await DriverAccountEntry.aggregate([
      { $match: { year: parseInt(year as string), isDeleted: false } },
      {
        $group: {
          _id: '$month',
          count: { $sum: 1 },
          totalLiters: { $sum: '$liters' },
          totalAmount: { $sum: '$amount' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          settledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'settled'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  res.json({
    success: true,
    data: {
      summary,
      monthlyBreakdown,
    },
  });
};

/**
 * Export driver account workbook to Excel (INCLUDING ARCHIVED DATA)
 */
export const exportDriverAccountWorkbook = async (req: AuthRequest, res: Response) => {
  const { year } = req.params;
  const yearNum = parseInt(year);

  // Get all LPO entries for this year (including archived data)
  const startDate = new Date(yearNum, 0, 1); // Jan 1
  const endDate = new Date(yearNum, 11, 31, 23, 59, 59); // Dec 31
  
  const allLPOEntries = await unifiedExportService.getAllLPOEntries({
    startDate,
    endDate,
    includeArchived: true,
  });

  // Filter and sort entries
  const entries = allLPOEntries
    .filter((entry: any) => !entry.isDeleted)
    .sort((a: any, b: any) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

  if (entries.length === 0) {
    throw new ApiError(404, `No driver account entries found for year ${year}`);
  }

  logger.info(`Exporting ${entries.length} driver account entries for year ${year} (including archived)`);

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fuel Order System';
  workbook.created = new Date();

  // Group entries by month
  const entriesByMonth: Record<string, any[]> = {};
  entries.forEach((entry) => {
    if (!entriesByMonth[entry.month]) {
      entriesByMonth[entry.month] = [];
    }
    entriesByMonth[entry.month].push(entry);
  });

  // Create a sheet for each month
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  months.forEach((month) => {
    const monthEntries = entriesByMonth[month] || [];
    const sheet = workbook.addWorksheet(month);

    // Header
    sheet.addRow([`Driver Account - ${month} ${year}`]);
    sheet.mergeCells('A1:I1');
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Column headers - include Prepared By and Approved By
    sheet.addRow([]);
    sheet.addRow([
      'Date',
      'LPO No',
      'Truck No',
      'Driver',
      'Liters',
      'Rate',
      'Amount',
      'Station',
      'Status',
      'Prepared By',
      'Approved By',
    ]);

    const headerRow = sheet.getRow(3);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Data rows
    let totalLiters = 0;
    let totalAmount = 0;

    monthEntries.forEach((entry) => {
      sheet.addRow([
        entry.date,
        entry.lpoNo,
        entry.truckNo,
        entry.driverName || '-',
        entry.liters,
        entry.rate,
        entry.amount,
        entry.station,
        entry.status.toUpperCase(),
        entry.createdBy || '-',
        entry.approvedBy || '-',
      ]);
      totalLiters += entry.liters;
      totalAmount += entry.amount;
    });

    // Total row
    const totalRowNum = sheet.rowCount + 1;
    sheet.addRow(['', '', '', 'TOTAL', totalLiters, '', totalAmount, '', '', '', '']);
    const totalRow = sheet.getRow(totalRowNum);
    totalRow.font = { bold: true };
    totalRow.getCell(4).alignment = { horizontal: 'right' };

    // Set column widths
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 10;
    sheet.getColumn(3).width = 12;
    sheet.getColumn(4).width = 15;
    sheet.getColumn(5).width = 10;
    sheet.getColumn(6).width = 10;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 15;
    sheet.getColumn(9).width = 10;
    sheet.getColumn(10).width = 15;
    sheet.getColumn(11).width = 15;
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Set response headers
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=DRIVER_ACCOUNT_${year}.xlsx`
  );

  res.send(buffer);
};

export const driverAccountController = {
  getAllDriverAccountEntries,
  getDriverAccountEntryById,
  getDriverAccountEntriesByYear,
  getAvailableYears,
  getNextLPONumber,
  createDriverAccountEntry,
  createBatchDriverAccountEntries,
  updateDriverAccountEntry,
  updateDriverAccountStatus,
  deleteDriverAccountEntry,
  getDriverAccountSummary,
  exportDriverAccountWorkbook,
};
