/**
 * Disaster Recovery: Offline Restore from Cloudflare R2
 *
 * Runs INDEPENDENTLY — no running backend or MongoDB connection required to start.
 * Downloads an encrypted backup from R2, decrypts and decompresses it, then
 * restores all collections into any MongoDB you point it at.
 *
 * Usage:
 *   ts-node src/scripts/restoreFromR2.ts --list
 *   ts-node src/scripts/restoreFromR2.ts --latest --target-uri mongodb://localhost:27017/fuel-order
 *   ts-node src/scripts/restoreFromR2.ts --r2-key backups/backup_2026-06-07T10-27-35-860Z.json.gz --target-uri mongodb://localhost:27017/fuel-order
 *   ts-node src/scripts/restoreFromR2.ts --r2-key <key> --target-uri <uri> --dry-run
 *
 * Environment variables (read from .env in parent dir automatically):
 *   BACKUP_ENCRYPTION_KEY   — AES-256-GCM key used when the backup was created
 *   R2_ENDPOINT             — https://<account-id>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BACKUP_BUCKET_NAME   — defaults to "fuel-order-backups"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { MongoClient, ObjectId, Binary, Long, Decimal128, Timestamp, MaxKey, MinKey } from 'mongodb';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';

// ─── Load .env manually (no dotenv dependency needed) ────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(): {
  list: boolean;
  latest: boolean;
  r2Key: string | null;
  targetUri: string | null;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  return {
    list:      args.includes('--list'),
    latest:    args.includes('--latest'),
    r2Key:     get('--r2-key'),
    targetUri: get('--target-uri'),
    dryRun:    args.includes('--dry-run'),
  };
}

// ─── R2 client ────────────────────────────────────────────────────────────────

function makeR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 credentials. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
  }
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const BUCKET = process.env.R2_BACKUP_BUCKET_NAME || 'fuel-order-backups';

// ─── Crypto helpers (mirrors cryptoUtils.ts — no import to stay standalone) ──

const SALT_LEN = 16, IV_LEN = 16, TAG_LEN = 16;

function decryptBuffer(encryptedBuffer: Buffer, encryptionKey: string): Buffer {
  if (encryptedBuffer.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('Encrypted buffer too small — may not be encrypted');
  }
  const salt    = encryptedBuffer.slice(0, SALT_LEN);
  const iv      = encryptedBuffer.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = encryptedBuffer.slice(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const data    = encryptedBuffer.slice(SALT_LEN + IV_LEN + TAG_LEN);
  const key     = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');
  const dec     = crypto.createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(authTag);
  return Buffer.concat([dec.update(data), dec.final()]);
}

// ─── Stream → Buffer ──────────────────────────────────────────────────────────

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// ─── List backups in R2 ───────────────────────────────────────────────────────

async function listR2Backups(r2: S3Client): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const results: { key: string; size: number; lastModified: Date }[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await r2.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/', ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.Key.endsWith('.json.gz')) {
        results.push({
          key: obj.Key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(0),
        });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return results.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

// ─── Extended JSON → native BSON types ───────────────────────────────────────
// Avoids bson version conflicts: all types come from the same mongodb package
// that MongoClient uses, so insertMany never sees mismatched instances.

function fromEJSON(val: any): any {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(fromEJSON);
  if ('$oid' in val) return new ObjectId(val.$oid);
  if ('$date' in val) {
    const d = val.$date;
    return new Date(typeof d === 'object' && '$numberLong' in d ? parseInt(d.$numberLong, 10) : d);
  }
  if ('$numberInt' in val) return parseInt(String(val.$numberInt), 10);
  if ('$numberDouble' in val) return parseFloat(String(val.$numberDouble));
  if ('$numberLong' in val) return Long.fromString(String(val.$numberLong));
  if ('$numberDecimal' in val) return Decimal128.fromString(String(val.$numberDecimal));
  if ('$binary' in val && val.$binary && typeof val.$binary === 'object') {
    return new Binary(Buffer.from(val.$binary.base64, 'base64'), parseInt(val.$binary.subType, 16));
  }
  if ('$timestamp' in val) return new Timestamp({ t: val.$timestamp.t, i: val.$timestamp.i });
  if ('$maxKey' in val) return new MaxKey();
  if ('$minKey' in val) return new MinKey();
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) out[k] = fromEJSON(v);
  return out;
}

// ─── Download + decrypt + decompress ─────────────────────────────────────────

async function fetchBackupData(r2: S3Client, r2Key: string): Promise<any> {
  console.log(`\n  Downloading  : ${r2Key}`);
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: r2Key }));
  let buffer = await streamToBuffer(res.Body);
  console.log(`  Downloaded   : ${(buffer.length / 1024).toFixed(1)} KB`);

  const encKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (encKey) {
    try {
      buffer = decryptBuffer(buffer, encKey);
      console.log('  Decrypted    : AES-256-GCM OK');
    } catch {
      console.log('  Decryption   : skipped (not encrypted or wrong key — trying as plain gzip)');
    }
  } else {
    console.log('  Decryption   : BACKUP_ENCRYPTION_KEY not set — assuming unencrypted');
  }

  const gunzip = promisify(zlib.gunzip);
  const decompressed = await gunzip(buffer);
  console.log(`  Decompressed : ${(decompressed.length / 1024).toFixed(1)} KB`);

  // Parse as plain JSON then convert extended-JSON markers to native BSON types
  // using mongodb's own exports — avoids bson version conflicts with MongoClient.
  const parsed = fromEJSON(JSON.parse(decompressed.toString('utf8')));
  if (!parsed.timestamp || typeof parsed.collections !== 'object') {
    throw new Error('Invalid backup JSON structure');
  }
  return parsed;
}

// ─── Restore into MongoDB ─────────────────────────────────────────────────────

async function restoreIntoMongo(backupData: any, targetUri: string, dryRun: boolean): Promise<void> {
  const collections = backupData.collections as Record<string, any[]>;
  const names = Object.keys(collections);
  const totalDocs = names.reduce((s, n) => s + (collections[n]?.length ?? 0), 0);

  console.log(`\n  Backup date  : ${backupData.timestamp}`);
  console.log(`  Collections  : ${names.length}`);
  console.log(`  Documents    : ${totalDocs}`);

  if (dryRun) {
    console.log('\n  DRY RUN — no data written. Collections that would be restored:');
    for (const name of names) {
      console.log(`    ${name.padEnd(40)} ${(collections[name]?.length ?? 0)} docs`);
    }
    return;
  }

  console.log(`\n  Target URI   : ${targetUri.replace(/:\/\/[^@]+@/, '://***@')}`);
  console.log('  Connecting to target MongoDB...');

  const client = new MongoClient(targetUri);
  await client.connect();
  console.log('  Connected.\n');

  const db = client.db();
  let restored = 0;

  try {
    for (const name of names) {
      const docs = collections[name];
      const col = db.collection(name);
      await col.deleteMany({});
      if (docs && docs.length > 0) {
        await col.insertMany(docs, { ordered: false });
      }
      console.log(`  [OK] ${name.padEnd(40)} ${docs?.length ?? 0} docs`);
      restored++;
    }
  } finally {
    await client.close();
  }

  console.log(`\n  Restored ${restored}/${names.length} collections, ${totalDocs} documents.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('');
  console.log('=================================================');
  console.log('  Fuel Order — Disaster Recovery Restore Tool');
  console.log('=================================================');

  const r2 = makeR2Client();

  // --list: print available backups and exit
  if (args.list) {
    console.log(`\nFetching backup list from R2 bucket: ${BUCKET}\n`);
    const backups = await listR2Backups(r2);
    if (backups.length === 0) {
      console.log('  No backups found in R2.');
    } else {
      console.log(`  Found ${backups.length} backup(s):\n`);
      for (const b of backups) {
        const kb = (b.size / 1024).toFixed(1).padStart(8);
        const date = b.lastModified.toISOString().replace('T', ' ').slice(0, 19);
        console.log(`  ${date}  ${kb} KB  ${b.key}`);
      }
      console.log('\n  To restore the latest:');
      console.log(`    ts-node src/scripts/restoreFromR2.ts --latest --target-uri <mongodb-uri>`);
      console.log('\n  To restore a specific backup:');
      console.log(`    ts-node src/scripts/restoreFromR2.ts --r2-key "${backups[0].key}" --target-uri <mongodb-uri>`);
    }
    return;
  }

  // Resolve which R2 key to restore
  let r2Key = args.r2Key;
  if (!r2Key) {
    if (args.latest) {
      console.log('\nFinding latest backup in R2...');
      const backups = await listR2Backups(r2);
      if (backups.length === 0) throw new Error('No backups found in R2.');
      r2Key = backups[0].key;
      console.log(`  Using latest: ${r2Key}`);
    } else {
      console.error('\nError: specify --r2-key <key>, --latest, or --list');
      console.error('\nExamples:');
      console.error('  ts-node src/scripts/restoreFromR2.ts --list');
      console.error('  ts-node src/scripts/restoreFromR2.ts --latest --target-uri mongodb://localhost:27017/fuel-order');
      console.error('  ts-node src/scripts/restoreFromR2.ts --r2-key backups/backup_xxx.json.gz --target-uri mongodb://localhost:27017/fuel-order');
      process.exit(1);
    }
  }

  if (!args.targetUri && !args.dryRun) {
    console.error('\nError: --target-uri is required unless using --dry-run');
    process.exit(1);
  }

  if (args.dryRun) {
    console.log('\n  Mode: DRY RUN (no data will be written)');
  } else {
    console.log('\n  Mode: LIVE RESTORE');
    console.log('  WARNING: This will DELETE all existing data in the target database.');
    console.log('  Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(r => setTimeout(r, 5000));
  }

  const backupData = await fetchBackupData(r2, r2Key);
  await restoreIntoMongo(backupData, args.targetUri ?? 'dry-run', args.dryRun);

  console.log('\n  DONE.\n');
}

main().catch(err => {
  console.error('\n  FATAL:', err.message);
  process.exit(1);
});
