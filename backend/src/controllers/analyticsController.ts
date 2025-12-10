import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { DeliveryOrder } from '../models/DeliveryOrder';
import { FuelRecord } from '../models/FuelRecord';
import { LPOEntry } from '../models/LPOEntry';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import unifiedExportService from '../services/unifiedExportService';

/**
 * Get comprehensive analytics dashboard data
 * GET /api/system-admin/analytics/dashboard
 */
export const getDashboardAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, period = '30' } = req.query;
    
    const start = startDate 
      ? new Date(startDate as string) 
      : new Date(Date.now() - parseInt(period as string) * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Parallel queries for performance
    const [
      totalRevenue,
      fuelDispensed,
      activeTrucks,
      totalOrders,
      revenueByMonth,
      fuelByStation,
      topTrucks,
      recentActivity,
    ] = await Promise.all([
      calculateTotalRevenue(start, end),
      calculateFuelDispensed(start, end),
      getActiveTrucks(start, end),
      DeliveryOrder.countDocuments({ 
        date: { $gte: start, $lte: end },
        status: 'active'
      }),
      getRevenueByMonth(start, end),
      getFuelByStation(start, end),
      getTopTrucks(start, end),
      getRecentActivity(20),
    ]);

    // Calculate trends (compare with previous period)
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const [prevRevenue, prevFuel, prevTrucks] = await Promise.all([
      calculateTotalRevenue(previousStart, start),
      calculateFuelDispensed(previousStart, start),
      getActiveTrucks(previousStart, start),
    ]);

    const revenueTrend = calculatePercentageChange(prevRevenue, totalRevenue);
    const fuelTrend = calculatePercentageChange(prevFuel, fuelDispensed);
    const truckTrend = activeTrucks - prevTrucks;

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          revenueTrend,
          fuelDispensed,
          fuelTrend,
          activeTrucks,
          truckTrend,
          totalOrders,
        },
        charts: {
          revenueByMonth,
          fuelByStation,
          topTrucks,
        },
        recentActivity,
        period: { start, end },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch analytics',
    });
  }
};

/**
 * Get detailed revenue report
 * GET /api/system-admin/analytics/revenue
 */
export const getRevenueReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    let groupByFormat: any;
    switch (groupBy) {
      case 'hour':
        groupByFormat = { 
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' },
          hour: { $hour: '$date' }
        };
        break;
      case 'day':
        groupByFormat = { 
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' }
        };
        break;
      case 'month':
        groupByFormat = { 
          year: { $year: '$date' },
          month: { $month: '$date' }
        };
        break;
      case 'year':
        groupByFormat = { year: { $year: '$date' } };
        break;
      default:
        groupByFormat = { 
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' }
        };
    }

    const revenueData = await DeliveryOrder.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          status: 'active',
        }
      },
      {
        $group: {
          _id: groupByFormat,
          totalRevenue: {
            $sum: { $multiply: ['$tonnages', '$ratePerTon'] }
          },
          orderCount: { $sum: 1 },
          avgTonnage: { $avg: '$tonnages' },
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const totalRevenue = revenueData.reduce((sum: number, item: any) => sum + item.totalRevenue, 0);
    const totalOrders = revenueData.reduce((sum: number, item: any) => sum + item.orderCount, 0);

    res.json({
      success: true,
      data: {
        revenueData,
        summary: {
          totalRevenue,
          totalOrders,
          averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        },
        period: { start, end },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch revenue report',
    });
  }
};

/**
 * Get fuel consumption report
 * GET /api/system-admin/analytics/fuel
 */
export const getFuelReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const [byStation, byTruck, byFuelType, timeline] = await Promise.all([
      // Fuel by station
      FuelRecord.aggregate([
        {
          $match: {
            date: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$station',
            totalLiters: { $sum: '$liters' },
            totalAmount: { $sum: '$totalAmount' },
            recordCount: { $sum: 1 },
          }
        },
        { $sort: { totalLiters: -1 } }
      ]),

      // Fuel by truck
      FuelRecord.aggregate([
        {
          $match: {
            date: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$truckNo',
            totalLiters: { $sum: '$liters' },
            totalAmount: { $sum: '$totalAmount' },
            tripCount: { $sum: 1 },
          }
        },
        { $sort: { totalLiters: -1 } },
        { $limit: 20 }
      ]),

      // Fuel by type
      FuelRecord.aggregate([
        {
          $match: {
            date: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$fuelType',
            totalLiters: { $sum: '$liters' },
            totalAmount: { $sum: '$totalAmount' },
          }
        }
      ]),

      // Timeline
      FuelRecord.aggregate([
        {
          $match: {
            date: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
              day: { $dayOfMonth: '$date' }
            },
            totalLiters: { $sum: '$liters' },
            totalAmount: { $sum: '$totalAmount' },
          }
        },
        { $sort: { '_id': 1 } }
      ]),
    ]);

    const totalLiters = byStation.reduce((sum: number, s: any) => sum + s.totalLiters, 0);
    const totalAmount = byStation.reduce((sum: number, s: any) => sum + s.totalAmount, 0);

    res.json({
      success: true,
      data: {
        byStation,
        byTruck,
        byFuelType,
        timeline,
        summary: {
          totalLiters,
          totalAmount,
          averagePricePerLiter: totalLiters > 0 ? totalAmount / totalLiters : 0,
        },
        period: { start, end },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fuel report',
    });
  }
};

