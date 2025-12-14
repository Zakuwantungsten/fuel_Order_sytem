/**
 * Migration Script: Convert Hardcoded Batches to Dynamic Structure
 * 
 * FROM:
 * {
 *   truckBatches: {
 *     batch_100: [...],
 *     batch_80: [...],
 *     batch_60: [...]
 *   }
 * }
 * 
 * TO:
 * {
 *   truckBatches: {
 *     "100": [...],
 *     "80": [...],
 *     "60": [...]
 *   }
 * }
 */

import mongoose from 'mongoose';
import { SystemConfig } from '../models';
import { logger } from '../utils';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order_system';

async function migrateTruckBatches() {
  try {
    // Connect to database
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB for migration');

    // Find truck_batches config
    const config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config) {
      logger.warn('No truck_batches config found. Nothing to migrate.');
      return;
    }

    const oldBatches = config.truckBatches as any;

    // Check if already migrated
    if (!oldBatches.batch_100 && !oldBatches.batch_80 && !oldBatches.batch_60) {
      logger.info('Batches already migrated to dynamic structure');
      return;
    }

    logger.info('Starting migration...');
    logger.info('Current structure:', {
      batch_100: oldBatches.batch_100?.length || 0,
      batch_80: oldBatches.batch_80?.length || 0,
      batch_60: oldBatches.batch_60?.length || 0,
    });

    // Create new dynamic structure
    const newBatches: any = {};

    // Migrate batch_100 -> "100"
    if (oldBatches.batch_100 && Array.isArray(oldBatches.batch_100)) {
      newBatches['100'] = oldBatches.batch_100;
      logger.info(`Migrated ${oldBatches.batch_100.length} trucks from batch_100 to "100"`);
    }

    // Migrate batch_80 -> "80"
    if (oldBatches.batch_80 && Array.isArray(oldBatches.batch_80)) {
      newBatches['80'] = oldBatches.batch_80;
      logger.info(`Migrated ${oldBatches.batch_80.length} trucks from batch_80 to "80"`);
    }

    // Migrate batch_60 -> "60"
    if (oldBatches.batch_60 && Array.isArray(oldBatches.batch_60)) {
      newBatches['60'] = oldBatches.batch_60;
      logger.info(`Migrated ${oldBatches.batch_60.length} trucks from batch_60 to "60"`);
    }

    // Update database
    config.truckBatches = newBatches;
    config.markModified('truckBatches'); // Important for Mixed type
    await config.save();

    logger.info('✅ Migration completed successfully!');
    logger.info('New structure:', {
      '100': newBatches['100']?.length || 0,
      '80': newBatches['80']?.length || 0,
      '60': newBatches['60']?.length || 0,
    });

    // Verify migration
    const verifyConfig = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    logger.info('Verification:', verifyConfig?.truckBatches);

  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  migrateTruckBatches()
    .then(() => {
      logger.info('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration script failed:', error);
      process.exit(1);
    });
}

export default migrateTruckBatches;
