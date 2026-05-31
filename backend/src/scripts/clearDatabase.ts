import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import {
  User,
  DeliveryOrder,
  LPOSummary,
  LPOWorkbook,
  FuelRecord,
  YardFuelDispense,
  SystemConfig,
  DriverAccountEntry,
  DriverCredential,
  AuditLog,
  Notification,
  ArchivedFuelRecord,
  ArchivedLPOSummary,
  ArchivedYardFuelDispense,
  ArchivedAuditLog,
  ArchivalMetadata,
} from '../models';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const clearDatabase = async () => {
  try {
    // Check for --force flag
    const forceMode = process.argv.includes('--force');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    // Get collection counts before deletion
    console.log('📊 Current database statistics:');
    const stats = {
      Users: await User.countDocuments(),
      DeliveryOrders: await DeliveryOrder.countDocuments(),
      LPOSummaries: await LPOSummary.countDocuments(),
      LPOWorkbooks: await LPOWorkbook.countDocuments(),
      FuelRecords: await FuelRecord.countDocuments(),
      YardFuelDispenses: await YardFuelDispense.countDocuments(),
      SystemConfigs: await SystemConfig.countDocuments(),
      DriverAccountEntries: await DriverAccountEntry.countDocuments(),
      DriverCredentials: await DriverCredential.countDocuments(),
      AuditLogs: await AuditLog.countDocuments(),
      Notifications: await Notification.countDocuments(),
      ArchivedFuelRecords: await ArchivedFuelRecord.countDocuments(),
      ArchivedLPOSummaries: await ArchivedLPOSummary.countDocuments(),
      ArchivedYardFuelDispenses: await ArchivedYardFuelDispense.countDocuments(),
      ArchivedAuditLogs: await ArchivedAuditLog.countDocuments(),
      ArchivalMetadata: await ArchivalMetadata.countDocuments(),
    };

    let totalRecords = 0;
    Object.entries(stats).forEach(([collection, count]) => {
      console.log(`  - ${collection}: ${count}`);
      totalRecords += count;
    });
    console.log(`\n📈 Total records: ${totalRecords}\n`);

    if (totalRecords === 0) {
      console.log('✨ Database is already empty!');
      await mongoose.connection.close();
      rl.close();
      return;
    }

    // Confirmation prompt (skip if --force flag is used)
    if (!forceMode) {
      console.log('⚠️  WARNING: This will permanently delete ALL records from the database!');
      console.log('⚠️  This action CANNOT be undone!\n');

      const answer = await question('Are you sure you want to continue? (yes/no): ');

      if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Operation cancelled.');
        await mongoose.connection.close();
        rl.close();
        return;
      }

      const confirmAnswer = await question('\nPlease type "DELETE ALL" to confirm: ');

      if (confirmAnswer !== 'DELETE ALL') {
        console.log('\n❌ Operation cancelled.');
        await mongoose.connection.close();
        rl.close();
        return;
      }
    } else {
      console.log('⚡ Force mode enabled - skipping confirmations\n');
    }

    console.log('\n🗑️  Deleting all records...\n');

    // Delete all records from each collection
    const deletionResults = {
      Users: await User.deleteMany({}),
      DeliveryOrders: await DeliveryOrder.deleteMany({}),
      LPOSummaries: await LPOSummary.deleteMany({}),
      LPOWorkbooks: await LPOWorkbook.deleteMany({}),
      FuelRecords: await FuelRecord.deleteMany({}),
      YardFuelDispenses: await YardFuelDispense.deleteMany({}),
      SystemConfigs: await SystemConfig.deleteMany({}),
      DriverAccountEntries: await DriverAccountEntry.deleteMany({}),
      DriverCredentials: await DriverCredential.deleteMany({}),
      AuditLogs: await AuditLog.deleteMany({}),
      Notifications: await Notification.deleteMany({}),
      ArchivedFuelRecords: await ArchivedFuelRecord.deleteMany({}),
      ArchivedLPOSummaries: await ArchivedLPOSummary.deleteMany({}),
      ArchivedYardFuelDispenses: await ArchivedYardFuelDispense.deleteMany({}),
      ArchivedAuditLogs: await ArchivedAuditLog.deleteMany({}),
      ArchivalMetadata: await ArchivalMetadata.deleteMany({}),
    };

    console.log('✅ Deletion complete!\n');
    console.log('📊 Deleted records:');
    let totalDeleted = 0;
    Object.entries(deletionResults).forEach(([collection, result]) => {
      console.log(`  - ${collection}: ${result.deletedCount}`);
      totalDeleted += result.deletedCount || 0;
    });
    console.log(`\n🎯 Total records deleted: ${totalDeleted}\n`);

    // Verify deletion
    console.log('🔍 Verifying database is empty...');
    const remainingRecords = await Promise.all([
      User.countDocuments(),
      DeliveryOrder.countDocuments(),
      LPOSummary.countDocuments(),
      LPOWorkbook.countDocuments(),
      FuelRecord.countDocuments(),
      YardFuelDispense.countDocuments(),
      SystemConfig.countDocuments(),
      DriverAccountEntry.countDocuments(),
      DriverCredential.countDocuments(),
      AuditLog.countDocuments(),
      Notification.countDocuments(),
      ArchivedFuelRecord.countDocuments(),
      ArchivedLPOSummary.countDocuments(),
      ArchivedYardFuelDispense.countDocuments(),
      ArchivedAuditLog.countDocuments(),
      ArchivalMetadata.countDocuments(),
    ]);

    const totalRemaining = remainingRecords.reduce((sum, count) => sum + count, 0);

    if (totalRemaining === 0) {
      console.log('✅ Database successfully cleared! All records have been deleted.\n');
    } else {
      console.log(`⚠️  Warning: ${totalRemaining} records still remain in the database.\n`);
    }

    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    rl.close();
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    await mongoose.connection.close();
    rl.close();
    process.exit(1);
  }
};

clearDatabase();