/**
 * Get user activity report
 * GET /api/system-admin/analytics/user-activity
 */
export const getUserActivityReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const [activityByUser, activityByAction, timeline, topUsers] = await Promise.all([
      // Activity by user
      AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$user',
            actionCount: { $sum: 1 },
            actions: { $push: '$action' }
          }
        },
        { $sort: { actionCount: -1 } }
      ]),

      // Activity by action type
      AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Activity timeline
      AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]),

      // Top active users
      AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$user',
            actionCount: { $sum: 1 },
            lastActivity: { $max: '$timestamp' }
          }
        },
        { $sort: { actionCount: -1 } },
        { $limit: 10 }
      ]),
    ]);

    res.json({
      success: true,
      data: {
        activityByUser,
        activityByAction,
        timeline,
        topUsers,
        period: { start, end },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user activity report',
    });
  }
};

/**
 * Get system performance metrics
 * GET /api/system-admin/analytics/system-performance
 */
export const getSystemPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const [
      dbStats,
      collectionStats,
      userStats,
      activityStats,
    ] = await Promise.all([
      mongoose.connection.db?.stats(),
      getCollectionStatistics(),
      getUserStatistics(),
      getActivityStatistics(),
    ]);

    res.json({
      success: true,
      data: {
        database: dbStats,
        collections: collectionStats,
        users: userStats,
        activity: activityStats,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch system performance',
    });
  }
};

/**
 * Export analytics report
 * POST /api/system-admin/analytics/export
 */
export const exportAnalyticsReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reportType, startDate, endDate } = req.body;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let filename: string;

    switch (reportType) {
      case 'revenue':
        filename = await exportRevenueToExcel(req, res, start, end);
        break;
      case 'fuel':
        filename = await exportFuelToExcel(req, res, start, end);
        break;
      case 'user-activity':
        filename = await exportUserActivityToExcel(req, res, start, end);
        break;
      case 'comprehensive':
        filename = await exportComprehensiveToExcel(req, res, start, end);
        break;
      default:
        res.status(400).json({
          success: false,
          message: 'Invalid report type',
        });
        return;
    }

    // Log export
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'analytics_exported',
      resource: 'analytics',
      details: {
        reportType,
        filename,
        startDate: start,
        endDate: end,
      },
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export report',
    });
  }
};

// Helper functions
async function calculateTotalRevenue(start: Date, end: Date): Promise<number> {
  const result = await DeliveryOrder.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: 'active',
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $multiply: ['$tonnages', '$ratePerTon'] } }
      }
    }
  ]);
  
  return result[0]?.total || 0;
}

async function calculateFuelDispensed(start: Date, end: Date): Promise<number> {
  const result = await FuelRecord.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$liters' }
      }
    }
  ]);
  
  return result[0]?.total || 0;
}

async function getActiveTrucks(start: Date, end: Date): Promise<number> {
  const trucks = await DeliveryOrder.distinct('truckNo', {
    date: { $gte: start, $lte: end },
    status: 'active',
  });
  
  return trucks.length;
}

async function getRevenueByMonth(start: Date, end: Date) {
  return await DeliveryOrder.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: 'active',
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' }
        },
        revenue: { $sum: { $multiply: ['$tonnages', '$ratePerTon'] } },
        orders: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
}

