import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { FuelPriceHistory, FuelPriceSchedule } from '../models/FuelPrice';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';
import { emitDataChange } from '../services/websocket';

/** Map a FuelStationConfig document to the shape consumed by the Fuel Price tab */
function toFuelStation(doc: any) {
  return {
    id: doc._id.toString(),
    name: doc.stationName,
    location: doc.currency === 'USD' ? 'Zambia' : 'Tanzania',
    pricePerLiter: doc.defaultRate,
    currency: (doc.currency || 'TZS') as 'USD' | 'TZS',
    isActive: doc.isActive,
  };
}

/**
 * GET /api/v1/system-admin/fuel-prices/current
 * Returns current prices for all active stations from FuelStationConfig.
 */
export const getCurrentPrices = async (_req: AuthRequest, res: Response): Promise<void> => {
  const stations = await FuelStationConfig.find({ isActive: true }).sort({ stationName: 1 }).lean();
  res.status(200).json({ success: true, data: stations.map(toFuelStation) });
};

/**
 * GET /api/v1/system-admin/fuel-prices/history
 * Price change history with optional stationId filter.
 */
export const getPriceHistory = async (req: AuthRequest, res: Response): Promise<void> => {
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
};

/**
 * POST /api/v1/system-admin/fuel-prices/update
 * Immediately updates the price for a station and records history.
 */
export const updatePrice = async (req: AuthRequest, res: Response): Promise<void> => {
  const { stationId, newPrice, reason } = req.body;
  if (!stationId || typeof newPrice !== 'number' || newPrice <= 0) {
    throw new ApiError(400, 'stationId and a positive newPrice are required');
  }

  const station = await FuelStationConfig.findById(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  const oldPrice = station.defaultRate;
  if (oldPrice === newPrice) {
    throw new ApiError(400, 'New price is the same as the current price');
  }

  await FuelPriceHistory.create({
    stationId,
    stationName: station.stationName,
    oldPrice,
    newPrice,
    changedBy: req.user?.username || 'system',
    changedAt: new Date(),
    reason: reason?.trim() || undefined,
  });

  station.defaultRate = newPrice;
  station.updatedBy = req.user?.username || 'system';
  await station.save();
  emitDataChange('fuel_stations', 'update');

  await AuditService.log({
    action: 'CONFIG_CHANGE',
    resourceType: 'fuel_station_price',
    resourceId: stationId,
    userId: req.user?.userId || '',
    username: req.user?.username || '',
    previousValue: { defaultRate: oldPrice },
    newValue: { defaultRate: newPrice },
    details: `Fuel price updated for ${station.stationName}: ${oldPrice} → ${newPrice}${reason ? ` (${reason})` : ''}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  logger.info(`Fuel price for ${station.stationName} updated: ${oldPrice} → ${newPrice} by ${req.user?.username}`);
  res.status(200).json({ success: true, data: { stationId, stationName: station.stationName, oldPrice, newPrice } });
};

/**
 * GET /api/v1/system-admin/fuel-prices/schedules
 * All pending (non-applied, non-cancelled) price schedules.
 */
export const getSchedules = async (req: AuthRequest, res: Response): Promise<void> => {
  const includeApplied = req.query.includeApplied === 'true';
  const filter: Record<string, any> = { isCancelled: false };
  if (!includeApplied) filter.isApplied = false;

  const schedules = await FuelPriceSchedule.find(filter).sort({ effectiveAt: 1 });
  res.status(200).json({ success: true, data: schedules });
};

/**
 * POST /api/v1/system-admin/fuel-prices/schedules
 * Schedule a future price change for a station.
 */
export const createSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  const { stationId, newPrice, effectiveAt, reason } = req.body;
  if (!stationId || typeof newPrice !== 'number' || newPrice <= 0 || !effectiveAt) {
    throw new ApiError(400, 'stationId, newPrice, and effectiveAt are required');
  }
  const effectiveDate = new Date(effectiveAt);
  if (effectiveDate <= new Date()) {
    throw new ApiError(400, 'effectiveAt must be a future date — use the update endpoint for immediate changes');
  }

  const station = await FuelStationConfig.findById(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  const schedule = await FuelPriceSchedule.create({
    stationId,
    stationName: station.stationName,
    currentPrice: station.defaultRate,
    newPrice,
    effectiveAt: effectiveDate,
    createdBy: req.user?.username || 'system',
    reason: reason?.trim() || undefined,
  });

  logger.info(`Fuel price schedule created for ${station.stationName}: ${newPrice} at ${effectiveDate.toISOString()} by ${req.user?.username}`);
  res.status(201).json({ success: true, data: schedule });
};

/**
 * DELETE /api/v1/system-admin/fuel-prices/schedules/:id
 * Cancel a pending schedule.
 */
export const cancelSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  const schedule = await FuelPriceSchedule.findById(req.params.id);
  if (!schedule) throw new ApiError(404, 'Schedule not found');
  if (schedule.isApplied) throw new ApiError(400, 'Cannot cancel an already-applied schedule');
  if (schedule.isCancelled) throw new ApiError(400, 'Schedule is already cancelled');

  schedule.isCancelled = true;
  schedule.cancelledAt = new Date();
  await schedule.save();

  res.status(200).json({ success: true, message: 'Schedule cancelled' });
};

/**
 * POST /api/v1/system-admin/fuel-prices/schedules/apply-due
 * Apply all due (past effectiveAt) pending schedules.
 */
export const applyDueSchedules = async (req: AuthRequest, res: Response): Promise<void> => {
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

  const applied: string[] = [];

  for (const schedule of dueSchedules) {
    const station = await FuelStationConfig.findById(schedule.stationId);
    if (!station) {
      logger.warn(`[applyDueSchedules] Station ${schedule.stationId} not found; skipping`);
      continue;
    }

    const oldPrice = station.defaultRate;

    await FuelPriceHistory.create({
      stationId: schedule.stationId,
      stationName: schedule.stationName,
      oldPrice,
      newPrice: schedule.newPrice,
      changedBy: `scheduled-by:${schedule.createdBy}`,
      changedAt: now,
      reason: schedule.reason ? `Scheduled: ${schedule.reason}` : 'Scheduled price change',
    });

    station.defaultRate = schedule.newPrice;
    station.updatedBy = 'scheduler';
    await station.save();
    schedule.isApplied = true;
    schedule.appliedAt = now;
    await schedule.save();
    applied.push(schedule.stationId);
  }

  if (applied.length > 0) {
    emitDataChange('fuel_stations', 'update');
  }

  logger.info(`Applied ${applied.length} scheduled fuel price changes`);
  res.status(200).json({ success: true, applied: applied.length, stations: applied });
};
