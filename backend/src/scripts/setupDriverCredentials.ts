import connectDatabase from '../config/database';
import { DriverCredential, DeliveryOrder } from '../models';
import logger from '../utils/logger';
import crypto from 'crypto';

/**
 * Migration script to create driver credentials for existing trucks
 * This replaces the insecure username===password authentication
 * 
 * Run with: npm run setup-driver-credentials
 */

const setupDriverCredentials = async () => {
  try {
    await connectDatabase();
    logger.info('Setting up driver credentials...');

    // Get all unique truck numbers from delivery orders
    const trucks = await DeliveryOrder.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: { $toUpper: '$truckNo' },
          truckNo: { $first: '$truckNo' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    logger.info(`Found ${trucks.length} unique trucks`);

    const credentials = [];
    let created = 0;
    let skipped = 0;

    for (const truck of trucks) {
      const truckNo = truck._id;

      // Check if credential already exists
      const existing = await DriverCredential.findOne({ truckNo });
      if (existing) {
        logger.info(`Credential already exists for truck ${truckNo}, skipping...`);
        skipped++;
        continue;
      }

      // Generate a random 4-digit PIN
      const pin = Math.floor(1000 + Math.random() * 9000).toString();

      // Create driver credential
      const credential = await DriverCredential.create({
        truckNo: truckNo,
        pin: pin,
        driverName: `Driver ${truckNo}`,
        isActive: true,
        createdBy: 'system_migration',
      });

      credentials.push({
        truckNo: truckNo,
        pin: pin, // Store plaintext PIN for display only
      });

      created++;
      logger.info(`Created credential for truck ${truckNo} with PIN: ${pin}`);
    }

    logger.info('\n==============================================');
    logger.info('Driver Credentials Setup Complete');
    logger.info('==============================================');
    logger.info(`Total trucks: ${trucks.length}`);
    logger.info(`New credentials created: ${created}`);
    logger.info(`Skipped (already exists): ${skipped}`);
    logger.info('\n==============================================');
    logger.info('IMPORTANT: Save these credentials securely!');
    logger.info('==============================================\n');

    // Display all new credentials
    if (credentials.length > 0) {
      console.table(credentials);
      logger.info('\nThese PINs are for initial setup only.');
      logger.info('Drivers should change their PINs after first login.');
      logger.info('PINs are securely hashed in the database.');
    }

    logger.info('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error: any) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
setupDriverCredentials();
