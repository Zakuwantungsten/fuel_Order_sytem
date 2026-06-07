/**
 * Standalone: (re)generate the R2 backup catalog (`_manifest.json`) from the
 * MongoDB Backup collection.
 *
 * The catalog is the "metadata stored separately from the data" — it lets the
 * full backup list (with rich metadata) be recovered after a total MongoDB
 * failure. It is also refreshed automatically after every backup and on server
 * startup; run this to force a refresh on demand.
 *
 *   npm run dr:manifest
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

  console.log(`📝 Writing R2 backup catalog — connecting to ${maskUri(config.mongodbUri)}`);
  await mongoose.connect(config.mongodbUri);

  await backupService.writeManifest();
  console.log('✅ R2 backup catalog (_manifest.json) regenerated from MongoDB.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: any) => {
  console.error('💥 Manifest write crashed:', err?.message || err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
