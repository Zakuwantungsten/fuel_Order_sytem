#!/usr/bin/env node

/**
 * Migration Script: Fix Stale mustChangePassword Flags
 * 
 * This script clears stale mustChangePassword flags for old users
 * who are stuck unable to login due to the MFA feature rollout.
 * 
 * Usage: npx ts-node backend/src/scripts/migrateStaleMustChangePasswordFlags.ts
 * Or:    node backend/dist-temp/scripts/migrateStaleMustChangePasswordFlags.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import {
  clearStaleMustChangePasswordFlags,
  findAffectedUsers,
  getMigrationStats,
} from '../utils/userMigration';
import { logger } from '../utils';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Run the migration
 */
async function runMigration() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  AUTH BUG FIX: Clear Stale mustChangePassword Flags        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Connect to database
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order');
    console.log('✅ Connected to MongoDB\n');

    // Get current stats before migration
    console.log('📊 Current User Statistics:');
    const beforeStats = await getMigrationStats();
    console.log(`   Total Users: ${beforeStats.totalUsers}`);
    console.log(`   Users with mustChangePassword flag: ${beforeStats.usersWithMustChangePassword}`);
    console.log(`   → Stale flags (no passwordResetAt): ${beforeStats.usersWithStaleFlags}`);
    console.log(`   → Proper flags (has passwordResetAt): ${beforeStats.usersWithProperFlags}\n`);

    if (beforeStats.usersWithStaleFlags === 0) {
      console.log('✨ No stale flags found! All users are in good state.\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Show affected users before clearing
    console.log('👥 Affected Users (will be fixed):');
    const affectedUsers = await findAffectedUsers();
    affectedUsers.slice(0, 10).forEach((user) => {
      console.log(
        `   • ${user.username} (${user.email}) - Created ${user.daysOld} days ago`
      );
    });
    if (affectedUsers.length > 10) {
      console.log(`   ... and ${affectedUsers.length - 10} more users\n`);
    } else {
      console.log();
    }

    // Run the migration
    console.log('🔧 Clearing stale flags (accounts older than 30 days)...');
    const result = await clearStaleMustChangePasswordFlags(30);

    if (result.success) {
      console.log(`✅ Migration completed successfully!\n`);
      console.log(`📝 Fixed: ${result.affectedUsers} users\n`);

      // Show details of fixed users
      if (result.details.length > 0) {
        console.log('Details:');
        result.details.slice(0, 15).forEach((detail) => {
          console.log(`   ✓ ${detail}`);
        });
        if (result.details.length > 15) {
          console.log(`   ... and ${result.details.length - 15} more\n`);
        } else {
          console.log();
        }
      }

      // Get stats after migration
      console.log('📊 Updated User Statistics:');
      const afterStats = await getMigrationStats();
      console.log(`   Total Users: ${afterStats.totalUsers}`);
      console.log(
        `   Users with mustChangePassword flag: ${afterStats.usersWithMustChangePassword}`
      );
      console.log(`   → Stale flags remaining: ${afterStats.usersWithStaleFlags}`);
      console.log(`   → Proper flags: ${afterStats.usersWithProperFlags}\n`);

      console.log(
        '✨ Migration complete! Users can now login normally.\n'
      );
    } else {
      console.log(`❌ Migration failed!\n`);
      result.errors.forEach((error) => {
        console.log(`   Error: ${error}`);
      });
      console.log();
    }
  } catch (error: any) {
    console.error(`\n❌ Fatal Error: ${error.message}\n`);
    logger.error('Migration script failed:', error);
  } finally {
    // Disconnect from database
    try {
      await mongoose.disconnect();
      console.log('👋 Disconnected from MongoDB\n');
    } catch {
      // Silent disconnect error
    }
    process.exit(0);
  }
}

// Run migration
runMigration();
