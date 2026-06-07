/**
 * Disaster Recovery: delete backup object(s) directly from Cloudflare R2.
 *
 * Standalone — no running backend or MongoDB connection required. Useful for
 * pruning bad/empty test backups that pollute the catalog. Deletes from the
 * primary R2 bucket and (best-effort) the secondary destination if configured.
 *
 * Usage:
 *   ts-node src/scripts/deleteR2Backup.ts --r2-key backups/backup_xxx.json.gz
 *   ts-node src/scripts/deleteR2Backup.ts --r2-key <key1> --r2-key <key2> --yes
 *   ts-node src/scripts/deleteR2Backup.ts --r2-key <key> --dry-run
 *
 * Flags:
 *   --r2-key <key>   object key to delete (repeatable)
 *   --yes            skip the 5-second safety countdown
 *   --dry-run        print what would be deleted without deleting
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
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

function parseArgs(): { keys: string[]; yes: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  const keys: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--r2-key' && i + 1 < args.length) {
      keys.push(args[i + 1]);
      i++;
    }
  }
  return { keys, yes: args.includes('--yes'), dryRun: args.includes('--dry-run') };
}

// ─── Clients ──────────────────────────────────────────────────────────────────

const PRIMARY_BUCKET = process.env.R2_BACKUP_BUCKET_NAME || 'fuel-order-backups';

function makePrimaryClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 credentials. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
  }
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
}

function makeSecondaryClient(): { client: S3Client; bucket: string } | null {
  const bucket = process.env.R2_BACKUP_BUCKET_NAME_SECONDARY;
  const endpoint = process.env.R2_SECONDARY_ENDPOINT || process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_SECONDARY_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECONDARY_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
  const region = process.env.R2_SECONDARY_REGION || 'auto';
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { client: new S3Client({ region, endpoint, credentials: { accessKeyId, secretAccessKey } }), bucket };
}

async function exists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { keys, yes, dryRun } = parseArgs();

  console.log('');
  console.log('=================================================');
  console.log('  Fuel Order — Delete R2 Backup(s)');
  console.log('=================================================');

  if (keys.length === 0) {
    console.error('\nError: provide at least one --r2-key <key>');
    console.error('  ts-node src/scripts/deleteR2Backup.ts --r2-key backups/backup_xxx.json.gz');
    process.exit(1);
  }

  const primary = makePrimaryClient();
  const secondary = makeSecondaryClient();

  console.log(`\n  Primary bucket : ${PRIMARY_BUCKET}`);
  console.log(`  Secondary      : ${secondary ? secondary.bucket : '(none configured)'}`);
  console.log(`  Keys to delete : ${keys.length}`);
  for (const k of keys) console.log(`    - ${k}`);

  if (dryRun) {
    console.log('\n  DRY RUN — nothing deleted.');
    return;
  }

  if (!yes) {
    console.log('\n  WARNING: this permanently deletes the listed objects from R2.');
    console.log('  Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(r => setTimeout(r, 5000));
  }

  let deleted = 0;
  for (const key of keys) {
    // Primary
    try {
      const present = await exists(primary, PRIMARY_BUCKET, key);
      if (!present) {
        console.log(`  [skip] not found in primary: ${key}`);
      } else {
        await primary.send(new DeleteObjectCommand({ Bucket: PRIMARY_BUCKET, Key: key }));
        console.log(`  [OK]   deleted from primary : ${key}`);
        deleted++;
      }
    } catch (err: any) {
      console.error(`  [ERR]  primary delete failed for ${key}: ${err?.message}`);
    }

    // Secondary (best-effort)
    if (secondary) {
      try {
        await secondary.client.send(new DeleteObjectCommand({ Bucket: secondary.bucket, Key: key }));
        console.log(`  [OK]   deleted from secondary: ${key}`);
      } catch (err: any) {
        console.log(`  [warn] secondary delete skipped for ${key}: ${err?.message}`);
      }
    }
  }

  console.log(`\n  Done. ${deleted} object(s) deleted from primary.`);
  console.log('  Note: run "npm run dr:manifest" (or reload the Backup & Recovery tab) to refresh the catalog.\n');
}

main().catch(err => {
  console.error('\n  FATAL:', err.message);
  process.exit(1);
});
