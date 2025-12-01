import { Response } from 'express';
import { DeliveryOrder } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// Month names for sheet naming
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Get all delivery orders with pagination and filters
 */
export const getAllDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, clientName, truckNo, importOrExport, destination } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    if (clientName) {
      filter.clientName = { $regex: clientName, $options: 'i' };
    }

    if (truckNo) {
      filter.truckNo = { $regex: truckNo, $options: 'i' };
    }

    if (importOrExport && importOrExport !== 'ALL') {
      filter.importOrExport = importOrExport;
    }

    if (destination) {
      filter.destination = { $regex: destination, $options: 'i' };
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [deliveryOrders, total] = await Promise.all([
      DeliveryOrder.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryOrder.countDocuments(filter),
    ]);

    const response = createPaginatedResponse(deliveryOrders, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Delivery orders retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single delivery order by ID
 */
export const getDeliveryOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findOne({ _id: id, isDeleted: false });

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    res.status(200).json({
      success: true,
      message: 'Delivery order retrieved successfully',
      data: deliveryOrder,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new delivery order
 */
export const createDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deliveryOrder = await DeliveryOrder.create(req.body);

    logger.info(`Delivery order created: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: 'Delivery order created successfully',
      data: deliveryOrder,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update delivery order
 */
export const updateDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    logger.info(`Delivery order updated: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Delivery order updated successfully',
      data: deliveryOrder,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Soft delete delivery order
 */
export const deleteDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    logger.info(`Delivery order deleted: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Delivery order deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get delivery orders by truck number
 */
export const getDeliveryOrdersByTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;

    const deliveryOrders = await DeliveryOrder.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ date: -1 });

    res.status(200).json({
      success: true,
      message: 'Delivery orders retrieved successfully',
      data: deliveryOrders,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get next DO number
 */
export const getNextDONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lastDO = await DeliveryOrder.findOne()
      .sort({ sn: -1 })
      .limit(1)
      .lean();

    const nextSN = lastDO ? lastDO.sn + 1 : 1;

    res.status(200).json({
      success: true,
      message: 'Next DO number retrieved successfully',
      data: { nextSN },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all unique trucks with their latest DO information
 */
export const getAllTrucks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all unique truck numbers with their latest DO information
    const trucks = await DeliveryOrder.aggregate([
      { $match: { isDeleted: false } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: '$truckNo',
          truckNo: { $first: '$truckNo' },
          lastDO: { $first: '$doNumber' },
          lastUpdate: { $first: '$date' },
        },
      },
      { $sort: { truckNo: 1 } },
      {
        $project: {
          _id: 0,
          truckNo: 1,
          lastDO: 1,
          lastUpdate: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: 'Trucks retrieved successfully',
      data: { trucks },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all DO workbooks (one per year)
 */
export const getAllWorkbooks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get distinct years from delivery orders
    const years = await DeliveryOrder.distinct('date', { isDeleted: false });
    
    // Extract unique years from dates (format: YYYY-MM-DD)
    const uniqueYears = [...new Set(
      years
        .map(date => {
          const year = parseInt(date.split('-')[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter(year => year !== null && year >= 2000 && year <= 2100)
    )].sort((a, b) => (b as number) - (a as number));

    // Build workbook data for each year
    const workbooks = await Promise.all(
      uniqueYears.map(async (year) => {
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        
        const count = await DeliveryOrder.countDocuments({
          isDeleted: false,
          date: { $gte: yearStart, $lte: yearEnd }
        });

        // Count months with data
        const monthsWithData = await DeliveryOrder.aggregate([
          {
            $match: {
              isDeleted: false,
              date: { $gte: yearStart, $lte: yearEnd }
            }
          },
          {
            $group: {
              _id: { $substr: ['$date', 5, 2] }
            }
          }
        ]);

        return {
          id: year,
          year,
          name: `DELIVERY ORDERS ${year}`,
          sheetCount: monthsWithData.length,
          totalDOs: count,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'DO workbooks retrieved successfully',
      data: workbooks,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get workbook by year with monthly sheets
 */
export const getWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all DOs for the year - each DO is its own sheet
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    // Each DO is a sheet (like LPO workbook)
    const workbook = {
      id: year,
      year,
      name: `DELIVERY ORDERS ${year}`,
      sheetCount: deliveryOrders.length,
      sheets: deliveryOrders.map(order => ({
        ...order,
        workbookId: year,
        isActive: true
      })),
    };

    res.status(200).json({
      success: true,
      message: 'DO workbook retrieved successfully',
      data: workbook,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get available years for DO workbooks
 */
export const getAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const years = await DeliveryOrder.distinct('date', { isDeleted: false });
    
    const uniqueYears = [...new Set(
      years
        .map(date => {
          const year = parseInt(date.split('-')[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter(year => year !== null && year >= 2000 && year <= 2100)
    )].sort((a, b) => (b as number) - (a as number));

    res.status(200).json({
      success: true,
      message: 'Available years retrieved successfully',
      data: uniqueYears,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export DO workbook as Excel file with logo and formatting
 */
export const exportWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all DOs for the year
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load logo image
    let logoId: number | null = null;
    const logoPath = path.join(__dirname, '../../assets/logo.png');
    if (fs.existsSync(logoPath)) {
      logoId = excelWorkbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    }

    // Create individual sheets for each DO FIRST (like LPO workbook)
    for (const order of deliveryOrders) {
      // Sheet name: DO number (max 31 chars for Excel)
      const sheetName = (order.doNumber || 'DO').substring(0, 31);
      const sheet = excelWorkbook.addWorksheet(sheetName);

      // Format date
      const formatDate = (dateString: string) => {
        if (!dateString) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      };

      // Set column widths for delivery note format
      sheet.getColumn(1).width = 3;
      sheet.getColumn(2).width = 15;
      sheet.getColumn(3).width = 15;
      sheet.getColumn(4).width = 15;
      sheet.getColumn(5).width = 15;
      sheet.getColumn(6).width = 15;
      sheet.getColumn(7).width = 15;
      sheet.getColumn(8).width = 3;

      // Add logo
      if (logoId !== null) {
        sheet.addImage(logoId, {
          tl: { col: 5, row: 0 },
          ext: { width: 140, height: 70 },
        });
      }

      // Row 1-2: Company name
      sheet.mergeCells('B1:D2');
      sheet.getCell('B1').value = 'TAHMEED';
      sheet.getCell('B1').font = { bold: true, size: 24, color: { argb: 'FFE67E22' } };

      // Row 3: Website
      sheet.getCell('B3').value = 'www.tahmeedcoach.co.ke';
      sheet.getCell('B3').font = { size: 9 };

      // Row 4: Email
      sheet.getCell('B4').value = 'Email: info@tahmeedcoach.co.ke';
      sheet.getCell('B4').font = { size: 9 };

      // Row 5: Tel
      sheet.getCell('B5').value = 'Tel: +254 700 000 000';
      sheet.getCell('B5').font = { size: 9 };

      // Row 7: Title
      sheet.mergeCells('B7:G7');
      sheet.getCell('B7').value = 'DELIVERY NOTE GOODS RECEIVED NOTE';
      sheet.getCell('B7').font = { bold: true, size: 14 };
      sheet.getCell('B7').alignment = { horizontal: 'center' };
      sheet.getCell('B7').border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
      };

      // Row 9: DO Number and Date
      sheet.mergeCells('B9:D9');
      sheet.getCell('B9').value = `${order.doType || 'DO'} #: ${order.doNumber}`;
      sheet.getCell('B9').font = { bold: true, size: 12 };
      sheet.getCell('D9').font = { color: { argb: 'FFDC3545' } };

      sheet.mergeCells('E9:G9');
      sheet.getCell('E9').value = `Date: ${formatDate(order.date)}`;
      sheet.getCell('E9').font = { bold: true };
      sheet.getCell('E9').alignment = { horizontal: 'right' };

      // Row 11: TO
      sheet.getCell('B11').value = 'TO:';
      sheet.getCell('B11').font = { bold: true };
      sheet.getCell('C11').value = order.clientName;
      sheet.getCell('C11').font = { bold: true };

      // Row 12: Description
      sheet.mergeCells('B12:G12');
      sheet.getCell('B12').value = 'Please receive the under mentioned containers/Packages ex.m.v';
      sheet.getCell('B12').font = { size: 9 };

      // Row 13: MPRO and POL
      sheet.getCell('B13').value = `MPRO NO: ${order.invoiceNos || ''}`;
      sheet.getCell('D13').value = `POL: ${order.loadingPoint}`;

      // Row 14: Arrive
      sheet.getCell('E13').value = `Arrive: ${order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}`;

      // Row 15: Destination
      sheet.getCell('B15').value = 'For Destination:';
      sheet.getCell('B15').font = { bold: true };
      sheet.getCell('C15').value = order.destination;
      sheet.getCell('C15').font = { bold: true };

      // Row 16: Haulier
      sheet.getCell('B16').value = 'Haulier:';
      sheet.getCell('B16').font = { bold: true };
      sheet.getCell('C16').value = order.haulier;
      sheet.getCell('C16').font = { bold: true };

      // Row 15: Lorry No
      sheet.getCell('E15').value = 'Lorry No:';
      sheet.getCell('E15').font = { bold: true };
      sheet.getCell('F15').value = order.truckNo;
      sheet.getCell('F15').font = { bold: true };

      // Row 16: Trailer No
      sheet.getCell('E16').value = 'Trailer No:';
      sheet.getCell('E16').font = { bold: true };
      sheet.getCell('F16').value = order.trailerNo;
      sheet.getCell('F16').font = { bold: true };

      // Row 18: Items Table Header
      const tableHeaderRow = sheet.getRow(18);
      tableHeaderRow.values = ['', 'CONTAINER NO.', 'B/L NO', 'PACKAGES', 'CONTENTS', 'WEIGHT', 'MEASUREMENT', ''];
      // Apply styling only to columns 2-7 (the actual table columns)
      for (let col = 2; col <= 7; col++) {
        const cell = tableHeaderRow.getCell(col);
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }

      // Row 19: Item Data
      const dataRow = sheet.getRow(19);
      dataRow.values = ['', order.containerNo || 'LOOSE CARGO', '', '', '', `${order.tonnages} TONS`, '', ''];
      // Apply styling only to columns 2-7
      for (let col = 2; col <= 7; col++) {
        const cell = dataRow.getCell(col);
        cell.alignment = { horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
      dataRow.getCell(2).font = { bold: true };
      dataRow.getCell(6).font = { bold: true };

      // Empty rows for table
      for (let i = 20; i <= 21; i++) {
        const emptyRow = sheet.getRow(i);
        emptyRow.values = ['', '', '', '', '', '', '', ''];
        for (let col = 2; col <= 7; col++) {
          emptyRow.getCell(col).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
      }

      // Row 23: Prepared By
      sheet.getCell('B23').value = 'Prepared By: _______________________';
      sheet.getCell('B23').font = { bold: true };

      // Row 25: Releasing Clerk
      sheet.getCell('B25').value = 'Releasing Clerks Name';
      sheet.getCell('B25').font = { bold: true };

      // Row 28: Remarks
      sheet.getCell('B28').value = `REMARKS: ${order.cargoType || ''}`;
      sheet.getCell('B28').font = { bold: true };

      // Row 29: Rate
      sheet.mergeCells('B29:G29');
      sheet.getCell('B29').value = `$${order.ratePerTon} PER TON`;
      sheet.getCell('B29').font = { bold: true, size: 14 };
      sheet.getCell('B29').alignment = { horizontal: 'center' };

      // Row 32: Acknowledgment
      sheet.mergeCells('B32:G32');
      sheet.getCell('B32').value = 'Acknowledge receipts of the goods as detailed above';
      sheet.getCell('B32').font = { bold: true };

      // Row 33: Delivers Name
      sheet.getCell('B33').value = 'Delivers Name:';
      sheet.getCell('B33').font = { bold: true };
      sheet.getCell('C33').value = order.driverName || '';
      sheet.getCell('C33').font = { bold: true };

      sheet.getCell('E33').value = 'Date:';
      sheet.getCell('E33').font = { bold: true };
      sheet.getCell('F33').value = formatDate(order.date);
      sheet.getCell('F33').font = { bold: true };

      // Row 35: National ID
      sheet.getCell('B35').value = 'National ID/Passport No. _______________________';

      // Add borders to sections
      for (let row = 9; row <= 35; row++) {
        sheet.getRow(row).getCell(2).border = { left: { style: 'thin' } };
        sheet.getRow(row).getCell(7).border = { right: { style: 'thin' } };
      }
    }

    // Create Summary sheet LAST (so it appears at the end)
    const summarySheet = excelWorkbook.addWorksheet('Summary');
    
    // Add logo to summary sheet
    if (logoId !== null) {
      summarySheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 150, height: 75 },
      });
    }

    // Summary header
    summarySheet.mergeCells('C1:H1');
    summarySheet.getCell('C1').value = `DELIVERY ORDERS ${year} - SUMMARY`;
    summarySheet.getCell('C1').font = { bold: true, size: 16 };
    summarySheet.getCell('C1').alignment = { horizontal: 'center' };

    // Summary columns
    summarySheet.columns = [
      { header: '', key: 'logo', width: 20 },
      { header: '', key: 'space', width: 5 },
      { header: 'DO Number', key: 'doNumber', width: 15 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Truck No', key: 'truckNo', width: 15 },
      { header: 'Destination', key: 'destination', width: 20 },
      { header: 'Tonnage', key: 'tonnage', width: 12 },
      { header: 'Type', key: 'type', width: 10 },
    ];

    // Add header row at row 5
    const summaryHeaderRow = summarySheet.getRow(5);
    summaryHeaderRow.values = ['', '', 'DO Number', 'Date', 'Client', 'Truck No', 'Destination', 'Tonnage', 'Type'];
    // Apply styling only to columns 3-9 (the actual data columns)
    for (let col = 3; col <= 9; col++) {
      const cell = summaryHeaderRow.getCell(col);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
    }

    // Add summary data for each DO
    let summaryRowNum = 6;
    deliveryOrders.forEach((order) => {
      const row = summarySheet.getRow(summaryRowNum);
      row.values = [
        '', '',
        order.doNumber,
        order.date,
        order.clientName,
        order.truckNo,
        order.destination,
        order.tonnages,
        order.importOrExport,
      ];
      // Apply alignment only to columns 3-9
      for (let col = 3; col <= 9; col++) {
        row.getCell(col).alignment = { horizontal: 'center' };
      }
      summaryRowNum++;
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=DELIVERY_ORDERS_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`DO Workbook exported for year ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export specific month as Excel
 */
export const exportMonth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new ApiError(400, 'Invalid year or month');
    }

    const monthStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const monthEnd = `${year}-${month.toString().padStart(2, '0')}-31`;

    // Get all DOs for the month
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      date: { $gte: monthStart, $lte: monthEnd }
    }).sort({ date: 1, sn: 1 }).lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for this month');
    }

    const monthName = MONTH_NAMES[month - 1];

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load logo image
    let logoId: number | null = null;
    const logoPath = path.join(__dirname, '../../assets/logo.png');
    if (fs.existsSync(logoPath)) {
      logoId = excelWorkbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    }

    // Create sheet
    const sheet = excelWorkbook.addWorksheet(monthName);

    // Add logo
    if (logoId !== null) {
      sheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 120, height: 60 },
      });
    }

    // Header
    sheet.mergeCells('C1:K1');
    sheet.getCell('C1').value = `DELIVERY ORDERS - ${monthName.toUpperCase()} ${year}`;
    sheet.getCell('C1').font = { bold: true, size: 14 };
    sheet.getCell('C1').alignment = { horizontal: 'center' };

    // Add spacing
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([]);

    // Column headers
    const headerRow = sheet.addRow([
      'S/N', 'Date', 'Type', 'DO Number', 'Client', 'Truck No', 
      'Trailer No', 'Container', 'Destination', 'Tonnage', 'Rate/Ton', 'Amount'
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Set column widths
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 15;
    sheet.getColumn(5).width = 20;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 15;
    sheet.getColumn(9).width = 20;
    sheet.getColumn(10).width = 10;
    sheet.getColumn(11).width = 12;
    sheet.getColumn(12).width = 15;

    // Add data
    let rowIndex = 1;
    let totalTonnage = 0;
    let totalAmount = 0;

    for (const entry of deliveryOrders) {
      const amount = (entry.tonnages || 0) * (entry.ratePerTon || 0);
      totalTonnage += entry.tonnages || 0;
      totalAmount += amount;

      const dataRow = sheet.addRow([
        rowIndex++,
        entry.date,
        entry.importOrExport,
        entry.doNumber,
        entry.clientName,
        entry.truckNo,
        entry.trailerNo,
        entry.containerNo,
        entry.destination,
        entry.tonnages,
        entry.ratePerTon,
        amount
      ]);

      if (rowIndex % 2 === 0) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        };
      }

      const typeCell = dataRow.getCell(3);
      if (entry.importOrExport === 'IMPORT') {
        typeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDCE6F1' },
        };
      } else {
        typeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD4EDDA' },
        };
      }

      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    }

    // Totals row
    const totalRow = sheet.addRow([
      '', '', '', '', '', '', '', 'TOTAL:', '', totalTonnage, '', totalAmount
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=DELIVERY_ORDERS_${monthName}_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`DO Month export for ${monthName} ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};
