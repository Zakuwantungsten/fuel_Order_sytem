import { Response } from 'express';
import { DeliveryOrder, LPOEntry, FuelRecord, YardFuelDispense } from '../models';
import { AuthRequest } from '../middleware/auth';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    // Build date filter - default to current month if no dates provided
    const dateFilter: any = { isDeleted: false };
    
    // If specific dates provided, use them
    if (dateFrom || dateTo) {
      dateFilter.date = {};
      if (dateFrom) {
        dateFilter.date.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        dateFilter.date.$lte = new Date(dateTo as string);
      }
    } else {
      // Default to current month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      dateFilter.date = { $gte: firstDayOfMonth, $lte: lastDayOfMonth };
    }

    // Build filter for all-time data (for total counts)
    const allTimeFilter = { isDeleted: false };

    // Get counts and aggregations in parallel
    const [
      totalDOs,
      totalLPOs,
      totalFuelRecords,
      activeTrips,
      deliveryOrders,
      fuelRecords,
      lpoEntries,
      activeFuelRecords,
      yardDispenses,
    ] = await Promise.all([
      // All-time counts
      DeliveryOrder.countDocuments({ isDeleted: false }),
      LPOEntry.countDocuments({ isDeleted: false }),
      FuelRecord.countDocuments({ 
        isDeleted: false,
        isCancelled: { $ne: true }
      }),
      // Active trips (fuel records with active or queued status)
      FuelRecord.countDocuments({
        isDeleted: false,
        isCancelled: { $ne: true },
        journeyStatus: { $in: ['active', 'queued'] }
      }),
      // Data for calculations (current month/period)
      DeliveryOrder.find(dateFilter).select('tonnages ratePerTon date').lean(),
      FuelRecord.find(dateFilter).select('totalLts mmsaYard tangaYard darYard date').lean(),
      LPOEntry.find(dateFilter).select('ltrs pricePerLtr date').lean(),
      // Active fuel records for recent activity
      FuelRecord.find({ 
        isDeleted: false, 
        isCancelled: { $ne: true }
      })
        .sort({ date: -1 })
        .limit(5)
        .select('truckNo goingDo date journeyStatus totalLts')
        .lean(),
      // Yard fuel dispenses
      YardFuelDispense.find({ isDeleted: false })
        .select('liters yard status')
        .lean(),
    ]);

    // Calculate totals from current period
    const totalTonnage = deliveryOrders.reduce((sum, DO) => sum + (DO.tonnages || 0), 0);
    
    const totalLiters = fuelRecords.reduce((sum, record) => sum + (record.totalLts || 0), 0);
    
    const totalRevenue = lpoEntries.reduce(
      (sum, lpo) => sum + ((lpo.ltrs || 0) * (lpo.pricePerLtr || 0)),
      0
    );

    // Get recent delivery orders
    const recentDOs = await DeliveryOrder.find({ isDeleted: false })
      .sort({ date: -1 })
      .limit(5)
      .select('doNumber truckNo from to date tonnages importOrExport')
      .lean();

    // Get recent LPOs
    const recentLPOs = await LPOEntry.find({ isDeleted: false })
      .sort({ date: -1 })
      .limit(5)
      .select('lpoNo truckNo dieselAt ltrs date')
      .lean();

    // Get fuel summary by yard (all-time)
    const allFuelRecords = await FuelRecord.find({ 
      isDeleted: false,
      isCancelled: { $ne: true }
    }).select('mmsaYard tangaYard darYard').lean();

    const yardFuelSummary = allFuelRecords.reduce(
      (acc, record) => {
        acc.mmsa += record.mmsaYard || 0;
        acc.tanga += record.tangaYard || 0;
        acc.dar += record.darYard || 0;
        return acc;
      },
      { mmsa: 0, tanga: 0, dar: 0 }
    );

    // Add yard dispenses to yard fuel summary
    yardDispenses.forEach((dispense) => {
      const yard = dispense.yard?.toUpperCase();
      if (yard === 'MMSA YARD' || yard === 'MMSA') {
        yardFuelSummary.mmsa += dispense.liters || 0;
      } else if (yard === 'TANGA YARD' || yard === 'TANGA') {
        yardFuelSummary.tanga += dispense.liters || 0;
      } else if (yard === 'DAR YARD' || yard === 'DAR' || yard === 'DAR ES SALAAM') {
        yardFuelSummary.dar += dispense.liters || 0;
      }
    });

    // Get pending yard fuel
    const pendingYardFuel = yardDispenses.filter(
      (d) => d.status === 'pending'
    ).length;

    const stats = {
      totalDOs,
      totalLPOs,
      totalFuelRecords,
      activeTrips,
      totalTonnage: Math.round(totalTonnage),
      totalLiters: Math.round(totalLiters),
      totalRevenue: Math.round(totalRevenue),
      yardFuelSummary: {
        mmsa: Math.round(yardFuelSummary.mmsa),
        tanga: Math.round(yardFuelSummary.tanga),
        dar: Math.round(yardFuelSummary.dar),
      },
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
    console.error('Dashboard stats error:', error);
    throw error;
  }
};

