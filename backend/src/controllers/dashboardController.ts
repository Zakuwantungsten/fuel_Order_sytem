import { Response } from 'express';
import { DeliveryOrder, LPOEntry, FuelRecord, YardFuelDispense } from '../models';
import { AuthRequest } from '../middleware/auth';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    // Build date filter
    const dateFilter: any = { isDeleted: false };
    if (dateFrom || dateTo) {
      dateFilter.date = {};
      if (dateFrom) dateFilter.date.$gte = dateFrom;
      if (dateTo) dateFilter.date.$lte = dateTo;
    }

    // Get counts and aggregations in parallel
    const [
      totalDOs,
      totalLPOs,
      totalFuelRecords,
      activeTrips,
      deliveryOrders,
      fuelRecords,
      lpoEntries,
    ] = await Promise.all([
      DeliveryOrder.countDocuments(dateFilter),
      LPOEntry.countDocuments(dateFilter),
      FuelRecord.countDocuments(dateFilter),
      DeliveryOrder.countDocuments({
        ...dateFilter,
        importOrExport: 'IMPORT',
        returnDo: { $exists: false },
      }),
      DeliveryOrder.find(dateFilter).lean(),
      FuelRecord.find(dateFilter).lean(),
      LPOEntry.find(dateFilter).lean(),
    ]);

    // Calculate totals
    const totalTonnage = deliveryOrders.reduce((sum, DO) => sum + (DO.tonnages || 0), 0);
    
    const totalLiters = fuelRecords.reduce((sum, record) => sum + (record.totalLts || 0), 0);
    
    const totalRevenue = lpoEntries.reduce(
      (sum, lpo) => sum + lpo.ltrs * lpo.pricePerLtr,
      0
    );

    // Get recent activities
    const recentDOs = await DeliveryOrder.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentLPOs = await LPOEntry.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Get fuel summary by yard
    const yardFuelSummary = fuelRecords.reduce(
      (acc, record) => {
        acc.mmsa += record.mmsaYard || 0;
        acc.tanga += record.tangaYard || 0;
        acc.dar += record.darYard || 0;
        return acc;
      },
      { mmsa: 0, tanga: 0, dar: 0 }
    );

    // Get pending yard fuel
    const pendingYardFuel = await YardFuelDispense.countDocuments({
      status: 'pending',
      isDeleted: false,
    });

    const stats = {
      totalDOs,
      totalLPOs,
      totalFuelRecords,
      activeTrips,
      totalTonnage,
      totalLiters,
      totalRevenue,
      yardFuelSummary,
      pendingYardFuel,
      recentActivities: {
        deliveryOrders: recentDOs,
        lpoEntries: recentLPOs,
      },
    };

    res.status(200).json({
      success: true,
      message: 'Dashboard statistics retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get monthly statistics
 */
export const getMonthlyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year } = req.query;

    // This would need more sophisticated date filtering based on your date format
    const filter: any = { isDeleted: false };
    
    if (month) {
      filter.month = { $regex: month, $options: 'i' };
    }

    const fuelRecords = await FuelRecord.find(filter).lean();

    const monthlyStats = {
      totalRecords: fuelRecords.length,
      totalFuel: fuelRecords.reduce((sum, record) => sum + record.totalLts, 0),
      totalBalance: fuelRecords.reduce((sum, record) => sum + record.balance, 0),
      averageFuelPerTrip:
        fuelRecords.length > 0
          ? fuelRecords.reduce((sum, record) => sum + record.totalLts, 0) / fuelRecords.length
          : 0,
    };

    res.status(200).json({
      success: true,
      message: 'Monthly statistics retrieved successfully',
      data: monthlyStats,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get report statistics with detailed analytics
 */
export const getReportStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo, dateRange } = req.query;

    // Build date filter based on range or custom dates
    const dateFilter: any = { isDeleted: false };
    
    if (dateFrom || dateTo) {
      dateFilter.date = {};
      if (dateFrom) dateFilter.date.$gte = dateFrom;
      if (dateTo) dateFilter.date.$lte = dateTo;
    } else if (dateRange) {
      // Calculate date range based on preset
      const now = new Date();
      const startDate = new Date();
      
      switch (dateRange) {
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(now.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      dateFilter.date = { $gte: startDate.toISOString(), $lte: now.toISOString() };
    }

    // Fetch all necessary data
    const [deliveryOrders, fuelRecords, lpoEntries, yardFuelDispenses] = await Promise.all([
      DeliveryOrder.find(dateFilter).lean(),
      FuelRecord.find(dateFilter).lean(),
      LPOEntry.find(dateFilter).lean(),
      YardFuelDispense.find(dateFilter).lean(),
    ]);

    // Calculate fuel consumption by yard
    const fuelByYard: any = {
      'DAR YARD': 0,
      'TANGA YARD': 0,
      'MBEYA YARD': 0,
      'MMSA YARD': 0,
    };

    fuelRecords.forEach((record) => {
      fuelByYard['MMSA YARD'] += record.mmsaYard || 0;
      fuelByYard['TANGA YARD'] += record.tangaYard || 0;
      fuelByYard['DAR YARD'] += record.darYard || 0;
    });

    yardFuelDispenses.forEach((dispense) => {
      if (fuelByYard[dispense.yard] !== undefined) {
        fuelByYard[dispense.yard] += dispense.liters || 0;
      }
    });

    // Calculate fuel consumption by station
    const fuelByStation: any = {};
    lpoEntries.forEach((lpo) => {
      const station = lpo.dieselAt || 'Unknown';
      if (!fuelByStation[station]) {
        fuelByStation[station] = 0;
      }
      fuelByStation[station] += lpo.ltrs || 0;
    });

    // Sort stations by consumption and get top 5
    const stationEntries = Object.entries(fuelByStation)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 5);

    // Calculate financials
    const totalRevenue = deliveryOrders.reduce(
      (sum, DO) => sum + (DO.tonnages * DO.ratePerTon),
      0
    );

    const totalFuelCost = lpoEntries.reduce(
      (sum, lpo) => sum + (lpo.ltrs * lpo.pricePerLtr),
      0
    );

    const totalCost = totalFuelCost * 1.2; // Estimate total cost including other expenses
    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // Calculate operations metrics
    const totalTrips = deliveryOrders.length;
    const totalTrucks = new Set(deliveryOrders.map(DO => DO.truckNo)).size;
    const totalFuel = fuelRecords.reduce((sum, record) => sum + record.totalLts, 0);
    const averageFuelPerTrip = totalTrips > 0 ? totalFuel / totalTrips : 0;

    // Calculate on-time delivery (placeholder logic - would need actual arrival/expected dates)
    const onTimeDelivery = 92.5; // This would need proper calculation with actual data

    // Calculate monthly trends (last 5 months)
    const trends: Array<{ month: string; year: number; fuel: number; revenue: number }> = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData: any = {};

    // Group data by month
    fuelRecords.forEach((record) => {
      const date = new Date(record.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthNames[date.getMonth()],
          year: date.getFullYear(),
          fuel: 0,
          revenue: 0,
        };
      }
      
      monthlyData[monthKey].fuel += record.totalLts || 0;
    });

    deliveryOrders.forEach((DO) => {
      const date = new Date(DO.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].revenue += (DO.tonnages * DO.ratePerTon);
      }
    });

    // Get last 5 months
    const sortedMonths = Object.keys(monthlyData).sort().slice(-5);
    sortedMonths.forEach((key) => {
      trends.push(monthlyData[key]);
    });

    // Build report statistics
    const reportStats = {
      fuelConsumption: {
        total: totalFuel + yardFuelDispenses.reduce((sum, d) => sum + d.liters, 0),
        byYard: Object.entries(fuelByYard).map(([name, value]) => ({
          name,
          value,
        })),
        byStation: stationEntries.map(([name, value]) => ({
          name,
          value,
        })),
      },
      financials: {
        totalRevenue,
        totalCost,
        totalFuelCost,
        profit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
      },
      operations: {
        totalTrips,
        totalTrucks,
        averageFuelPerTrip: parseFloat(averageFuelPerTrip.toFixed(2)),
        onTimeDelivery,
      },
      trends,
    };

    res.status(200).json({
      success: true,
      message: 'Report statistics retrieved successfully',
      data: reportStats,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get health check
 */
export const healthCheck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      message: 'Server is healthy',
      data: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      },
    });
  } catch (error: any) {
    throw error;
  }
};
