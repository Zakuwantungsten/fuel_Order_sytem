/**
 * Fuel Price Scheduler — registered with jobRegistry so the cron manager
 * can list, enable/disable, and manually trigger it.
 */

import { FuelPriceSchedule, FuelPriceHistory } from '../models/FuelPrice';
import { SystemConfig } from '../models';
import { emitDataChange } from '../services/websocket';
import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

export async function applyDueFuelPriceSchedules(): Promise<void> {
  const now = new Date();
  const dueSchedules = await FuelPriceSchedule.find({
    isApplied: false,
    isCancelled: false,
    effectiveAt: { $lte: now },
  });

  if (dueSchedules.length === 0) {
    logger.info('[FuelPriceScheduler] No due schedules to apply');
    return;
  }

  let config = await SystemConfig.findOne({ configType: 'fuel_stations', isDeleted: false });
  if (!config) {
    logger.warn('[FuelPriceScheduler] No fuel_stations config found; skipping');
    return;
  }

  const applied: string[] = [];

  for (const schedule of dueSchedules) {
    const stationIdx = config.fuelStations?.findIndex((s: any) => s.id === schedule.stationId);
    if (stationIdx === undefined || stationIdx === -1) {
      logger.warn(`[FuelPriceScheduler] Station ${schedule.stationId} not found; skipping`);
      continue;
    }

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
    logger.info(`[FuelPriceScheduler] Applied ${applied.length} scheduled fuel price change(s): ${applied.join(', ')}`);
  }
}

// Register: runs every 5 minutes to apply due schedules
jobRegistry.register({
  id: 'fuel_price_scheduler',
  name: 'Fuel Price Scheduler',
  description: 'Checks and applies any scheduled fuel price changes whose effective time has passed. Runs every 5 minutes.',
  cronExpression: '*/5 * * * *',
  isEnabled: true,
  handler: applyDueFuelPriceSchedules,
});
