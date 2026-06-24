/**
 * Data-integrity report: list every DO number shared across more than one
 * (non-cancelled, non-deleted) fuel record — i.e. the same DO on two trucks.
 *
 * These are import defects that make DO→truck lookups in the LPO form ambiguous.
 * This script is READ-ONLY: it prints the offending DOs and the records that
 * carry them so the data can be cleaned at the source. It changes nothing.
 *
 * Run: MONGODB_URI="<uri>" npx ts-node src/scripts/reportDuplicateDONumbers.ts
 */

import mongoose from 'mongoose';
import { FuelRecord } from '../models';
import { requireMongoUri } from './requireMongoUri';
import { logger } from '../utils';

interface DuplicateDO {
  doNo: string;
  count: number;
  records: { recordId: any; truckNo: string; direction: 'going' | 'returning'; date: string; do: string }[];
}

async function reportDuplicateDONumbers(): Promise<void> {
  await mongoose.connect(requireMongoUri());
  logger.info('Connected to MongoDB');

  const duplicates = (await FuelRecord.aggregate([
    { $match: { isDeleted: false, isCancelled: { $ne: true } } },
    {
      $project: {
        truckNo: 1,
        date: 1,
        dos: {
          $filter: {
            input: [
              { do: '$goingDo', direction: 'going' },
              { do: '$returnDo', direction: 'returning' },
            ],
            as: 'd',
            cond: {
              $and: [
                { $ne: ['$$d.do', null] },
                { $ne: [{ $ifNull: ['$$d.do', ''] }, ''] },
                { $ne: [{ $toUpper: { $ifNull: ['$$d.do', ''] } }, 'NIL'] },
                { $ne: [{ $toUpper: { $ifNull: ['$$d.do', ''] } }, 'N/A'] },
              ],
            },
          },
        },
      },
    },
    { $unwind: '$dos' },
    {
      $group: {
        _id: { $toUpper: '$dos.do' },
        records: {
          $push: {
            recordId: '$_id',
            truckNo: '$truckNo',
            direction: '$dos.direction',
            date: '$date',
            do: '$dos.do',
          },
        },
        recordIds: { $addToSet: '$_id' },
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$recordIds' }, 1] } } },
    { $project: { _id: 0, doNo: '$_id', count: { $size: '$recordIds' }, records: 1 } },
    { $sort: { count: -1, doNo: 1 } },
  ])) as DuplicateDO[];

  logger.info('\n=== Duplicate DO Report ===');
  logger.info(`DO numbers shared across multiple trucks: ${duplicates.length}`);

  for (const dup of duplicates) {
    logger.info(`\nDO ${dup.doNo} — on ${dup.count} records:`);
    for (const r of dup.records) {
      logger.info(`  • Truck ${r.truckNo} | ${r.direction} | date ${r.date} | DO as-stored "${r.do}" | id ${r.recordId}`);
    }
  }
  logger.info('\n===========================\n');

  await mongoose.disconnect();
}

reportDuplicateDONumbers()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Duplicate DO report failed:', err);
    process.exit(1);
  });
