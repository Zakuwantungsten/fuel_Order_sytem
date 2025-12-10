import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import archivalService, { ArchivalOptions } from '../services/archivalService';
import unifiedExportService from '../services/unifiedExportService';
import { ApiError } from '../middleware/errorHandler';
import { logger } from '../utils';
import ExcelJS from 'exceljs';

/**
 * Run archival process
 * @route POST /api/archival/run
 * @access Super Admin only
 */
export const runArchival = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || user.role !== 'super_admin') {
      throw new ApiError(403, 'Only super administrators can run archival process');
    }

    const {
      monthsToKeep = 6,
      auditLogMonthsToKeep = 12,
      dryRun = false,
      collections,
    } = req.body as {
      monthsToKeep?: number;
      auditLogMonthsToKeep?: number;
      dryRun?: boolean;
      collections?: string[];
    };

    logger.info(`Archival process initiated by ${user.username}`);

    const options: ArchivalOptions = {
      monthsToKeep,
      auditLogMonthsToKeep,
      dryRun,
      collections,
      batchSize: 1000,
    };

    const result = await archivalService.archiveOldData(options, user.username);

    res.status(200).json({
      success: true,
      message: dryRun
        ? 'Dry run completed. No data was actually archived.'
        : 'Archival process completed successfully',
      data: result,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get archival statistics
 * @route GET /api/archival/stats
 * @access Admin, Super Admin
 */
export const getArchivalStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || !['admin', 'super_admin', 'system_admin'].includes(user.role)) {
      throw new ApiError(403, 'Insufficient permissions');
    }

    const stats = await archivalService.getArchivalStats();

    res.status(200).json({
      success: true,
      message: 'Archival statistics retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Query archived data
 * @route POST /api/archival/query
 * @access Admin, Super Admin, Manager
 */
export const queryArchivedData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || !['admin', 'super_admin', 'system_admin', 'manager', 'super_manager'].includes(user.role)) {
      throw new ApiError(403, 'Insufficient permissions to query archived data');
    }

    const {
      collectionName,
      query = {},
      limit = 100,
      skip = 0,
      sort = { archivedAt: -1 },
      select,
    } = req.body as {
      collectionName: string;
      query?: any;
      limit?: number;
      skip?: number;
      sort?: any;
      select?: string;
    };

    if (!collectionName) {
      throw new ApiError(400, 'Collection name is required');
    }

    const archivedData = await archivalService.queryArchivedData(collectionName, query, {
      limit,
      skip,
      sort,
      select,
    });

    res.status(200).json({
      success: true,
      message: 'Archived data retrieved successfully',
      data: {
        collectionName,
        records: archivedData,
        count: archivedData.length,
        limit,
        skip,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Restore archived data
 * @route POST /api/archival/restore
 * @access Super Admin only
 */
export const restoreArchivedData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || user.role !== 'super_admin') {
      throw new ApiError(403, 'Only super administrators can restore archived data');
    }

    const {
      collectionName,
      startDate,
      endDate,
    } = req.body as {
      collectionName: string;
      startDate?: string;
      endDate?: string;
    };

    if (!collectionName) {
      throw new ApiError(400, 'Collection name is required');
    }

    logger.warn(`Data restoration initiated by ${user.username} for ${collectionName}`);

    const result = await archivalService.restoreArchivedData(
      collectionName,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.status(200).json({
      success: true,
      message: 'Archived data restored successfully',
      data: result,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get archival history
 * @route GET /api/archival/history
 * @access Admin, Super Admin
 */
export const getArchivalHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || !['admin', 'super_admin', 'system_admin'].includes(user.role)) {
      throw new ApiError(403, 'Insufficient permissions');
    }

    const { ArchivalMetadata } = require('../models/ArchivedData');
    
    const history = await ArchivalMetadata.find()
      .sort({ archivalDate: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      message: 'Archival history retrieved successfully',
      data: {
        history,
        count: history.length,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export unified data (active + archived) to Excel
 * @route POST /api/archival/export
 * @access Super Admin only
 */
export const exportUnifiedData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || user.role !== 'super_admin') {
      throw new ApiError(403, 'Only super administrators can export complete historical data');
    }

    const {
      collectionName,
      startDate,
      endDate,
      format = 'excel',
    } = req.body as {
      collectionName: 'FuelRecord' | 'LPOEntry' | 'LPOSummary' | 'YardFuelDispense' | 'DeliveryOrder';
      startDate?: string;
      endDate?: string;
      format?: 'excel' | 'csv';
    };

    if (!collectionName) {
      throw new ApiError(400, 'Collection name is required');
    }

    logger.info(`Super Admin ${user.username} exporting unified ${collectionName} data`);

    // Get all data (active + archived)
    const allData = await unifiedExportService.getUnifiedData(collectionName, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      includeArchived: true,
    });

    if (format === 'excel') {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${collectionName} - Complete History`);

      // Add headers based on collection type
      let headers: string[] = [];
      switch (collectionName) {
        case 'FuelRecord':
          headers = ['Date', 'Truck No', 'Going DO', 'Return DO', 'From', 'To', 'Total Lts', 'Extra', 'Balance', 'Status'];
          break;
        case 'LPOEntry':
          headers = ['Date', 'LPO No', 'Truck No', 'Diesel At', 'DO/SDO', 'Liters', 'Rate', 'Amount', 'Status'];
          break;
        case 'LPOSummary':
          headers = ['Date', 'LPO No', 'Station', 'Year', 'Total Liters', 'Total Amount', 'Status'];
          break;
        case 'YardFuelDispense':
          headers = ['Date', 'Truck No', 'Yard', 'Liters', 'Status'];
          break;
        case 'DeliveryOrder':
          headers = ['Date', 'DO Number', 'Truck No', 'Client', 'Destination', 'Tonnages', 'Status'];
          break;
      }

      worksheet.addRow(headers);

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };

      // Add data rows
      allData.forEach((record: any) => {
        let row: any[] = [];
        switch (collectionName) {
          case 'FuelRecord':
            row = [
              record.date,
              record.truckNo,
              record.goingDo,
              record.returnDo || '-',
              record.from,
              record.to,
              record.totalLts,
              record.extra,
              record.balance,
              record.archivedAt ? 'ARCHIVED' : 'ACTIVE',
            ];
            break;
          case 'LPOEntry':
            row = [
              record.date,
              record.lpoNo,
              record.truckNo,
              record.dieselAt,
              record.doSdo,
              record.liters,
              record.rate,
              record.amount,
              record.archivedAt ? 'ARCHIVED' : 'ACTIVE',
            ];
            break;
          case 'LPOSummary':
            row = [
              record.date,
              record.lpoNo,
              record.station,
              record.year,
              record.totalLiters,
              record.totalAmount,
              record.archivedAt ? 'ARCHIVED' : 'ACTIVE',
            ];
            break;
          case 'YardFuelDispense':
            row = [
              record.date,
              record.truckNo,
              record.yard,
              record.liters,
              record.archivedAt ? 'ARCHIVED' : 'ACTIVE',
            ];
            break;
          case 'DeliveryOrder':
            row = [
              record.date,
              record.doNumber,
              record.truckNo,
              record.clientName,
              record.destination,
              record.tonnages,
              record.isCancelled ? 'CANCELLED' : 'ACTIVE',
            ];
            break;
        }
        worksheet.addRow(row);
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        if (column && column.eachCell) {
          let maxLength = 0;
          column.eachCell!({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
              maxLength = columnLength;
            }
          });
          column.width = maxLength < 10 ? 10 : maxLength + 2;
        }
      });

      // Add summary at bottom
      const summaryRow = worksheet.addRow([]);
      const statsRow = worksheet.addRow([
        'Total Records:',
        allData.length,
        '',
        'Active:',
        allData.filter((r: any) => !r.archivedAt).length,
        '',
        'Archived:',
        allData.filter((r: any) => r.archivedAt).length,
      ]);
      statsRow.font = { bold: true };

      // Send file
      const filename = `${collectionName}_Complete_History_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();

      logger.info(`Exported ${allData.length} records (${collectionName}) to ${filename}`);
    } else {
      // CSV format
      res.status(200).json({
        success: true,
        message: 'Data exported successfully',
        data: {
          records: allData,
          count: allData.length,
          active: allData.filter((r: any) => !r.archivedAt).length,
          archived: allData.filter((r: any) => r.archivedAt).length,
        },
      });
    }
  } catch (error: any) {
    throw error;
  }
};
