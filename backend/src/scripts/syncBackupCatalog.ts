/**
 * Standalone: rebuild the MongoDB backup catalog from the R2 manifest.
 *
 * Use after migrating to a fresh/empty database so the Backup & Recovery UI
 * shows the real backup history again. Idempotent (upsert by R2 key).
 *
 *   npm run dr:sync
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

  console.log(`🔄 Rebuilding backup catalog — connecting to ${maskUri(config.mongodbUri)}`);
  await mongoose.connect(config.mongodbUri);

  const result = await backupService.rebuildBackupCollectionFromR2('cli-sync');
  console.log(
    `✅ Rebuilt backup catalog from R2 (${result.source}): ${result.restored} record(s) upserted into MongoDB.`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: any) => {
  console.error('💥 Sync crashed:', err?.message || err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
