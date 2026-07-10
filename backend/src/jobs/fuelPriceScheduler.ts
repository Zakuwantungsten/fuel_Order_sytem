/**
 * Fuel Price Scheduler — registered with jobRegistry so the cron manager
 * can list, enable/disable, and manually trigger it.
 *
 * Each due schedule is claimed atomically (isApplied: false → true) so two
 * runners cannot apply the same price change twice.
 */

import { FuelPriceSchedule, FuelPriceHistory } from '../models/FuelPrice';
import { FuelStationConfig } from '../models/FuelStationConfig';
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

  const applied: string[] = [];

  for (const schedule of dueSchedules) {
    // Atomic claim — only one worker wins
    const claimed = await FuelPriceSchedule.findOneAndUpdate(
      { _id: schedule._id, isApplied: false, isCancelled: false },
      { $set: { isApplied: true, appliedAt: now } },
      { new: true },
    );
    if (!claimed) {
      logger.info(`[FuelPriceScheduler] Schedule ${schedule._id} already claimed — skipping`);
      continue;
    }

    const station = await FuelStationConfig.findById(claimed.stationId);
    if (!station) {
      logger.warn(`[FuelPriceScheduler] Station ${claimed.stationId} not found; rolling back claim`);
      await FuelPriceSchedule.findByIdAndUpdate(claimed._id, {
        $set: { isApplied: false },
        $unset: { appliedAt: 1 },
      });
      continue;
    }

    const oldPrice = station.defaultRate;

    try {
      await FuelPriceHistory.create({
        stationId: claimed.stationId,
        stationName: claimed.stationName,
        oldPrice,
        newPrice: claimed.newPrice,
        changedBy: `scheduled-by:${claimed.createdBy}`,
        changedAt: now,
        reason: claimed.reason ? `Scheduled: ${claimed.reason}` : 'Scheduled price change',
      });

      station.defaultRate = claimed.newPrice;
      station.updatedBy = 'scheduler';
      await station.save();
      applied.push(claimed.stationId);
    } catch (err: any) {
      logger.error(`[FuelPriceScheduler] Failed applying ${claimed._id}: ${err?.message}`);
      await FuelPriceSchedule.findByIdAndUpdate(claimed._id, {
        $set: { isApplied: false },
        $unset: { appliedAt: 1 },
      });
    }
  }

  if (applied.length > 0) {
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
