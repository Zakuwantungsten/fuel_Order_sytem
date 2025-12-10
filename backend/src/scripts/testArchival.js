#!/usr/bin/env node

/**
 * Archival Test Script
 * 
 * Run this script to test the archival system before using it in production
 * 
 * Usage:
 *   npm run archival:test        # Dry run (safe)
 *   npm run archival:run         # Actual run (archives data)
 *   npm run archival:stats       # View statistics
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models and services after env is loaded
const connectDatabase = require('./config/database').default;
const archivalService = require('./services/archivalService').default;
const logger = require('./utils/logger').default;

async function testArchival() {
  try {
    logger.info('=== ARCHIVAL TEST SCRIPT ===');
    
    // Connect to database
    await connectDatabase();
    logger.info('✓ Connected to database');

    // Get current statistics BEFORE archival
    logger.info('\n📊 Current Database Statistics:');
    const statsBefore = await archivalService.getArchivalStats();
    
    console.log('\nActive Records:');
    Object.entries(statsBefore.activeRecords).forEach(([collection, count]) => {
      console.log(`  - ${collection}: ${count.toLocaleString()} records`);
    });
    
    console.log('\nArchived Records:');
    Object.entries(statsBefore.archivedRecords).forEach(([collection, count]) => {
      console.log(`  - ${collection}: ${count.toLocaleString()} records`);
    });
    
    if (statsBefore.lastArchivalDate) {
      console.log(`\nLast Archival: ${statsBefore.lastArchivalDate}`);
    }
    console.log(`Total Space Saved: ${statsBefore.totalSpaceSaved}`);

    // Determine if this is a dry run or actual run
    const args = process.argv.slice(2);
    const isDryRun = !args.includes('--execute');

    if (isDryRun) {
      logger.info('\n🧪 Running DRY RUN (no data will be modified)...');
      logger.info('Use --execute flag to actually archive data');
    } else {
      logger.warn('\n⚠️  RUNNING ACTUAL ARCHIVAL - DATA WILL BE MOVED!');
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
    }

    // Run archival
    const result = await archivalService.archiveOldData(
      {
        monthsToKeep: 6,
        auditLogMonthsToKeep: 12,
        dryRun: isDryRun,
        batchSize: 1000,
      },
      'test-script'
    );

    // Display results
    logger.info('\n✅ Archival Process Completed');
    logger.info(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    logger.info(`Duration: ${(result.totalDuration / 1000).toFixed(2)} seconds`);
    logger.info(`Total Records ${isDryRun ? 'Would Be' : 'Were'} Archived: ${result.totalRecordsArchived.toLocaleString()}`);

    if (result.totalRecordsArchived > 0) {
      console.log('\n📦 Archival Breakdown:');
      Object.entries(result.collectionsArchived).forEach(([collection, stats]) => {
        console.log(`  - ${collection}:`);
        console.log(`    Records: ${stats.recordsArchived.toLocaleString()}`);
        console.log(`    Duration: ${(stats.duration / 1000).toFixed(2)}s`);
        console.log(`    Cutoff Date: ${stats.cutoffDate.toISOString().split('T')[0]}`);
      });
    }

    if (result.errors.length > 0) {
      logger.error('\n❌ Errors encountered:');
      result.errors.forEach(error => logger.error(`  - ${error}`));
    }

    // Get statistics AFTER archival (if actual run)
    if (!isDryRun && result.success) {
      logger.info('\n📊 Updated Database Statistics:');
      const statsAfter = await archivalService.getArchivalStats();
      
      console.log('\nActive Records:');
      Object.entries(statsAfter.activeRecords).forEach(([collection, count]) => {
        const before = statsBefore.activeRecords[collection] || 0;
        const diff = before - count;
        console.log(`  - ${collection}: ${count.toLocaleString()} (${diff > 0 ? '-' : ''}${diff.toLocaleString()})`);
      });
      
      console.log('\nArchived Records:');
      Object.entries(statsAfter.archivedRecords).forEach(([collection, count]) => {
        const before = statsBefore.archivedRecords[collection] || 0;
        const diff = count - before;
        console.log(`  - ${collection}: ${count.toLocaleString()} (+${diff.toLocaleString()})`);
      });
      
      console.log(`\nTotal Space Saved: ${statsAfter.totalSpaceSaved}`);
    }

    // Recommendations
    if (isDryRun && result.totalRecordsArchived > 0) {
      logger.info('\n💡 Recommendations:');
      logger.info('  1. Review the archival breakdown above');
      logger.info('  2. If everything looks correct, run: npm run archival:run --execute');
      logger.info('  3. Monitor the first execution closely');
      logger.info('  4. Test querying archived data after archival');
      logger.info('  5. The system will auto-archive monthly at 2 AM on the 1st');
    } else if (!isDryRun && result.success) {
      logger.info('\n💡 Next Steps:');
      logger.info('  1. Verify your application still works correctly');
      logger.info('  2. Test dashboard and reports performance');
      logger.info('  3. Try querying archived data if needed');
      logger.info('  4. The system will auto-archive monthly going forward');
    }

    // Close database connection
    await mongoose.connection.close();
    logger.info('\n✓ Database connection closed');
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Archival test failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the test
testArchival();
