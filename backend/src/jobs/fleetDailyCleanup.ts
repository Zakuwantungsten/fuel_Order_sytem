/**
 * Fleet Daily Cleanup Job
 *
 * Runs every day at midnight (00:00) and permanently deletes all
 * FleetSnapshot documents (and their associated TruckPosition records)
 * that were created before the start of today.
 *
 * This ensures each user starts every day with a clean slate and must
 * upload a fresh report for the new day.
 */

import { FleetSnapshot, TruckPosition } from '../models';
import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

async function runFleetDailyCleanupHandler(): Promise<void> {
  logger.info('=== FLEET DAILY CLEANUP STARTED ===');

  // Start of today in UTC (midnight)
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  // Find all snapshot IDs older than today
  const oldSnapshots = await FleetSnapshot.find(
    { createdAt: { $lt: startOfToday } },
    { _id: 1 }
  ).lean();

  if (oldSnapshots.length === 0) {
    logger.info('Fleet daily cleanup: no old snapshots to remove.');
    logger.info('=== FLEET DAILY CLEANUP COMPLETED ===');
    return;
  }

  const snapshotIds = oldSnapshots.map(s => s._id);

  // Delete associated truck positions first
  const posResult = await TruckPosition.deleteMany({ snapshotId: { $in: snapshotIds } });

  // Delete the snapshots themselves
  const snapResult = await FleetSnapshot.deleteMany({ _id: { $in: snapshotIds } });

  logger.info(
    `Fleet daily cleanup: removed ${snapResult.deletedCount} snapshot(s) and ${posResult.deletedCount} truck position(s) from previous day(s).`
  );
  logger.info('=== FLEET DAILY CLEANUP COMPLETED ===');
}

// Register with the central job registry — runs every day at midnight UTC
jobRegistry.register({
  id: 'fleet-daily-cleanup',
  name: 'Fleet Daily Cleanup',
  description:
    'Deletes all fleet report snapshots and truck positions from previous days at midnight, so each user uploads a fresh report each day.',
  cronExpression: '0 0 * * *',
  isEnabled: true,
  handler: runFleetDailyCleanupHandler,
});
