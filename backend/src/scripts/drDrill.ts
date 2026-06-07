/**
 * Standalone Disaster Recovery Drill (CLI)
 *
 * Restores the latest backup into an ISOLATED scratch database on the configured
 * cluster, verifies the document counts match, then drops the scratch database.
 * Never touches live data.
 *
 *   npm run dr:drill
 *
 * Exit code 0 = drill passed, 1 = drill failed.
 */
import mongoose from 'mongoose';
import { config } from '../config';
import backupService from '../services/backupService';

function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

async function main(): Promise<void> {
  if (!config.mongodbUri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  console.log(`🧪 DR Drill — connecting to ${maskUri(config.mongodbUri)}`);
  await mongoose.connect(config.mongodbUri);
  console.log('✅ Connected. Restoring the latest backup into an isolated scratch DB…\n');

  const report = await backupService.runDisasterRecoveryDrill('cli-drill');

  console.log('\n=== DR DRILL REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  console.log(
    report.passed
      ? '\n✅ PASSED — your latest backup is restorable.'
      : '\n❌ FAILED — investigate immediately.',
  );

  await mongoose.disconnect();
  process.exit(report.passed ? 0 : 1);
}

main().catch(async (err: any) => {
  console.error('💥 Drill crashed:', err?.message || err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
