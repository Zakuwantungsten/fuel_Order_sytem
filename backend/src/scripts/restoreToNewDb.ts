/**
 * SAFE restore (blue/green-lite): restore an R2 backup into a NEW database on
 * the SAME cluster, leaving the live database completely untouched. Verify the
 * printed counts, then "cut over" by pointing MONGODB_URI at the new database
 * name and restarting the backend. Roll back by pointing it back.
 *
 * A new database is just a logical namespace on the same cluster — no new
 * server, only temporary disk for the copy (reclaim it with `npm run dr:drop-db`).
 *
 *   npm run dr:restore-new -- --latest
 *   npm run dr:restore-new -- --r2-key backups/backup_xxx.json.gz
 *   npm run dr:restore-new -- --latest --name fuel-order_restored_test
 *   npm run dr:restore-new -- --secondary --latest --name fuel-order_b2_restore
 */
import mongoose from 'mongoose';
import { config } from '../config';
import backupService from '../services/backupService';

function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

/** Swap the database name in a Mongo connection string (for the cutover hint). */
function withDbName(uri: string, dbName: string): string {
  // mongodb+srv://user:pass@host/<dbName>?opts  — replace the path segment
  return uri.replace(/(\/\/[^/]+\/)([^?]*)(\?.*)?$/, (_m, head, _old, query = '') => `${head}${dbName}${query || ''}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };
  const r2KeyArg = get('--r2-key');
  const latest = args.includes('--latest');
  const name = get('--name') || undefined;
  const source = args.includes('--secondary') ? 'secondary' : 'auto';

  if (!config.mongodbUri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  console.log(`🔄 Safe restore — connecting to ${maskUri(config.mongodbUri)}`);
  console.log(
    source === 'secondary'
      ? '   Backup source: SECONDARY ONLY (primary R2 will not be contacted)'
      : '   Backup source: automatic primary → secondary failover'
  );
  await mongoose.connect(config.mongodbUri);

  let r2Key = r2KeyArg;
  if (!r2Key && latest) {
    const files = await backupService.listR2Backups(source);
    if (!files.length) {
      throw new Error(source === 'secondary' ? 'No backups found in secondary storage' : 'No backups found');
    }
    r2Key = files[0].key;
    console.log(`   Using latest backup: ${r2Key}`);
  }
  if (!r2Key) {
    console.error('❌ Provide --r2-key <key> or --latest');
    await mongoose.disconnect();
    process.exit(1);
  }

  const result = await backupService.restoreToNewDb(r2Key, 'cli-safe-restore', name, source);

  console.log('\n✅ Safe restore complete (live data untouched):');
  console.log(`   New database : ${result.dbName}`);
  console.log(`   Collections  : ${result.collections}`);
  console.log(`   Documents    : ${result.documents}`);
  console.log(`   Business docs: ${result.businessDocuments}`);

  console.log('\n👉 To go live (cut over):');
  console.log(`   Set MONGODB_URI to:\n     ${maskUri(withDbName(config.mongodbUri, result.dbName))}`);
  console.log('   then restart the backend (e.g. `docker compose restart backend`).');
  console.log('\n↩  To roll back: point MONGODB_URI back to the original database name and restart.');
  console.log(`🧹 To reclaim space later: npm run dr:drop-db -- --name ${result.dbName}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: any) => {
  console.error('💥 Safe restore failed:', err?.message || err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
