/**
 * Migration Script: Add Journey Status to Existing Fuel Records
 * 
 * This script updates all existing fuel records to include the new journey status fields.
 * 
 * Logic:
 * - Records without returnDo = 'active' (ongoing journey)
 * - Records with returnDo and balance = 0 and return checkpoint filled = 'completed'
 * - Records with returnDo but balance > 0 = 'active' (active return journey)
 * 
 * Run: npx ts-node src/scripts/migrateJourneyStatus.ts
 */

import mongoose from 'mongoose';
import { FuelRecord } from '../models';
import { config } from '../config';
import { logger } from '../utils';

/**
 * Check if a journey is complete based on return checkpoints
 */
function isJourneyComplete(record: any): boolean {
  if (record.balance !== 0) {
    return false;
  }
  
  const destination = (record.originalGoingTo || record.to || '').toUpperCase();
  const isMSADestination = destination.includes('MSA') || destination.includes('MOMBASA');
  
  if (isMSADestination) {
    return record.tangaReturn !== 0 && record.tangaReturn !== undefined;
  } else {
    return record.mbeyaReturn !== 0 && record.mbeyaReturn !== undefined;
  }
}

async function migrateJourneyStatus() {
  try {
    // Connect to database
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    // Get all non-deleted fuel records
    const allRecords = await FuelRecord.find({ isDeleted: false }).sort({ date: 1 });
    
    logger.info(`Found ${allRecords.length} fuel records to process`);

    let updatedCount = 0;
    let activeCount = 0;
    let completedCount = 0;
    let alreadyMigratedCount = 0;

    for (const record of allRecords) {
      // Skip if already has journey status
      if (record.journeyStatus) {
        alreadyMigratedCount++;
        continue;
      }

      // Determine journey status
      if (!record.returnDo || record.returnDo === '') {
        // No return DO = active journey
        record.journeyStatus = 'active';
        record.activatedAt = record.createdAt;
        activeCount++;
        logger.info(`  ✓ ${record.truckNo} - DO ${record.goingDo}: Active (no return DO)`);
      } else if (record.balance === 0 && isJourneyComplete(record)) {
        // Has return DO, balance is 0, and return checkpoint filled = completed
        record.journeyStatus = 'completed';
        record.completedAt = record.updatedAt;
        completedCount++;
        logger.info(`  ✓ ${record.truckNo} - DO ${record.goingDo}: Completed (balance=0, return checkpoint filled)`);
      } else {
        // Has return DO but not yet complete = active return journey
        record.journeyStatus = 'active';
        record.activatedAt = record.createdAt;
        activeCount++;
        logger.info(`  ✓ ${record.truckNo} - DO ${record.goingDo}: Active (return journey in progress)`);
      }

      await record.save();
      updatedCount++;
    }

    logger.info('\n=== Migration Summary ===');
    logger.info(`Total records processed: ${allRecords.length}`);
    logger.info(`Already migrated: ${alreadyMigratedCount}`);
    logger.info(`Updated: ${updatedCount}`);
    logger.info(`  - Active journeys: ${activeCount}`);
    logger.info(`  - Completed journeys: ${completedCount}`);
    logger.info('=========================\n');

    // Check for any trucks with multiple active journeys (shouldn't happen but good to check)
    const trucksWithMultipleActive = await FuelRecord.aggregate([
      { $match: { isDeleted: false, journeyStatus: 'active' } },
      { $group: { _id: '$truckNo', count: { $sum: 1 }, journeys: { $push: '$goingDo' } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (trucksWithMultipleActive.length > 0) {
      logger.warn('\n⚠️  WARNING: Found trucks with multiple active journeys:');
      trucksWithMultipleActive.forEach((truck: any) => {
        logger.warn(`  - ${truck._id}: ${truck.count} active journeys (${truck.journeys.join(', ')})`);
        logger.warn(`    → This may need manual review to set proper queue order`);
      });
      logger.warn('');
    }

    logger.info('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateJourneyStatus();
