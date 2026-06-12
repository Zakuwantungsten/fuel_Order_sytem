import { FuelRecord, computeMonthKey } from '../models/FuelRecord';
import logger from '../utils/logger';

/**
 * One-time (idempotent) backfill of FuelRecord.monthKey.
 *
 * Runs at server boot (see server.ts). Records created/updated after this
 * deploy get monthKey from the schema hooks; this fills in everything older.
 * `{ monthKey: null }` matches both missing and explicitly-null fields, so
 * re-running is a single cheap count once the backfill has completed.
 */
export async function backfillFuelMonthKeys(): Promise<void> {
  const missingFilter = { $or: [{ monthKey: null }, { monthKey: '' }] };

  const missingCount = await FuelRecord.countDocuments(missingFilter);
  if (missingCount === 0) return;

  logger.info(`monthKey backfill: ${missingCount} fuel records to process`);

  const cursor = FuelRecord.find(missingFilter).select('date month').lean().cursor();

  let ops: any[] = [];
  let updated = 0;
  let skipped = 0;

  const flush = async () => {
    if (ops.length === 0) return;
    await FuelRecord.bulkWrite(ops, { ordered: false });
    updated += ops.length;
    ops = [];
  };

  for await (const doc of cursor) {
    const key = computeMonthKey((doc as any).date, (doc as any).month);
    if (!key) {
      skipped++;
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { monthKey: key } },
      },
    });
    if (ops.length >= 500) await flush();
  }
  await flush();

  logger.info(`monthKey backfill complete: ${updated} updated, ${skipped} skipped (unparseable date/month)`);
}
