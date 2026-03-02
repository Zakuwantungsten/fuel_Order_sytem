import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SystemConfig } from '../models/SystemConfig';
import { FuelPriceHistory, FuelPriceSchedule } from '../models/FuelPrice';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';
import { emitDataChange } from '../services/websocket';

const DEFAULT_FUEL_STATIONS = [
  { id: 'lake_ndola', name: 'LAKE NDOLA', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'lake_kapiri', name: 'LAKE KAPIRI', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'cash', name: 'CASH', location: 'Zambia', pricePerLiter: 1450, isActive: true },
];

async function getConfig() {
  let config = await SystemConfig.findOne({ configType: 'fuel_stations', isDeleted: false });
  if (!config) {
    config = await SystemConfig.create({
      configType: 'fuel_stations',
      fuelStations: DEFAULT_FUEL_STATIONS,
      lastUpdatedBy: 'system',
    });
  }
  return config;
}

/**
 * GET /api/v1/system-admin/fuel-prices/history
 * Price change history with optional filters.
 */
export const getPriceHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stationId = req.query.stationId as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, parseInt(req.query.limit as string) || 50);

    const filter: Record<string, any> = {};
    if (stationId) filter.stationId = stationId;

    const [data, total] = await Promise.all([
      FuelPriceHistory.find(filter)
        .sort({ changedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      FuelPriceHistory.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error('getPriceHistory error:', err);
    throw new ApiError(500, 'Failed to fetch price history');
  }
};

/**
 * POST /api/v1/system-admin/fuel-prices/update
 * Update the price for a station immediately, recording history.
 */
export const updatePrice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId, newPrice, reason } = req.body;
    if (!stationId || typeof newPrice !== 'number' || newPrice <= 0) {
      throw new ApiError(400, 'stationId and a positive newPrice are required');
    }

    const config = await getConfig();
    const stationIdx = config.fuelStations?.findIndex((s) => s.id === stationId);
    if (stationIdx === undefined || stationIdx === -1) throw new ApiError(404, 'Station not found');

    const station = config.fuelStations![stationIdx];
    const oldPrice = station.pricePerLiter;

    if (oldPrice === newPrice) {
      throw new ApiError(400, 'New price is the same as the current price');
    }

    // Record history entry
    await FuelPriceHistory.create({
      stationId,
      stationName: station.name,
      oldPrice,
      newPrice,
      changedBy: req.user?.username || 'system',
      changedAt: new Date(),
      reason: reason?.trim() || undefined,
    });

    // Update the live config
    config.fuelStations![stationIdx].pricePerLiter = newPrice;
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();
    emitDataChange('fuel_stations', 'update');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'fuel_station_price',
      resourceId: stationId,
      userId: req.user?.userId || '',
      username: req.user?.username || '',
      previousValue: { pricePerLiter: oldPrice },
      newValue: { pricePerLiter: newPrice },
      details: `Fuel price updated for ${station.name}: ${oldPrice} → ${newPrice}${reason ? ` (${reason})` : ''}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    logger.info(`Fuel price for ${stationId} updated: ${oldPrice} → ${newPrice} by ${req.user?.username}`);
    res.status(200).json({ success: true, data: { stationId, stationName: station.name, oldPrice, newPrice } });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updatePrice error:', err);
    throw new ApiError(500, 'Failed to update fuel price');
  }
};

/**
 * GET /api/v1/system-admin/fuel-prices/schedules
 * All pending (non-applied, non-cancelled) price schedules.
 */
export const getSchedules = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const includeApplied = req.query.includeApplied === 'true';
    const filter: Record<string, any> = { isCancelled: false };
    if (!includeApplied) filter.isApplied = false;

    const schedules = await FuelPriceSchedule.find(filter).sort({ effectiveAt: 1 });
    res.status(200).json({ success: true, data: schedules });
  } catch (err) {
    logger.error('getSchedules error:', err);
    throw new ApiError(500, 'Failed to fetch schedules');
  }
};

/**
 * POST /api/v1/system-admin/fuel-prices/schedules
 * Schedule a future price change.
 */
export const createSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId, newPrice, effectiveAt, reason } = req.body;
    if (!stationId || typeof newPrice !== 'number' || newPrice <= 0 || !effectiveAt) {
      throw new ApiError(400, 'stationId, newPrice, and effectiveAt are required');
    }
    const effectiveDate = new Date(effectiveAt);
    if (effectiveDate <= new Date()) {
      throw new ApiError(400, 'effectiveAt must be a future date — use the update endpoint for immediate changes');
    }

    const config = await getConfig();
    const station = config.fuelStations?.find((s) => s.id === stationId);
    if (!station) throw new ApiError(404, 'Station not found');

    const schedule = await FuelPriceSchedule.create({
      stationId,
      stationName: station.name,
      currentPrice: station.pricePerLiter,
      newPrice,
      effectiveAt: effectiveDate,
      createdBy: req.user?.username || 'system',
      reason: reason?.trim() || undefined,
    });

    logger.info(`Fuel price schedule created for ${stationId}: ${newPrice} at ${effectiveDate.toISOString()} by ${req.user?.username}`);
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('createSchedule error:', err);
    throw new ApiError(500, 'Failed to create schedule');
  }
};

/**
 * DELETE /api/v1/system-admin/fuel-prices/schedules/:id
 * Cancel a pending schedule.
 */
export const cancelSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schedule = await FuelPriceSchedule.findById(req.params.id);
    if (!schedule) throw new ApiError(404, 'Schedule not found');
    if (schedule.isApplied) throw new ApiError(400, 'Cannot cancel an already-applied schedule');
    if (schedule.isCancelled) throw new ApiError(400, 'Schedule is already cancelled');

    schedule.isCancelled = true;
    schedule.cancelledAt = new Date();
    await schedule.save();

    res.status(200).json({ success: true, message: 'Schedule cancelled' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('cancelSchedule error:', err);
    throw new ApiError(500, 'Failed to cancel schedule');
  }
};

/**
 * POST /api/v1/system-admin/fuel-prices/schedules/apply-due
 * Internal: apply all due schedules (called by a cron job or manually).
 * Returns a summary of what was applied.
 */
export const applyDueSchedules = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const dueSchedules = await FuelPriceSchedule.find({
      isApplied: false,
      isCancelled: false,
      effectiveAt: { $lte: now },
    });

    if (dueSchedules.length === 0) {
      res.status(200).json({ success: true, message: 'No due schedules', applied: 0 });
      return;
    }

    const config = await getConfig();
    const applied: string[] = [];

    for (const schedule of dueSchedules) {
      const stationIdx = config.fuelStations?.findIndex((s) => s.id === schedule.stationId);
      if (stationIdx === undefined || stationIdx === -1) continue;

      const oldPrice = config.fuelStations![stationIdx].pricePerLiter;

      await FuelPriceHistory.create({
        stationId: schedule.stationId,
        stationName: schedule.stationName,
        oldPrice,
        newPrice: schedule.newPrice,
        changedBy: `scheduled-by:${schedule.createdBy}`,
        changedAt: now,
        reason: schedule.reason ? `Scheduled: ${schedule.reason}` : 'Scheduled price change',
      });

      config.fuelStations![stationIdx].pricePerLiter = schedule.newPrice;
      schedule.isApplied = true;
      schedule.appliedAt = now;
      await schedule.save();
      applied.push(schedule.stationId);
    }

    if (applied.length > 0) {
      config.lastUpdatedBy = 'scheduler';
      await config.save();
      emitDataChange('fuel_stations', 'update');
    }

    logger.info(`Applied ${applied.length} scheduled fuel price changes`);
    res.status(200).json({ success: true, applied: applied.length, stations: applied });
  } catch (err) {
    logger.error('applyDueSchedules error:', err);
    throw new ApiError(500, 'Failed to apply due schedules');
  }
};

/**
 * GET /api/v1/system-admin/fuel-prices/current
 * Returns current prices for all stations from system config.
 */
export const getCurrentPrices = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await getConfig();
    const stations = config.fuelStations || [];
    res.status(200).json({ success: true, data: stations });
  } catch (err) {
    logger.error('getCurrentPrices error:', err);
    throw new ApiError(500, 'Failed to fetch current prices');
  }
};
