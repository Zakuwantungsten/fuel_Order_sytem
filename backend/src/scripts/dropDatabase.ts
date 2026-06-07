/**
 * Drop a (restored) database to reclaim disk space after a safe-restore cutover.
 * Guards against dropping the database your .env currently points at.
 *
 *   npm run dr:drop-db -- --name fuel-order_restored_2026-06-07T13-00-00-000Z
 *   npm run dr:drop-db -- --name <db> --yes      (skip the 5s countdown)
 */
import mongoose from 'mongoose';
import { config } from '../config';

function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

function liveDbName(uri: string): string {
  const m = uri.match(/\/\/[^/]+\/([^?]+)/);
  return m ? m[1] : '';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const i = args.indexOf('--name');
  const name = i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  const yes = args.includes('--yes');

  if (!name) {
    console.error('❌ Provide --name <database>');
    process.exit(1);
  }
  if (!config.mongodbUri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }
  if (name === liveDbName(config.mongodbUri)) {
    console.error(`❌ Refusing to drop "${name}" — it is the database MONGODB_URI currently points at.`);
    process.exit(1);
  }

  console.log(`🔄 Connecting to ${maskUri(config.mongodbUri)}`);
  await mongoose.connect(config.mongodbUri);

  console.log(`⚠  About to DROP database "${name}". This is irreversible.`);
  if (!yes) {
    console.log('   Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(r => setTimeout(r, 5000));
  }

  const target = mongoose.connection.useDb(name, { useCache: false });
  await target.dropDatabase();
  console.log(`✅ Dropped database "${name}".`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: any) => {
  console.error('💥 Drop failed:', err?.message || err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