/**
 * Get monthly statistics
 */
export const getMonthlyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year, months = 6 } = req.query;

    // Calculate date range for the requested months
    const now = new Date();
    const startDate = new Date();
    startDate.setMonth(now.getMonth() - parseInt(months as string, 10));
    
    const filter: any = { 
      isDeleted: false,
      date: { $gte: startDate, $lte: now }
    };

    // If specific month/year requested
    if (month && year) {
      const yearNum = parseInt(year as string, 10);
      const monthNum = parseInt(month as string, 10) - 1; // JS months are 0-indexed
      const monthStart = new Date(yearNum, monthNum, 1);
      const monthEnd = new Date(yearNum, monthNum + 1, 0, 23, 59, 59);
      filter.date = { $gte: monthStart, $lte: monthEnd };
    }

    const [fuelRecords, deliveryOrders, lpoEntries] = await Promise.all([
      FuelRecord.find(filter).select('date totalLts balance month journeyStatus').lean(),
      DeliveryOrder.find(filter).select('date doNumber tonnages').lean(),
      LPOEntry.find(filter).select('date ltrs dieselAt').lean(),
    ]);

    // Group data by month
    const monthlyData: any = {};

    fuelRecords.forEach((record) => {
      const date = new Date(record.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          month: monthName,
          totalFuel: 0,
          totalBalance: 0,
          recordCount: 0,
          doCount: 0,
          lpoCount: 0,
          tonnage: 0,
          activeJourneys: 0,
          completedJourneys: 0,
        };
      }
      
      monthlyData[key].totalFuel += record.totalLts || 0;
      monthlyData[key].totalBalance += record.balance || 0;
      monthlyData[key].recordCount += 1;
      
      if (record.journeyStatus === 'active') monthlyData[key].activeJourneys += 1;
      if (record.journeyStatus === 'completed') monthlyData[key].completedJourneys += 1;
    });

    deliveryOrders.forEach((DO) => {
      const date = new Date(DO.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          month: monthName,
          totalFuel: 0,
          totalBalance: 0,
          recordCount: 0,
          doCount: 0,
          lpoCount: 0,
          tonnage: 0,
          activeJourneys: 0,
          completedJourneys: 0,
        };
      }
      
      monthlyData[key].doCount += 1;
      monthlyData[key].tonnage += DO.tonnages || 0;
    });

    lpoEntries.forEach((lpo) => {
      const date = new Date(lpo.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          month: monthName,
          totalFuel: 0,
          totalBalance: 0,
          recordCount: 0,
          doCount: 0,
          lpoCount: 0,
          tonnage: 0,
          activeJourneys: 0,
          completedJourneys: 0,
        };
      }
      
      monthlyData[key].lpoCount += 1;
    });

    // Convert to array and sort by date
    const monthlyStats = Object.keys(monthlyData)
      .sort()
      .map((key) => ({
        ...monthlyData[key],
        averageFuelPerTrip: monthlyData[key].recordCount > 0
          ? Math.round(monthlyData[key].totalFuel / monthlyData[key].recordCount)
          : 0,
        totalFuel: Math.round(monthlyData[key].totalFuel),
        totalBalance: Math.round(monthlyData[key].totalBalance),
        tonnage: Math.round(monthlyData[key].tonnage),
      }));

    res.status(200).json({
      success: true,
      message: 'Monthly statistics retrieved successfully',
      data: monthlyStats,
    });
  } catch (error: any) {
    console.error('Monthly stats error:', error);
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
    let startDate = new Date();
    let endDate = new Date();
    
    if (dateFrom && dateTo) {
      // Use custom date range
      startDate = new Date(dateFrom as string);
      endDate = new Date(dateTo as string);
    } else if (dateRange) {
      // Calculate date range based on preset
      switch (dateRange) {
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          // Default to last 6 months
          startDate.setMonth(endDate.getMonth() - 6);
      }
    } else {
      // Default to last 6 months
      startDate.setMonth(endDate.getMonth() - 6);
    }

    // Use actual date fields so imported historical data shows in the correct period.
    // DeliveryOrder.date and FuelRecord.date are proper Date fields.
    // LPOEntry uses actualDate (set by import pipeline) with createdAt as fallback
    // for any legacy records that pre-date the actualDate field.
    const dateFilter = { $gte: startDate, $lte: endDate };

    // Fetch all necessary data
    const [deliveryOrders, fuelRecords, lpoEntries, yardFuelDispenses] = await Promise.all([
      DeliveryOrder.find({ isDeleted: false, date: dateFilter })
        .select('date tonnages ratePerTon truckNo from to importOrExport')
        .lean(),
      FuelRecord.find({ isDeleted: false, isCancelled: { $ne: true }, date: dateFilter })
        .select('date totalLts mmsaYard tangaYard darYard truckNo journeyStatus balance')
        .lean(),
      LPOEntry.find({
        isDeleted: false,
        $or: [
          { actualDate: dateFilter },
          { actualDate: { $exists: false }, createdAt: dateFilter },
        ],
      })
        .select('date actualDate ltrs pricePerLtr dieselAt truckNo')
        .lean(),
      YardFuelDispense.find({ isDeleted: false, createdAt: dateFilter })
        .select('date liters yard status')
        .lean(),
    ]);

    // Calculate fuel consumption by yard
    const fuelByYard: any = {
      'MMSA YARD': 0,
      'TANGA YARD': 0,
      'DAR YARD': 0,
    };

    fuelRecords.forEach((record) => {
      fuelByYard['MMSA YARD'] += record.mmsaYard || 0;
      fuelByYard['TANGA YARD'] += record.tangaYard || 0;
      fuelByYard['DAR YARD'] += record.darYard || 0;
    });

    yardFuelDispenses.forEach((dispense) => {
      const yard = dispense.yard?.toUpperCase();
      if (yard?.includes('MMSA')) {
        fuelByYard['MMSA YARD'] += dispense.liters || 0;
      } else if (yard?.includes('TANGA')) {
        fuelByYard['TANGA YARD'] += dispense.liters || 0;
      } else if (yard?.includes('DAR')) {
        fuelByYard['DAR YARD'] += dispense.liters || 0;
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

    // Sort stations by consumption and get top 10
    const stationEntries = Object.entries(fuelByStation)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 10);

    // Calculate financials
    const totalRevenue = deliveryOrders.reduce(
      (sum, DO) => sum + ((DO.tonnages || 0) * (DO.ratePerTon || 0)),
      0
    );

    const totalFuelCost = lpoEntries.reduce(
      (sum, lpo) => sum + ((lpo.ltrs || 0) * (lpo.pricePerLtr || 0)),
      0
    );

    // Estimate total cost (fuel cost + 20% for other expenses)
    const totalCost = totalFuelCost * 1.2;
    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // Calculate operations metrics
    const totalTrips = deliveryOrders.length;
    const totalTrucks = new Set(deliveryOrders.map(DO => DO.truckNo)).size;
    const totalFuel = fuelRecords.reduce((sum, record) => sum + (record.totalLts || 0), 0);
    const averageFuelPerTrip = totalTrips > 0 ? totalFuel / totalTrips : 0;

    // Calculate journey status distribution
    const journeyStatusCounts = {
      active: fuelRecords.filter(r => r.journeyStatus === 'active').length,
      queued: fuelRecords.filter(r => r.journeyStatus === 'queued').length,
      completed: fuelRecords.filter(r => r.journeyStatus === 'completed').length,
    };

    // Calculate on-time delivery (estimate based on completed journeys)
    const completedJourneys = journeyStatusCounts.completed;
    const totalJourneys = fuelRecords.length;
    const onTimeDelivery = totalJourneys > 0 
      ? (completedJourneys / totalJourneys) * 100 
      : 0;

    // Calculate monthly trends
    const trends: Array<{ 
      month: string; 
      year: number; 
      fuel: number; 
      revenue: number;
      dos: number;
      lpos: number;
    }> = [];
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData: any = {};

    // Group fuel data by month — use actual date field
    fuelRecords.forEach((record) => {
      const date = record.date ? new Date(record.date) : new Date((record as any).createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthNames[date.getMonth()],
          year: date.getFullYear(),
          fuel: 0,
          revenue: 0,
          dos: 0,
          lpos: 0,
        };
      }
      
      monthlyData[monthKey].fuel += record.totalLts || 0;
    });

    // Group DO data by month — use actual date field
    deliveryOrders.forEach((DO) => {
      const date = DO.date && !isNaN(new Date(DO.date).getTime())
        ? new Date(DO.date)
        : new Date((DO as any).createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthNames[date.getMonth()],
          year: date.getFullYear(),
          fuel: 0,
          revenue: 0,
          dos: 0,
          lpos: 0,
        };
      }
      monthlyData[monthKey].revenue += (DO.tonnages || 0) * (DO.ratePerTon || 0);
      monthlyData[monthKey].dos += 1;
    });

    // Group LPO data by month — prefer actualDate, fall back to createdAt for legacy records
    lpoEntries.forEach((lpo) => {
      const date = (lpo as any).actualDate
        ? new Date((lpo as any).actualDate)
        : new Date((lpo as any).createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthNames[date.getMonth()],
          year: date.getFullYear(),
          fuel: 0,
          revenue: 0,
          dos: 0,
          lpos: 0,
        };
      }
      monthlyData[monthKey].lpos += 1;
    });

    // Convert to sorted array
    const sortedMonths = Object.keys(monthlyData).sort();
    sortedMonths.forEach((key) => {
      trends.push({
        ...monthlyData[key],
        fuel: Math.round(monthlyData[key].fuel),
        revenue: Math.round(monthlyData[key].revenue),
      });
    });

    // Build report statistics
    const reportStats = {
      fuelConsumption: {
        total: Math.round(totalFuel + yardFuelDispenses.reduce((sum, d) => sum + (d.liters || 0), 0)),
        byYard: Object.entries(fuelByYard).map(([name, value]) => ({
          name,
          value: Math.round(value as number),
        })),
        byStation: stationEntries.map(([name, value]) => ({
          name,
          value: Math.round(value as number),
        })),
      },
      financials: {
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        totalFuelCost: Math.round(totalFuelCost),
        profit: Math.round(profit),
        profitMargin: parseFloat(profitMargin.toFixed(2)),
      },
      operations: {
        totalTrips,
        totalTrucks,
        totalFuelRecords: fuelRecords.length,
        averageFuelPerTrip: Math.round(averageFuelPerTrip),
        onTimeDelivery: parseFloat(onTimeDelivery.toFixed(2)),
        journeyStatus: journeyStatusCounts,
      },
      trends,
    };

    res.status(200).json({
      success: true,
      message: 'Report statistics retrieved successfully',
      data: reportStats,
    });
  } catch (error: any) {
    console.error('Report stats error:', error);
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

/**
 * Get chart data for dashboard visualizations
 */
export const getChartData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Calculate specific date ranges for each chart type
    const now = new Date();
    
    // For LPO charts: Last 1 month
    const lpoStartDate = new Date();
    lpoStartDate.setMonth(now.getMonth() - 1);
    
    // For DO charts: Current year (Jan 1 - Dec 31, 2026)
    const doStartDate = new Date(now.getFullYear(), 0, 1); // Jan 1
    const doEndDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59); // Dec 31
    
    // For Fuel Consumption: Last 12 months (rolling year)
    const fuelStartDate = new Date();
    fuelStartDate.setMonth(now.getMonth() - 12);

    // Use actual date fields for correct historical bucketing.
    // FuelRecord.date and DeliveryOrder.date are proper Date fields.
    // LPOEntry uses actualDate (set inline by import) with createdAt fallback for legacy records.
    const [fuelRecords, deliveryOrders, lpoEntries] = await Promise.all([
      FuelRecord.find({
        isDeleted: false,
        isCancelled: { $ne: true },
        date: { $gte: fuelStartDate, $lte: now },
      })
        .select('date totalLts journeyStatus')
        .lean(),
      DeliveryOrder.find({
        isDeleted: false,
        date: { $gte: doStartDate, $lte: doEndDate },
      })
        .select('date doNumber')
        .lean(),
      LPOEntry.find({
        isDeleted: false,
        $or: [
          { actualDate: { $gte: lpoStartDate, $lte: now } },
          { actualDate: { $exists: false }, createdAt: { $gte: lpoStartDate, $lte: now } },
        ],
      })
        .select('date actualDate ltrs dieselAt')
        .lean(),
    ]);

    // Monthly fuel consumption — use actual date field
    const monthlyFuelData: any = {};
    fuelRecords.forEach((record) => {
      const recordDate = record.date ? new Date(record.date) : new Date((record as any).createdAt);
      const month = recordDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthlyFuelData[month]) monthlyFuelData[month] = 0;
      monthlyFuelData[month] += record.totalLts || 0;
    });

    const monthlyFuel = Object.entries(monthlyFuelData)
      .map(([month, value]) => ({ month, value: Math.round(value as number) }));

    // DO trends — use actual date field
    const doTrendsData: any = {};
    deliveryOrders.forEach((DO) => {
      const doDate = DO.date && !isNaN(new Date(DO.date).getTime())
        ? new Date(DO.date)
        : new Date((DO as any).createdAt);
      const month = doDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      doTrendsData[month] = (doTrendsData[month] || 0) + 1;
    });

    const doTrends = Object.entries(doTrendsData)
      .map(([month, count]) => ({ month, count }));

    // Station distribution
    const stationData: any = {};
    lpoEntries.forEach((lpo) => {
      const station = lpo.dieselAt || 'Unknown';
      stationData[station] = (stationData[station] || 0) + (lpo.ltrs || 0);
    });
    
    const stationDistribution = Object.entries(stationData)
      .map(([name, value]) => ({ name, value: Math.round(value as number) }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 6);

    // Journey status
    const journeyStatus = [
      { 
        name: 'Active', 
        value: fuelRecords.filter(f => f.journeyStatus === 'active').length 
      },
      { 
        name: 'Completed', 
        value: fuelRecords.filter(f => f.journeyStatus === 'completed').length 
      },
      { 
        name: 'Queued', 
        value: fuelRecords.filter(f => f.journeyStatus === 'queued').length 
      }
    ].filter(item => item.value > 0);

    const chartData = {
      monthlyFuel,
      doTrends,
      stationDistribution,
      journeyStatus,
    };

    res.status(200).json({
      success: true,
      message: 'Chart data retrieved successfully',
      data: chartData,
    });
  } catch (error: any) {
    console.error('Chart data error:', error);
    throw error;
  }
};

/**
 * Get journey queue statistics
 */
export const getJourneyQueueStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const queuedJourneys = await FuelRecord.find({
      isDeleted: false,
      isCancelled: { $ne: true },
      journeyStatus: 'queued',
    })
      .select('truckNo goingDo queueOrder estimatedStartDate')
      .sort({ queueOrder: 1 })
      .limit(20)
      .lean();

    const activeJourneys = await FuelRecord.find({
      isDeleted: false,
      isCancelled: { $ne: true },
      journeyStatus: 'active',
    })
      .select('truckNo goingDo activatedAt')
      .lean();

    const completedToday = await FuelRecord.countDocuments({
      isDeleted: false,
      journeyStatus: 'completed',
      completedAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Journey queue statistics retrieved successfully',
      data: {
        queuedCount: queuedJourneys.length,
        activeCount: activeJourneys.length,
        completedToday,
        queuedJourneys,
        activeJourneys,
      },
    });
  } catch (error: any) {
    console.error('Journey queue stats error:', error);
    throw error;
  }
};
