/**
 * Edit Lock Cleanup Job
 *
 * Runs every 15 minutes and clears expired edit locks (lockedUntil < now)
 * across FuelRecord, DeliveryOrder, and LPOSummary collections.
 *
 * This is a hygiene task — expired locks are already treated as released
 * at read-time, but clearing them keeps the database tidy and avoids
 * stale data showing up in admin tooling.
 */

import { FuelRecord, DeliveryOrder, LPOSummary } from '../models';
import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

const MODELS = [
  { model: FuelRecord, name: 'FuelRecord' },
  { model: DeliveryOrder, name: 'DeliveryOrder' },
  { model: LPOSummary, name: 'LPOSummary' },
];

async function runEditLockCleanupHandler(): Promise<void> {
  logger.info('=== EDIT LOCK CLEANUP STARTED ===');

  const now = new Date();
  let totalCleaned = 0;

  for (const { model, name } of MODELS) {
    const result = await model.updateMany(
      {
        'editLock.lockedBy': { $ne: null },
        'editLock.lockedUntil': { $lt: now },
      },
      {
        $set: {
          'editLock.lockedBy': null,
          'editLock.lockedAt': null,
          'editLock.lockedUntil': null,
        },
      },
    );

    if (result.modifiedCount > 0) {
      logger.info(`Edit lock cleanup: cleared ${result.modifiedCount} expired lock(s) in ${name}`);
      totalCleaned += result.modifiedCount;
    }
  }

  if (totalCleaned === 0) {
    logger.info('Edit lock cleanup: no expired locks found.');
  }

  logger.info('=== EDIT LOCK CLEANUP COMPLETED ===');
}

// Register with the central job registry — runs every 15 minutes
jobRegistry.register({
  id: 'edit-lock-cleanup',
  name: 'Edit Lock Cleanup',
  description:
    'Clears expired edit locks (older than 5 min) from FuelRecord, DeliveryOrder, and LPOSummary collections every 15 minutes.',
  cronExpression: '*/15 * * * *',
  isEnabled: true,
  handler: runEditLockCleanupHandler,
});
