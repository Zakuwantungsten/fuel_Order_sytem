import { Response } from 'express';
import { DeliveryOrder, LPOSummary, FuelRecord, YardFuelDispense, FuelPriceHistory } from '../models';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { AuthRequest } from '../middleware/auth';

/**
 * Convert a Date to "YYYY-MM-DD" string for querying String-typed date fields.
 * DeliveryOrder.date, FuelRecord.date, and LPOEntry.date are all stored as String.
 */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    // ─── Date helpers ───────────────────────────────────────────────────────
    const now = new Date();
    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    // Current calendar month boundaries
    const currMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Previous calendar month boundaries (for trend comparison)
    const prevMonthDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1);
    const prevMonthEnd   = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // Month name strings used by FuelRecord.month field ("February 2026")
    const currMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    const prevMonthLabel = `${MONTH_NAMES[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()}`;

    // ─── Per-model filters ──────────────────────────────────────────────────
    // DeliveryOrder.date is "YYYY-MM-DD" — safe for string $gte/$lte comparison.
    // FuelRecord.date is mixed formats; use the `month` field ("February 2026") instead.
    // LPOEntry.date is "DD-MMM" (no year!); use `actualDate` (proper Date) instead.

    // DeliveryOrder current-month filter
    let doDateFilter: any = { isDeleted: false };
    if (dateFrom || dateTo) {
      doDateFilter.date = {};
      if (dateFrom) doDateFilter.date.$gte = dateFrom as string;
      if (dateTo)   doDateFilter.date.$lte = dateTo as string;
    } else {
      doDateFilter.date = { $gte: toDateStr(currMonthStart), $lte: toDateStr(currMonthEnd) };
    }

    // FuelRecord current-month filter (month field)
    const frCurrFilter: any = { isDeleted: false, isCancelled: { $ne: true } };
    if (!dateFrom && !dateTo) {
      frCurrFilter.month = { $regex: `^${currMonthLabel}`, $options: 'i' };
    } else {
      // Fallback to date string for explicit date range requests
      frCurrFilter.date = {};
      if (dateFrom) frCurrFilter.date.$gte = dateFrom as string;
      if (dateTo)   frCurrFilter.date.$lte = dateTo as string;
    }

    // LPO date range filter — LPOSummary.date is YYYY-MM-DD, sortable as string
    const lpoDateFrom = dateFrom
      ? (dateFrom as string).substring(0, 10)
      : toDateStr(currMonthStart);
    const lpoDateTo = dateTo
      ? (dateTo as string).substring(0, 10)
      : toDateStr(currMonthEnd);
    const lpoCurrMatch: any = { isDeleted: false, date: { $gte: lpoDateFrom, $lte: lpoDateTo } };

    const prevLpoDateFrom = toDateStr(prevMonthStart);
    const prevLpoDateTo   = toDateStr(prevMonthEnd);
    const prevLPOMatch: any = { isDeleted: false, date: { $gte: prevLpoDateFrom, $lte: prevLpoDateTo } };

    // Trend filters (always previous calendar month, regardless of query params)
    const prevDOFilter:  any = { isDeleted: false, date: { $gte: toDateStr(prevMonthStart), $lte: toDateStr(prevMonthEnd) } };
    const prevFRFilter:  any = { isDeleted: false, isCancelled: { $ne: true }, month: { $regex: `^${prevMonthLabel}`, $options: 'i' } };

    // ─── Parallel queries ───────────────────────────────────────────────────
    // LPO entry aggregation helper — unwinds LPOSummary entries into a flat list
    const lpoEntryPipeline = (matchStage: any) => [
      { $match: matchStage },
      { $unwind: '$entries' },
      { $project: { _id: 0, ltrs: '$entries.liters', pricePerLtr: '$entries.rate', date: 1 } },
    ];

    const [
      totalDOs,
      lpoCountResult,
      totalFuelRecords,
      activeTrips,
      deliveryOrders,
      fuelRecords,
      lpoEntries,
      activeFuelRecords,
      yardDispenses,
      prevDOs,
      prevFuelRecords,
      prevLPOs,
    ] = await Promise.all([
      // All-time counts
      DeliveryOrder.countDocuments({ isDeleted: false }),
      LPOSummary.aggregate([
        { $match: { isDeleted: false } },
        { $project: { entryCount: { $size: '$entries' } } },
        { $group: { _id: null, total: { $sum: '$entryCount' } } },
      ]),
      FuelRecord.countDocuments({ isDeleted: false, isCancelled: { $ne: true } }),
      // Active trips
      FuelRecord.countDocuments({ isDeleted: false, isCancelled: { $ne: true }, journeyStatus: { $in: ['active', 'queued'] } }),
      // Current month / period data
      DeliveryOrder.find(doDateFilter).select('tonnages ratePerTon date').lean(),
      FuelRecord.find(frCurrFilter).select('totalLts mmsaYard tangaYard darYard date month').lean(),
      LPOSummary.aggregate(lpoEntryPipeline(lpoCurrMatch)),
      // Active fuel records for recent activity
      FuelRecord.find({ isDeleted: false, isCancelled: { $ne: true } })
        .sort({ date: -1 })
        .limit(5)
        .select('truckNo goingDo date journeyStatus totalLts')
        .lean(),
      // Yard fuel dispenses — grouped in the DB instead of loading every
      // dispense document into memory just to sum liters and count pending.
      YardFuelDispense.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: { $toUpper: { $ifNull: ['$yard', ''] } },
            liters: { $sum: { $ifNull: ['$liters', 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          },
        },
      ]),
      // Previous month data for trend calculation
      DeliveryOrder.find(prevDOFilter).select('tonnages date').lean(),
      FuelRecord.find(prevFRFilter).select('totalLts date month').lean(),
      LPOSummary.aggregate(lpoEntryPipeline(prevLPOMatch)),
    ]);

    const totalLPOs: number = lpoCountResult[0]?.total ?? 0;

    // Calculate totals from current period
    const totalTonnage = deliveryOrders.reduce((sum, DO) => sum + (DO.tonnages || 0), 0);
    
    const totalLiters = fuelRecords.reduce((sum, record) => sum + (record.totalLts || 0), 0);
    
    const totalRevenue = lpoEntries.reduce(
      (sum, lpo) => sum + ((lpo.ltrs || 0) * (lpo.pricePerLtr || 0)),
      0
    );

    // Calculate previous month totals for trend computation
    const prevTonnage = prevDOs.reduce((sum, DO) => sum + (DO.tonnages || 0), 0);

    const computeTrend = (curr: number, prev: number): number | null => {
      if (prev === 0) return null;
      return Math.round(((curr - prev) / prev) * 1000) / 10; // 1 decimal place
    };

    const trends = {
      dos: computeTrend(deliveryOrders.length, prevDOs.length),
      fuelRecords: computeTrend(fuelRecords.length, prevFuelRecords.length),
      lpos: computeTrend(lpoEntries.length, prevLPOs.length),
      tonnage: computeTrend(totalTonnage, prevTonnage),
    };

    // Get recent delivery orders
    const recentDOs = await DeliveryOrder.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('doNumber truckNo from to date createdAt tonnages importOrExport haulier')
      .lean();

    // Get recent LPOs — newest LPO docs, first entry per doc
    const recentLPOs = await LPOSummary.aggregate([
      { $match: { isDeleted: false } },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
      { $unwind: { path: '$entries', includeArrayIndex: 'ei' } },
      { $match: { ei: 0 } }, // first entry only
      {
        $project: {
          _id: 0,
          lpoNo: 1,
          truckNo: '$entries.truckNo',
          dieselAt: '$station',
          ltrs: '$entries.liters',
          date: 1,
          createdAt: 1,
          doSdo: { $ifNull: ['$entries.doNo', 'PENDING'] },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
    ]);

    // Get fuel summary by yard (all-time) — a single $group instead of
    // streaming every fuel record into Node just to add three fields.
    const [fuelYardTotals] = await FuelRecord.aggregate([
      { $match: { isDeleted: false, isCancelled: { $ne: true } } },
      {
        $group: {
          _id: null,
          mmsa: { $sum: { $ifNull: ['$mmsaYard', 0] } },
          tanga: { $sum: { $ifNull: ['$tangaYard', 0] } },
          dar: { $sum: { $ifNull: ['$darYard', 0] } },
        },
      },
    ]);

    const yardFuelSummary = {
      mmsa: fuelYardTotals?.mmsa || 0,
      tanga: fuelYardTotals?.tanga || 0,
      dar: fuelYardTotals?.dar || 0,
    };

    // Add yard dispenses (pre-grouped by uppercased yard name in the DB)
    // and tally pending dispenses in the same pass.
    let pendingYardFuel = 0;
    for (const group of yardDispenses as Array<{ _id: string; liters: number; pending: number }>) {
      pendingYardFuel += group.pending || 0;
      const yard = group._id;
      if (yard === 'MMSA YARD' || yard === 'MMSA') {
        yardFuelSummary.mmsa += group.liters || 0;
      } else if (yard === 'TANGA YARD' || yard === 'TANGA') {
        yardFuelSummary.tanga += group.liters || 0;
      } else if (yard === 'DAR YARD' || yard === 'DAR' || yard === 'DAR ES SALAAM') {
        yardFuelSummary.dar += group.liters || 0;
      }
    }

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
      trends,
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
      date: { $gte: toDateStr(startDate), $lte: toDateStr(now) }
    };

    // If specific month/year requested
    if (month && year) {
      const yearNum = parseInt(year as string, 10);
      const monthNum = parseInt(month as string, 10) - 1; // JS months are 0-indexed
      const monthStart = new Date(yearNum, monthNum, 1);
      const monthEnd = new Date(yearNum, monthNum + 1, 0);
      filter.date = { $gte: toDateStr(monthStart), $lte: toDateStr(monthEnd) };
    }

    const [fuelRecords, deliveryOrders, lpoEntries] = await Promise.all([
      FuelRecord.find(filter).select('date totalLts balance month journeyStatus').lean(),
      DeliveryOrder.find(filter).select('date doNumber tonnages').lean(),
      LPOSummary.aggregate([
        { $match: { isDeleted: false, date: filter.date } },
        { $unwind: '$entries' },
        { $project: { _id: 0, date: 1, ltrs: '$entries.liters', dieselAt: '$station' } },
      ]),
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
    // DeliveryOrder.date and FuelRecord.date are String fields — use string comparison.
    // LPOEntry uses actualDate (Date type) with createdAt as fallback for legacy records.
    const dateFilterStr = { $gte: toDateStr(startDate), $lte: toDateStr(endDate) };
    const dateFilterDate = { $gte: startDate, $lte: endDate };

    // Fetch all necessary data
    const [deliveryOrders, fuelRecords, lpoEntries, yardFuelDispenses] = await Promise.all([
      DeliveryOrder.find({ isDeleted: false, date: dateFilterStr })
        .select('date tonnages ratePerTon truckNo from to importOrExport')
        .lean(),
      FuelRecord.find({ isDeleted: false, isCancelled: { $ne: true }, date: dateFilterStr })
        .select('date totalLts mmsaYard tangaYard darYard truckNo journeyStatus balance')
        .lean(),
      LPOSummary.aggregate([
        { $match: { isDeleted: false, date: dateFilterStr } },
        { $unwind: '$entries' },
        {
          $project: {
            _id: 0,
            date: 1,
            ltrs: '$entries.liters',
            pricePerLtr: '$entries.rate',
            dieselAt: '$station',
            truckNo: '$entries.truckNo',
          },
        },
      ]),
      YardFuelDispense.find({ isDeleted: false, createdAt: dateFilterDate })
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

    // Group LPO data by month
    lpoEntries.forEach((lpo) => {
      const date = new Date((lpo as any).date || (lpo as any).createdAt);
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

    const [fuelRecords, deliveryOrders, lpoEntries, activeStations] = await Promise.all([
      FuelRecord.find({
        isDeleted: false,
        isCancelled: { $ne: true },
        date: { $gte: toDateStr(fuelStartDate), $lte: toDateStr(now) },
      })
        .select('date totalLts journeyStatus')
        .lean(),
      DeliveryOrder.find({
        isDeleted: false,
        date: { $gte: toDateStr(doStartDate), $lte: toDateStr(doEndDate) },
      })
        .select('date doNumber')
        .lean(),
      LPOSummary.aggregate([
        {
          $match: {
            isDeleted: false,
            date: { $gte: toDateStr(lpoStartDate), $lte: toDateStr(now) },
          },
        },
        { $unwind: '$entries' },
        { $project: { _id: 0, date: 1, ltrs: '$entries.liters', dieselAt: '$station' } },
      ]),
      // Current fuel price per litre for every active station (for the dashboard price chart)
      FuelStationConfig.find({ isActive: true })
        .select('stationName defaultRate currency')
        .sort({ currency: 1, stationName: 1 })
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

    // Fuel price per litre — one entry per active station, with its currency.
    // Stations are priced in different currencies (USD for Zambia, TZS for
    // Tanzania), so the frontend groups/normalises per currency rather than
    // plotting raw values on a single shared axis.
    const stationPrices = (activeStations as any[]).map((s) => ({
      name: s.stationName,
      price: s.defaultRate,
      currency: (s.currency || 'TZS') as 'USD' | 'TZS',
    }));

    // ── Fuel price trend — 6-month price-per-litre history, one line per currency.
    // Reconstructs each station's effective price at each month-end from
    // FuelPriceHistory, then averages across stations sharing a currency.
    const MONTHS_BACK = 6;
    const priceHistory = await FuelPriceHistory.find({})
      .select('stationId oldPrice newPrice changedAt')
      .sort({ changedAt: 1 })
      .lean();

    const histByStation: Record<string, any[]> = {};
    for (const h of priceHistory) {
      const sid = String(h.stationId);
      (histByStation[sid] = histByStation[sid] || []).push(h);
    }

    // Effective price for a station at a point in time.
    const effectivePrice = (station: any, at: Date): number => {
      const list = histByStation[String(station._id)];
      if (list && list.length) {
        let price: number | undefined;
        for (const h of list) {
          if (new Date(h.changedAt) <= at) price = h.newPrice;
          else break;
        }
        if (price !== undefined) return price;
        return list[0].oldPrice; // price as it stood before the first recorded change
      }
      return station.defaultRate;
    };

    // Month-end boundaries for the last MONTHS_BACK months (oldest → newest).
    const boundaries: { label: string; at: Date }[] = [];
    for (let i = MONTHS_BACK - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const at = i === 0 ? now : new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      boundaries.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), at });
    }

    const stationsByCurrency: Record<string, any[]> = {};
    for (const s of activeStations as any[]) {
      const cur = s.currency || 'TZS';
      (stationsByCurrency[cur] = stationsByCurrency[cur] || []).push(s);
    }

    const roundFor = (cur: string, v: number) => (cur === 'USD' ? Math.round(v * 100) / 100 : Math.round(v));

    const fuelPriceTrend = Object.entries(stationsByCurrency)
      .map(([currency, sts]) => {
        const series = boundaries.map((b) => {
          const vals = sts.map((s) => effectivePrice(s, b.at)).filter((v) => typeof v === 'number' && v > 0);
          const avg = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0;
          return { month: b.label, value: roundFor(currency, avg) };
        });
        const nonZero = series.map((p) => p.value).filter((v) => v > 0);
        const current = series[series.length - 1]?.value || 0;
        const previous = series[series.length - 2]?.value || 0;
        const prevLabel = boundaries[boundaries.length - 2]?.label || '';
        const trendPct = previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
        const average = nonZero.length ? roundFor(currency, nonZero.reduce((a, v) => a + v, 0) / nonZero.length) : 0;
        return {
          currency,
          stations: sts.length,
          series,
          current,
          previous,
          prevLabel,
          trendPct,
          lowest: nonZero.length ? Math.min(...nonZero) : 0,
          highest: nonZero.length ? Math.max(...nonZero) : 0,
          average,
        };
      })
      .sort((a, b) => (a.currency === 'USD' ? -1 : b.currency === 'USD' ? 1 : a.currency.localeCompare(b.currency)));

    const chartData = {
      monthlyFuel,
      doTrends,
      stationDistribution,
      journeyStatus,
      stationPrices,
      fuelPriceTrend,
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

/**
 * Get officer-scoped dashboard stats for import_officer and export_officer roles.
 * Filters all delivery order data by the officer's import/export type.
 */
export const getOfficerStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = (req.user as any)?.role || '';
    const ioType = role === 'import_officer' ? 'IMPORT' : 'EXPORT';

    const now = new Date();
    const currStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const baseFilter = { isDeleted: false, importOrExport: ioType };
    const currFilter = { ...baseFilter, date: { $gte: toDateStr(currStart), $lte: toDateStr(currEnd) } };
    const prevFilter = { ...baseFilter, date: { $gte: toDateStr(prevStart), $lte: toDateStr(prevEnd) } };

    // Current month aggregation
    const [currDOs, prevDOs, recentDOs] = await Promise.all([
      DeliveryOrder.aggregate([
        { $match: currFilter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 0, 1] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 1, 0] } },
            doCount: { $sum: { $cond: [{ $eq: ['$doType', 'DO'] }, 1, 0] } },
            sdoCount: { $sum: { $cond: [{ $eq: ['$doType', 'SDO'] }, 1, 0] } },
            tonnage: { $sum: { $toDouble: '$tonnages' } },
          },
        },
      ]),
      DeliveryOrder.aggregate([
        { $match: prevFilter },
        { $group: { _id: null, total: { $sum: 1 }, tonnage: { $sum: { $toDouble: '$tonnages' } } } },
      ]),
      DeliveryOrder.find(baseFilter)
        .sort({ date: -1, createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const curr = currDOs[0] || { total: 0, active: 0, cancelled: 0, doCount: 0, sdoCount: 0, tonnage: 0 };
    const prev = prevDOs[0] || { total: 0, tonnage: 0 };

    const pct = (a: number, b: number) =>
      b === 0 ? null : Math.round(((a - b) / b) * 100);

    // Monthly trend — last 6 months (active + cancelled + tonnage per month for sparklines)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyTrend = await DeliveryOrder.aggregate([
      { $match: { ...baseFilter, date: { $gte: toDateStr(sixMonthsAgo) } } },
      {
        $group: {
          _id: { $substr: ['$date', 0, 7] },
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 0, 1] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 1, 0] } },
          tonnage: { $sum: { $toDouble: '$tonnages' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthlyTrendFormatted = monthlyTrend.map((m: any) => {
      const [y, mo] = (m._id as string).split('-').map(Number);
      return {
        month: `${MONTH_SHORT[mo - 1]} ${y}`,
        count: m.count,
        active: m.active,
        cancelled: m.cancelled,
        tonnage: Math.round(m.tonnage),
      };
    });

    // Top 5 locations — destination for export, loadingPoint for import
    // Includes tonnage for the table view
    const locationField = ioType === 'EXPORT' ? '$destination' : '$loadingPoint';
    const topLocations = await DeliveryOrder.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: locationField,
          count: { $sum: 1 },
          tonnage: { $sum: { $toDouble: '$tonnages' } },
          active: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 0, 1] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 1, 0] } },
        },
      },
      { $match: { _id: { $nin: [null, ''] } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          name: '$_id',
          count: 1,
          tonnage: { $round: ['$tonnage', 0] },
          active: 1,
          cancelled: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        ioType,
        monthStats: {
          totalDOs: curr.total,
          activeDOs: curr.active,
          cancelledDOs: curr.cancelled,
          doCount: curr.doCount,
          sdoCount: curr.sdoCount,
          totalTonnage: Math.round(curr.tonnage),
          trends: {
            totalDOs: pct(curr.total, prev.total),
            tonnage: pct(curr.tonnage, prev.tonnage),
          },
        },
        monthlyTrend: monthlyTrendFormatted,
        topLocations,
        recentDOs,
      },
    });
  } catch (error: any) {
    console.error('Officer stats error:', error);
    throw error;
  }
};
