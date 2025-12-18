import mongoose from 'mongoose';
import { config } from '../config';
import { YardFuelDispense } from '../models/YardFuelDispense';
import { FuelRecord } from '../models/FuelRecord';
import logger from '../utils/logger';

/**
 * Migration script to re-process pending yard fuel entries
 * This script attempts to auto-link existing pending yard fuel entries
 * to active (non-cancelled) fuel records.
 * 
 * Usage: npm run relink-yard-fuel
 */

interface RelinkResult {
  totalPending: number;
  successfullyLinked: number;
  remainingPending: number;
  errors: number;
  details: Array<{
    truckNo: string;
    yard: string;
    liters: number;
    status: 'linked' | 'still_pending' | 'error';
    doNumber?: string;
    error?: string;
  }>;
}

async function relinkPendingYardFuel(): Promise<RelinkResult> {
  try {
    logger.info('Starting pending yard fuel re-linking process...');

    // Connect to database
    await mongoose.connect(config.mongodbUri);
    logger.info('Database connected');

    // Find all pending yard fuel entries
    const pendingEntries = await YardFuelDispense.find({
      status: 'pending',
      isDeleted: false,
    }).sort({ date: -1, timestamp: -1 });

    logger.info(`Found ${pendingEntries.length} pending yard fuel entries to process`);

    const result: RelinkResult = {
      totalPending: pendingEntries.length,
      successfullyLinked: 0,
      remainingPending: 0,
      errors: 0,
      details: [],
    };

    // Process each pending entry
    for (const entry of pendingEntries) {
      try {
        const truckNo = entry.truckNo;
        const dispenseDate = entry.date;
        const yard = entry.yard;

        logger.info(`Processing: ${truckNo} at ${yard} on ${dispenseDate}`);

        // Find matching active fuel record (most recent for truck)
        const fuelRecord = await FuelRecord.findOne({
          truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
          isDeleted: false,
          isCancelled: false,
        }).sort({ date: -1 });

        if (fuelRecord) {
          // Determine yard field to update
          let updateField = '';
          if (yard === 'DAR YARD') {
            updateField = 'darYard';
          } else if (yard === 'TANGA YARD') {
            updateField = 'tangaYard';
          } else if (yard === 'MMSA YARD') {
            updateField = 'mmsaYard';
          }

          if (updateField) {
            // Update fuel record yard allocation
            const currentValue = (fuelRecord as any)[updateField] || 0;
            await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
              [updateField]: currentValue - entry.liters,
            });

            // Update yard fuel dispense status
            entry.status = 'linked';
            entry.linkedFuelRecordId = fuelRecord._id.toString();
            entry.linkedDONumber = fuelRecord.goingDo;
            entry.autoLinked = true;

            // Add to history
            if (!entry.history) {
              entry.history = [];
            }
            entry.history.push({
              action: 'linked',
              performedBy: 'system_migration',
              timestamp: new Date(),
              details: {
                doNumber: fuelRecord.goingDo,
                fuelRecordId: fuelRecord._id.toString(),
                linkedAt: new Date(),
                migrationScript: true,
              },
            });

            await entry.save();

            result.successfullyLinked++;
            result.details.push({
              truckNo: entry.truckNo,
              yard: entry.yard,
              liters: entry.liters,
              status: 'linked',
              doNumber: fuelRecord.goingDo,
            });

            logger.info(
              `✅ Linked: ${truckNo} → DO ${fuelRecord.goingDo} (${updateField} ${entry.liters}L)`
            );
          }
        } else {
          // Check if cancelled records exist
          const cancelledCount = await FuelRecord.countDocuments({
            truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
            isDeleted: false,
            isCancelled: true,
          });

          result.remainingPending++;
          result.details.push({
            truckNo: entry.truckNo,
            yard: entry.yard,
            liters: entry.liters,
            status: 'still_pending',
            error: cancelledCount > 0
              ? `${cancelledCount} cancelled record(s) found, no active record`
              : 'No matching fuel record found',
          });

          logger.warn(
            `⚠️ Still Pending: ${truckNo} (${cancelledCount > 0 ? `${cancelledCount} cancelled records exist` : 'No records found'})`
          );
        }
      } catch (entryError: any) {
        result.errors++;
        result.details.push({
          truckNo: entry.truckNo,
          yard: entry.yard,
          liters: entry.liters,
          status: 'error',
          error: entryError.message,
        });
        logger.error(`Error processing ${entry.truckNo}:`, entryError);
      }
    }

    // Print summary
    logger.info('\n========================================');
    logger.info('MIGRATION SUMMARY');
    logger.info('========================================');
    logger.info(`Total Pending Entries:     ${result.totalPending}`);
    logger.info(`Successfully Linked:       ${result.successfullyLinked}`);
    logger.info(`Remaining Pending:         ${result.remainingPending}`);
    logger.info(`Errors:                    ${result.errors}`);
    logger.info('========================================\n');

    // Print detailed results
    if (result.successfullyLinked > 0) {
      logger.info('\n✅ SUCCESSFULLY LINKED:');
      result.details
        .filter((d) => d.status === 'linked')
        .forEach((d) => {
          logger.info(`  - ${d.truckNo} (${d.liters}L at ${d.yard}) → DO ${d.doNumber}`);
        });
    }

    if (result.remainingPending > 0) {
      logger.info('\n⚠️ STILL PENDING:');
      result.details
        .filter((d) => d.status === 'still_pending')
        .forEach((d) => {
          logger.info(`  - ${d.truckNo} (${d.liters}L at ${d.yard}) - ${d.error}`);
        });
    }

    if (result.errors > 0) {
      logger.error('\n❌ ERRORS:');
      result.details
        .filter((d) => d.status === 'error')
        .forEach((d) => {
          logger.error(`  - ${d.truckNo} (${d.liters}L at ${d.yard}) - ${d.error}`);
        });
    }

    return result;
  } catch (error: any) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Database disconnected');
  }
}

// Run the migration
relinkPendingYardFuel()
  .then((result) => {
    logger.info('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration failed with error:', error);
    process.exit(1);
  });
