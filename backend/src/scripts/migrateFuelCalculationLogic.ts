/**
 * Migration Script: Fix Fuel Calculation Logic
 * 
 * This script converts all fuel checkpoint values from negative to positive
 * and recalculates balance fields using the correct formula:
 * 
 * Balance = (Total Liters + Extra) - (Sum of ALL Checkpoints)
 * 
 * All checkpoint values should be stored as POSITIVE numbers.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { FuelRecord } from '../models';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order_system';

interface MigrationStats {
  totalRecords: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: number;
  balanceCorrections: number;
}

async function migrateFuelCalculationLogic(): Promise<void> {
  try {
    console.log('🚀 Starting Fuel Calculation Logic Migration...\n');
    console.log(`📊 Connecting to MongoDB: ${MONGODB_URI}\n`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const stats: MigrationStats = {
      totalRecords: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: 0,
      balanceCorrections: 0,
    };

    // Get all fuel records (including deleted ones for data integrity)
    const fuelRecords = await FuelRecord.find({}).lean();
    stats.totalRecords = fuelRecords.length;

    console.log(`📋 Found ${stats.totalRecords} fuel records to process\n`);
    console.log('─'.repeat(80) + '\n');

    for (const record of fuelRecords) {
      try {
        const updates: any = {};
        let hasUpdates = false;

        // List of checkpoint fields to convert to positive
        const checkpointFields = [
          'mmsaYard', 'tangaYard', 'darYard',
          'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
          'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn'
        ];

        // Convert negative checkpoint values to positive
        for (const field of checkpointFields) {
          const value = (record as any)[field];
          if (value && value < 0) {
            updates[field] = Math.abs(value);
            hasUpdates = true;
          }
        }

        // Recalculate balance using correct formula
        const totalFuel = (record.totalLts || 0) + (record.extra || 0);
        const totalCheckpoints = checkpointFields.reduce((sum, field) => {
          const value = updates[field] !== undefined ? updates[field] : (record as any)[field];
          return sum + Math.abs(value || 0);
        }, 0);
        
        const correctBalance = totalFuel - totalCheckpoints;

        // Check if balance needs correction
        if (Math.abs(record.balance - correctBalance) > 0.01) {
          updates.balance = correctBalance;
          hasUpdates = true;
          stats.balanceCorrections++;
          
          console.log(`🔧 Truck: ${record.truckNo} | DO: ${record.goingDo}`);
          console.log(`   Old Balance: ${record.balance}L → New Balance: ${correctBalance}L`);
          console.log(`   Total: ${totalFuel}L, Checkpoints: ${totalCheckpoints}L\n`);
        }

        if (hasUpdates) {
          await FuelRecord.findByIdAndUpdate(record._id, { $set: updates });
          stats.recordsUpdated++;
        } else {
          stats.recordsSkipped++;
        }

      } catch (error: any) {
        console.error(`❌ Error processing record ${record._id}:`, error.message);
        stats.errors++;
      }
    }

    console.log('─'.repeat(80) + '\n');
    console.log('📊 Migration Summary:\n');
    console.log(`   Total Records:        ${stats.totalRecords}`);
    console.log(`   Records Updated:      ${stats.recordsUpdated}`);
    console.log(`   Records Skipped:      ${stats.recordsSkipped}`);
    console.log(`   Balance Corrections:  ${stats.balanceCorrections}`);
    console.log(`   Errors:               ${stats.errors}\n`);

    if (stats.errors > 0) {
      console.log('⚠️  Migration completed with errors. Please review error messages above.\n');
    } else {
      console.log('✅ Migration completed successfully!\n');
    }

    // Verification step
    console.log('🔍 Running verification...\n');
    const verificationResult = await verifyMigration();
    
    if (verificationResult.allValid) {
      console.log('✅ Verification passed! All records have correct values.\n');
    } else {
      console.log(`⚠️  Verification found ${verificationResult.invalidCount} records with issues.\n`);
    }

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

async function verifyMigration(): Promise<{ allValid: boolean; invalidCount: number }> {
  const fuelRecords = await FuelRecord.find({}).lean();
  let invalidCount = 0;

  for (const record of fuelRecords) {
    // Check 1: All checkpoint values should be non-negative
    const checkpointFields = [
      'mmsaYard', 'tangaYard', 'darYard',
      'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
      'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn'
    ];

    for (const field of checkpointFields) {
      const value = (record as any)[field];
      if (value && value < 0) {
        console.log(`   ❌ Record ${record.truckNo} (${record.goingDo}): Field ${field} has negative value: ${value}`);
        invalidCount++;
      }
    }

    // Check 2: Balance should match formula
    const totalFuel = (record.totalLts || 0) + (record.extra || 0);
    const totalCheckpoints = checkpointFields.reduce((sum, field) => {
      return sum + Math.abs((record as any)[field] || 0);
    }, 0);
    
    const expectedBalance = totalFuel - totalCheckpoints;

    if (Math.abs(record.balance - expectedBalance) > 0.01) {
      console.log(`   ⚠️  Record ${record.truckNo} (${record.goingDo}): Balance mismatch`);
      console.log(`      Current: ${record.balance}L, Expected: ${expectedBalance}L`);
      invalidCount++;
    }
  }

  return {
    allValid: invalidCount === 0,
    invalidCount,
  };
}

// Run migration if executed directly
if (require.main === module) {
  migrateFuelCalculationLogic()
    .then(() => {
      console.log('✨ Migration script completed\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateFuelCalculationLogic };
