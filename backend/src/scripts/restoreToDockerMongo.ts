/**
 * Restore a cloud backup into the Docker dev MongoDB (docker-compose.dev.yml).
 *
 * Host port 27018 maps to the mongo container (avoids Windows MongoDB on 27017).
 * Database name: fuel-order-dev (matches backend override in docker-compose.dev.yml).
 *
 * Usage (from backend/):
 *   npm run dr:restore:docker              # latest from primary R2
 *   npm run dr:restore:docker:b2           # latest from Backblaze B2
 *   npm run dr:restore:docker -- --r2-key backups/backup_xxx.json.gz
 *   npm run dr:restore:docker:b2 -- --r2-key backups/backup_xxx.json.gz
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mongo
 *   backend/.env must contain backup/R2 credentials (never commit this file)
 */

import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import backupService from '../services/backupService';

const DOCKER_MONGO_HOST = process.env.DOCKER_MONGO_HOST || '127.0.0.1';
const DOCKER_MONGO_PORT = process.env.DOCKER_MONGO_PORT || '27018';
const DOCKER_DB_NAME = process.env.DOCKER_DB_NAME || 'fuel-order-dev';
const DOCKER_TARGET_URI = `mongodb://${DOCKER_MONGO_HOST}:${DOCKER_MONGO_PORT}/${DOCKER_DB_NAME}`;
const DOCKER_SCRATCH_URI = `mongodb://${DOCKER_MONGO_HOST}:${DOCKER_MONGO_PORT}/fuel-order-restore-scratch`;

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

async function resolveLatestKey(source: 'auto' | 'secondary'): Promise<string> {
  const files = await backupService.listR2Backups(source);
  if (!files.length) {
    throw new Error(
      source === 'secondary' ? 'No backups found in secondary storage' : 'No backups found'
    );
  }
  return files[0].key;
}

async function restoreViaPrimaryR2(r2Key: string): Promise<void> {
  const script = path.resolve(__dirname, 'restoreFromR2.ts');
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('ts-node/register/transpile-only'),
      script,
      '--r2-key',
      r2Key,
      '--target-uri',
      DOCKER_TARGET_URI,
    ],
    { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') }
  );
  if (result.status !== 0) {
    throw new Error('Primary restore failed — see output above');
  }
}

async function restoreViaSecondary(r2Key: string): Promise<void> {
  process.env.MONGODB_URI = DOCKER_SCRATCH_URI;
  await mongoose.connect(DOCKER_SCRATCH_URI);
  try {
    const result = await backupService.restoreToNewDb(
      r2Key,
      'docker-dev-restore',
      DOCKER_DB_NAME,
      'secondary'
    );
    console.log('\n  Restore complete:');
    console.log(`    Database     : ${result.dbName}`);
    console.log(`    Collections  : ${result.collections}`);
    console.log(`    Documents    : ${result.documents}`);
    console.log(`    Business docs: ${result.businessDocuments}`);
  } finally {
    await mongoose.disconnect();
  }
}

async function main(): Promise<void> {
  loadEnv();

  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };
  const secondary = args.includes('--secondary');
  const r2KeyArg = get('--r2-key');
  const useLatest = args.includes('--latest') || !r2KeyArg;

  console.log('');
  console.log('=================================================');
  console.log('  Restore backup → Docker dev MongoDB');
  console.log('=================================================');
  console.log(`  Target URI : ${DOCKER_TARGET_URI.replace(/\/\/([^/]+)/, '//***')}`);
  console.log(`  Source     : ${secondary ? 'Backblaze B2 (secondary)' : 'Cloudflare R2 (primary)'}`);
  console.log('  Atlas/production is NOT touched.\n');

  const r2Key = r2KeyArg || (useLatest ? await resolveLatestKey(secondary ? 'secondary' : 'auto') : null);
  if (!r2Key) throw new Error('Provide --r2-key or use --latest');

  console.log(`  Backup key : ${r2Key}`);

  if (secondary) {
    await restoreViaSecondary(r2Key);
  } else {
    await restoreViaPrimaryR2(r2Key);
  }

  console.log('\n  Next: docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build');
  console.log(`  Compass: mongodb://${DOCKER_MONGO_HOST}:${DOCKER_MONGO_PORT}\n`);
}

main().catch((err: any) => {
  console.error('\n  FATAL:', err?.message || err);
  process.exit(1);
});
