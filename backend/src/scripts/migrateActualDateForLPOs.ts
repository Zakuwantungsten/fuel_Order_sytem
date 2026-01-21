/**
 * Migration script to populate actualDate field for existing LPO entries
 * Run this once after deploying the actualDate field changes
 */

import mongoose from 'mongoose';
import { LPOEntry } from '../models/LPOEntry';
import { logger } from '../utils';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order_system';

async function migrateActualDate() {
  try {
    // Connect to database
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB for actualDate migration');

    // Find all LPO entries without actualDate
    const entries = await LPOEntry.find({ 
      $or: [
        { actualDate: { $exists: false } },
        { actualDate: null }
      ]
    });

    logger.info(`Found ${entries.length} LPO entries to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const entry of entries) {
      try {
        // Parse date field (format: "DD-MMM" or "DD-MM" or "DD-Month")
        const dateParts = entry.date.split('-');
        if (dateParts.length >= 2) {
          const day = parseInt(dateParts[0], 10);
          let month = dateParts[1];
          
          // Convert month name/abbreviation to number
          const monthMap: { [key: string]: number } = {
            'jan': 0, 'january': 0,
            'feb': 1, 'february': 1,
            'mar': 2, 'march': 2,
            'apr': 3, 'april': 3,
            'may': 4,
            'jun': 5, 'june': 5,
            'jul': 6, 'july': 6,
            'aug': 7, 'august': 7,
            'sep': 8, 'september': 8,
            'oct': 9, 'october': 9,
            'nov': 10, 'november': 10,
            'dec': 11, 'december': 11
          };
          
          let monthNum: number;
          if (!isNaN(parseInt(month))) {
            monthNum = parseInt(month, 10) - 1; // Convert 1-12 to 0-11
          } else {
            monthNum = monthMap[month.toLowerCase()] ?? 0;
          }
          
          // Use createdAt year as reference
          const referenceYear = entry.createdAt ? new Date(entry.createdAt).getFullYear() : new Date().getFullYear();
          const referenceDate = entry.createdAt ? new Date(entry.createdAt) : new Date();
          
          // Create the actual date with reference year
          let actualDate = new Date(referenceYear, monthNum, day);
          
          // If the resulting date is in the future compared to the reference date,
          // it means the LPO was from the previous year
          if (actualDate > referenceDate) {
            actualDate = new Date(referenceYear - 1, monthNum, day);
          }
          
          entry.actualDate = actualDate;
          
          await entry.save();
          successCount++;
          
          if (successCount % 100 === 0) {
            logger.info(`Migrated ${successCount}/${entries.length} entries...`);
          }
        } else {
          // If parsing fails, use createdAt
          entry.actualDate = entry.createdAt || new Date();
          await entry.save();
          successCount++;
        }
      } catch (error: any) {
        logger.error(`Error migrating entry ${entry._id}:`, error);
        errorCount++;
      }
    }

    logger.info(`Migration completed! Success: ${successCount}, Errors: ${errorCount}`);

    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error: any) {
    logger.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migrateActualDate();
