import mongoose from 'mongoose';
import { FuelRecord } from '../models';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to verify balance calculations across all fuel records
 * Formula: Balance = (totalLts + extra) - (sum of all checkpoints)
 */

const checkpointFields = [
  'mmsaYard', 'tangaYard', 'darYard', 
  'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn'
];

async function verifyBalanceCalculations(): Promise<void> {
  try {
    console.log('🔍 Verifying balance calculations for all fuel records...\n');

    // Connect to database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order_system';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    // Get all fuel records
    const records = await FuelRecord.find({ isDeleted: false }).lean();
    console.log(`📊 Found ${records.length} fuel records to verify\n`);

    let correctCount = 0;
    let incorrectCount = 0;
    const errors: any[] = [];

    for (const record of records) {
      // Calculate expected balance
      const totalFuel = (record.totalLts || 0) + (record.extra || 0);
      const totalCheckpoints = checkpointFields.reduce((sum, field) => {
        return sum + Math.abs((record as any)[field] || 0);
      }, 0);
      const expectedBalance = totalFuel - totalCheckpoints;

      // Check if balance matches (allow 0.01L tolerance for floating point)
      const balanceDiff = Math.abs(record.balance - expectedBalance);
      
      if (balanceDiff > 0.01) {
        incorrectCount++;
        errors.push({
          truckNo: record.truckNo,
          goingDo: record.goingDo,
          totalLts: record.totalLts,
          extra: record.extra,
          totalCheckpoints,
          currentBalance: record.balance,
          expectedBalance,
          difference: record.balance - expectedBalance,
          isLocked: record.isLocked,
          pendingConfigReason: record.pendingConfigReason
        });
      } else {
        correctCount++;
      }
    }

    // Print results
    console.log('═══════════════════════════════════════════════════════');
    console.log('                   VERIFICATION RESULTS                ');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`✅ Correct balances: ${correctCount}`);
    console.log(`❌ Incorrect balances: ${incorrectCount}`);
    console.log(`📈 Accuracy: ${((correctCount / records.length) * 100).toFixed(2)}%\n`);

    if (incorrectCount > 0) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('                  RECORDS WITH ERRORS                  ');
      console.log('═══════════════════════════════════════════════════════\n');

      errors.forEach((error, index) => {
        console.log(`${index + 1}. Truck: ${error.truckNo} | DO: ${error.goingDo}`);
        console.log(`   Total: ${error.totalLts}L, Extra: ${error.extra}L`);
        console.log(`   Checkpoints: ${error.totalCheckpoints}L`);
        console.log(`   Current Balance: ${error.currentBalance}L`);
        console.log(`   Expected Balance: ${error.expectedBalance}L`);
        console.log(`   Difference: ${error.difference > 0 ? '+' : ''}${error.difference.toFixed(2)}L`);
        if (error.isLocked) {
          console.log(`   ⚠️  LOCKED: ${error.pendingConfigReason}`);
        }
        console.log('');
      });

      console.log('\n💡 Recommendation: Run the migration script to fix incorrect balances:');
      console.log('   npm run migrate:fuel-calculation\n');
    } else {
      console.log('🎉 All fuel records have correct balance calculations!\n');
    }

    await mongoose.disconnect();
    console.log('✓ Disconnected from database');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run verification
verifyBalanceCalculations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