async function getFuelByStation(start: Date, end: Date) {
  return await FuelRecord.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$station',
        totalLiters: { $sum: '$liters' },
        totalAmount: { $sum: '$totalAmount' }
      }
    },
    { $sort: { totalLiters: -1 } },
    { $limit: 10 }
  ]);
}

async function getTopTrucks(start: Date, end: Date) {
  return await DeliveryOrder.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: 'active',
      }
    },
    {
      $group: {
        _id: '$truckNo',
        trips: { $sum: 1 },
        totalTonnage: { $sum: '$tonnages' },
        revenue: { $sum: { $multiply: ['$tonnages', '$ratePerTon'] } }
      }
    },
    { $sort: { trips: -1 } },
    { $limit: 10 }
  ]);
}

async function getRecentActivity(limit: number) {
  return await AuditLog.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('user action resource timestamp')
    .lean();
}

async function getCollectionStatistics() {
  const collections = ['deliveryorders', 'fuelrecords', 'lpoentries', 'users', 'auditlogs'];
  const stats = await Promise.all(
    collections.map(async (name) => {
      try {
        const collection = mongoose.connection.collection(name);
        const count = await collection.countDocuments();
        return { name, count };
      } catch {
        return { name, count: 0 };
      }
    })
  );
  return stats;
}

async function getUserStatistics() {
  const [total, active, byRole] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]),
  ]);
  
  return { total, active, byRole };
}

async function getActivityStatistics() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const [actionsLast24h, actionsLast7d] = await Promise.all([
    AuditLog.countDocuments({ timestamp: { $gte: last24h } }),
    AuditLog.countDocuments({ timestamp: { $gte: last7d } }),
  ]);
  
  return { last24h: actionsLast24h, last7d: actionsLast7d };
}

function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

async function getRevenueReportData(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  
  return await DeliveryOrder.find({
    date: { $gte: start, $lte: end },
    status: 'active',
  }).select('date doNumber truckNo tonnages ratePerTon clientName').lean();
}

async function getFuelReportData(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  
  // Use unified export service to include archived data
  const allRecords = await unifiedExportService.getAllFuelRecords({
    startDate: start,
    endDate: end,
    includeArchived: true,
  });
  
  // Transform to match expected format
  return allRecords.map((record: any) => ({
    date: record.date,
    truckNo: record.truckNo,
    station: record.from || record.to,
    liters: record.totalLts,
    pricePerLiter: 0, // FuelRecord doesn't have price
    totalAmount: 0,
  }));
}

async function getUserActivityReportData(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  
  return await AuditLog.find({
    timestamp: { $gte: start, $lte: end }
  }).select('user action resource timestamp details').lean();
}

async function getComprehensiveReportData(startDate?: string, endDate?: string) {
  const [revenue, fuel, activity] = await Promise.all([
    getRevenueReportData(startDate, endDate),
    getFuelReportData(startDate, endDate),
    getUserActivityReportData(startDate, endDate),
  ]);
  
  return { revenue, fuel, activity };
}

// Excel Export Functions
async function exportRevenueToExcel(req: AuthRequest, res: Response, start: Date, end: Date): Promise<string> {
  const orders = await DeliveryOrder.find({
    date: { $gte: start, $lte: end },
    status: 'active'
  }).select('doNumber truckNo date destination tonnages ratePerTon customerName').sort({ date: -1 }).lean();

  const data = orders.map((order: any) => ({
    'DO Number': order.doNumber,
    'Truck No': order.truckNo,
    'Date': new Date(order.date).toLocaleDateString(),
    'Customer': order.customerName,
    'Destination': order.destination,
    'Tonnage': order.tonnages,
    'Rate/Ton (TSh)': order.ratePerTon,
    'Total Amount (TSh)': order.tonnages * order.ratePerTon,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Revenue Report');

  const filename = `revenue_report_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);

  return filename;
}

async function exportFuelToExcel(req: AuthRequest, res: Response, start: Date, end: Date): Promise<string> {
  // Use unified export service to include archived data
  const records = await unifiedExportService.getAllFuelRecords({
    startDate: start,
    endDate: end,
    includeArchived: true,
    sort: { date: -1 },
  });

  const data = records.map((record: any) => ({
    'Truck No': record.truckNo,
    'Date': new Date(record.date).toLocaleDateString(),
    'Station': record.station,
    'Fuel Type': record.fuelType,
    'Liters': record.liters,
    'Price/Liter (TSh)': record.pricePerLiter,
    'Total Cost (TSh)': record.totalAmount,
    'Odometer': record.odometerReading,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Fuel Report');

  const filename = `fuel_report_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);

  return filename;
}

async function exportUserActivityToExcel(req: AuthRequest, res: Response, start: Date, end: Date): Promise<string> {
  const logs = await AuditLog.find({
    timestamp: { $gte: start, $lte: end }
  }).select('username action resourceType resourceId details timestamp').sort({ timestamp: -1 }).limit(1000).lean();

  const data = logs.map((log: any) => ({
    'Username': log.username,
    'Action': log.action,
    'Resource': log.resourceType,
    'Resource ID': log.resourceId,
    'Details': JSON.stringify(log.details),
    'Date & Time': new Date(log.timestamp).toLocaleString(),
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'User Activity');

  const filename = `user_activity_report_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);

  return filename;
}

async function exportComprehensiveToExcel(req: AuthRequest, res: Response, start: Date, end: Date): Promise<string> {
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  const totalRevenue = await calculateTotalRevenue(start, end);
  const totalFuel = await calculateFuelDispensed(start, end);
  const activeTrucks = await getActiveTrucks(start, end);
  
  const summaryData = [
    { Metric: 'Report Period', Value: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}` },
    { Metric: 'Total Revenue (TSh)', Value: totalRevenue },
    { Metric: 'Total Fuel Dispensed (L)', Value: totalFuel },
    { Metric: 'Active Trucks', Value: activeTrucks },
    { Metric: 'Generated At', Value: new Date().toLocaleString() },
    { Metric: 'Generated By', Value: req.user?.username || 'System' },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Revenue Details
  const orders = await DeliveryOrder.find({
    date: { $gte: start, $lte: end },
    status: 'active'
  }).select('doNumber truckNo date destination tonnages ratePerTon customerName').sort({ date: -1 }).lean();

  if (orders.length > 0) {
    const revenueData = orders.map((order: any) => ({
      'DO Number': order.doNumber,
      'Truck No': order.truckNo,
      'Date': new Date(order.date).toLocaleDateString(),
      'Customer': order.customerName,
      'Destination': order.destination,
      'Tonnage': order.tonnages,
      'Rate/Ton (TSh)': order.ratePerTon,
      'Total (TSh)': order.tonnages * order.ratePerTon,
    }));
    const revenueSheet = XLSX.utils.json_to_sheet(revenueData);
    XLSX.utils.book_append_sheet(workbook, revenueSheet, 'Revenue Details');
  }

  // Fuel Records (including archived data)
  const fuelRecords = await unifiedExportService.getAllFuelRecords({
    startDate: start,
    endDate: end,
    includeArchived: true,
    sort: { date: -1 },
  });

  if (fuelRecords.length > 0) {
    const fuelData = fuelRecords.map((record: any) => ({
      'Truck No': record.truckNo,
      'Date': new Date(record.date).toLocaleDateString(),
      'Station': record.station,
      'Fuel Type': record.fuelType,
      'Liters': record.liters,
      'Price/Liter (TSh)': record.pricePerLiter,
      'Total (TSh)': record.totalAmount,
    }));
    const fuelSheet = XLSX.utils.json_to_sheet(fuelData);
    XLSX.utils.book_append_sheet(workbook, fuelSheet, 'Fuel Records');
  }

  // User Activity
  const activityLogs = await AuditLog.find({
    timestamp: { $gte: start, $lte: end }
  }).select('username action resourceType timestamp').sort({ timestamp: -1 }).limit(500).lean();

  if (activityLogs.length > 0) {
    const activityData = activityLogs.map((log: any) => ({
      'Username': log.username,
      'Action': log.action,
      'Resource': log.resourceType,
      'Date & Time': new Date(log.timestamp).toLocaleString(),
    }));
    const activitySheet = XLSX.utils.json_to_sheet(activityData);
    XLSX.utils.book_append_sheet(workbook, activitySheet, 'User Activity');
  }

  const filename = `comprehensive_report_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);

  return filename;
}
