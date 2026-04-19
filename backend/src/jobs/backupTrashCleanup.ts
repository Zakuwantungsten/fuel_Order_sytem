/**
 * Backup Trash Cleanup Job  (LE-3)
 *
 * Runs every day at 03:00 UTC and permanently removes all soft-deleted
 * backup records (status = 'deleted') whose deletedAt timestamp is older
 * than BACKUP_TRASH_RETENTION_DAYS (default: 7 days).
 *
 * For each qualifying record the corresponding Cloudflare R2 object is
 * deleted first, then the MongoDB document is removed.
 */

import backupService from '../services/backupService';
import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

const TRASH_RETENTION_DAYS = parseInt(process.env.BACKUP_TRASH_RETENTION_DAYS ?? '7', 10);

async function runBackupTrashCleanupHandler(): Promise<void> {
  logger.info('[BACKUP TRASH CLEANUP] Starting…');

  const purged = await backupService.purgeDeletedBackups(TRASH_RETENTION_DAYS);

  logger.info(`[BACKUP TRASH CLEANUP] Permanently deleted ${purged} backup(s) from trash (older than ${TRASH_RETENTION_DAYS} days).`);
}

// Register with the central job registry — runs every day at 03:00 UTC
jobRegistry.register({
  id: 'backup-trash-cleanup',
  name: 'Backup Trash Cleanup',
  description: `Permanently deletes soft-deleted backup files (from R2 and MongoDB) that have been in the trash for more than ${TRASH_RETENTION_DAYS} days.`,
  cronExpression: '0 3 * * *',
  isEnabled: true,
  handler: runBackupTrashCleanupHandler,
});
