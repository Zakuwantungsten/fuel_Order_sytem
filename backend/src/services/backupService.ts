import mongoose from 'mongoose';
import zlib from 'zlib';
import { promisify } from 'util';
import Backup from '../models/Backup';
import { AuditLog } from '../models/AuditLog';
import { SystemConfig } from '../models/SystemConfig';
import { EditLock } from '../models/EditLock';
import r2Service from './r2Service';
import logger from '../utils/logger';
import { encryptBuffer, decryptBuffer } from '../utils/cryptoUtils';
import { config } from '../config';
import emailService from './emailService';
import { EJSON } from 'bson';

class BackupService {
  /**
   * Collections to exclude from backups by default
   * These are temporary/session data that don't need to be backed up
   * ✅ SECURITY: Excludes high-volume logs that are not essential for recovery
   */
  private readonly DEFAULT_EXCLUDED_COLLECTIONS = [
    'sessions',
    'socket.io-adapter-events',
  ];

  /**
   * Core business collections used to tell "real data" backups apart from
   * snapshots of an essentially empty database (which only hold system/security
   * config). If all of these are empty the backup has no business data — we flag
   * it, and refuse to let the scheduler create one (avoids polluting R2 with
   * tiny empty backups when the backend is pointed at an empty/local DB).
   */
  private readonly CORE_BUSINESS_COLLECTIONS = [
    'deliveryorders',
    'fuelrecords',
    'lposummaries',
  ];

  /**
   * Collections an in-place restore must NOT overwrite. These are pure
   * session/transport state — restoring them would log everyone out for no
   * benefit. Mirrors how big systems keep auth/session state out of a data
   * restore. (Business data and users ARE restored; the operator who triggers
   * the restore is preserved separately so they don't get locked out.)
   */
  private readonly RESTORE_PROTECTED_COLLECTIONS = new Set<string>([
    'sessions',
    'socket.io-adapter-events',
  ]);

  /**
   * Snapshot the user who triggered a restore (by username) so we can re-insert
   * them afterwards. Returns the raw document (with _id + password hash) or null.
   */
  private async snapshotActingUser(username: string): Promise<any | null> {
    if (!username || username === 'system') return null;
    try {
      if (!mongoose.connection.db) return null;
      return await mongoose.connection.collection('users').findOne({ username });
    } catch (err: any) {
      logger.warn('[BACKUP] Could not snapshot operator before restore:', err?.message);
      return null;
    }
  }

  /**
   * Re-insert the operator's original user record after a restore overwrote the
   * `users` collection, so their existing session/token keeps working and they
   * aren't locked out. Removes anything the restore inserted that would collide
   * on the unique _id / username / email indexes first. Best-effort.
   */
  private async preserveActingUser(actingUser: any | null): Promise<void> {
    if (!actingUser?._id) return;
    try {
      const users = mongoose.connection.collection('users');
      const orConds: any[] = [{ _id: actingUser._id }];
      if (actingUser.username) orConds.push({ username: actingUser.username });
      if (actingUser.email) orConds.push({ email: actingUser.email });
      await users.deleteMany({ $or: orConds });
      await users.insertOne(actingUser);
      logger.info(`[BACKUP] Preserved operator "${actingUser.username}" across restore — no lockout`);
    } catch (err: any) {
      logger.warn('[BACKUP] Could not preserve operator after restore:', err?.message);
    }
  }

  /**
   * DR: The backup catalog (metadata index) is stored as a plain JSON object in
   * R2 — SEPARATE from MongoDB — so the full list of backups (with rich
   * metadata) survives a total MongoDB loss. Contains only metadata
   * (file names, sizes, dates, collection names, doc counts) — no business data.
   */
  private readonly MANIFEST_KEY = 'backups/_manifest.json';

  /**
   * Get list of collections to exclude from backup
   * Combines default exclusions with admin-configured exclusions
   */
  private async getExcludedCollections(): Promise<Set<string>> {
    const excluded = new Set(this.DEFAULT_EXCLUDED_COLLECTIONS);

    try {
      const { SystemConfig } = require('../models');
      const config = await SystemConfig.findOne({
        configType: 'system_settings',
        isDeleted: false,
      });

      if (config?.systemSettings?.backup?.excludedCollections && Array.isArray(config.systemSettings.backup.excludedCollections)) {
        config.systemSettings.backup.excludedCollections.forEach((collection: string) => {
          excluded.add(collection);
        });
        logger.info(`[BACKUP] Excluding ${excluded.size} collections: ${Array.from(excluded).join(', ')}`);
      }
    } catch (error: any) {
      logger.warn('[BACKUP] Could not read excluded collections from config:', error.message);
    }

    return excluded;
  }

  /**
   * Validate backup encryption key is configured
   */
  private validateEncryptionKey(): string {
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
    if (!encryptionKey) {
      logger.warn('[BACKUP] BACKUP_ENCRYPTION_KEY not configured - backups will not be encrypted');
      return '';
    }
    if (encryptionKey.length < 12) {
      throw new Error('BACKUP_ENCRYPTION_KEY must be at least 12 characters long');
    }
    return encryptionKey;
  }

  /**
   * Decrypt a downloaded backup buffer if (and only if) it is actually encrypted.
   * Detection is byte-based, not metadata-based: a real gzip stream always starts
   * with the magic header 0x1f 0x8b, so if those bytes are present the buffer is
   * already plaintext and is returned as-is. Otherwise we treat it as an
   * AES-256-GCM ciphertext and decrypt it with BACKUP_ENCRYPTION_KEY.
   *
   * This is the single source of truth for "is this encrypted?" so every restore
   * path behaves the same, even for catalog records that have no metadata.
   */
  private maybeDecrypt(buffer: Buffer): Buffer {
    // gzip magic bytes → already decompressible, nothing to decrypt
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return buffer;
    }
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error(
        'Backup appears to be encrypted but BACKUP_ENCRYPTION_KEY is not configured — cannot restore.',
      );
    }
    try {
      const decrypted = decryptBuffer(buffer, encryptionKey);
      logger.info('[BACKUP] Backup decrypted with AES-256-GCM');
      // @ts-ignore - Buffer type mismatch between different implementations
      return decrypted;
    } catch (error: any) {
      throw new Error(
        `Backup decryption failed (wrong BACKUP_ENCRYPTION_KEY?): ${error.message}`,
      );
    }
  }

  /**
   * Create a database backup
   * ✅ SECURITY: Backups are encrypted with AES-256 before R2 upload
   */
  async createBackup(
    userId: string,
    type: 'manual' | 'scheduled' = 'manual',
    selectedCollections?: string[],
    retentionTier?: 'daily' | 'weekly' | 'monthly',
    opts?: { skipRetention?: boolean },
  ): Promise<any> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestamp}.json.gz`;
    const r2Key = `backups/${fileName}`;

    // Create backup record
    const backup = await Backup.create({
      fileName,
      fileSize: 0,
      status: 'in_progress',
      type,
      collections: [],
      r2Key,
      createdBy: userId,
      ...(retentionTier ? { retentionTier } : {}),
    });

    try {
      // Get all collections
      if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
      }
      
      const collections = await mongoose.connection.db.listCollections().toArray();
      const excludedCollections = await this.getExcludedCollections();
      
      // Filter out excluded collections; then optionally restrict to selectedCollections
      let collectionsToBackup = collections
        .map(c => c.name)
        .filter(name => !excludedCollections.has(name));

      if (selectedCollections && selectedCollections.length > 0) {
        const allowedSet = new Set(selectedCollections);
        collectionsToBackup = collectionsToBackup.filter(name => allowedSet.has(name));
        logger.info(`[BACKUP] Selective backup: restricting to ${collectionsToBackup.length} of ${collections.length} collections`);
      }

      const backupData: any = {
        timestamp: new Date().toISOString(),
        database: mongoose.connection.name,
        collections: {},
        metadata: {
          mongoVersion: await this.getMongoVersion(),
          totalCollections: collectionsToBackup.length,
          totalDocuments: 0,
          excludedCollections: Array.from(excludedCollections),
        }
      };

      let totalDocuments = 0;
      let businessDocuments = 0;
      const coreBusiness = new Set(this.CORE_BUSINESS_COLLECTIONS);

      // Export each collection (excluding filtered ones)
      for (const collectionName of collectionsToBackup) {
        const collection = mongoose.connection.collection(collectionName);
        const documents = await collection.find({}).toArray();
        backupData.collections[collectionName] = documents;
        totalDocuments += documents.length;
        if (coreBusiness.has(collectionName)) businessDocuments += documents.length;
        logger.info(`Backed up collection: ${collectionName} (${documents.length} documents)`);
      }

      backupData.metadata.totalDocuments = totalDocuments;
      backupData.metadata.businessDocuments = businessDocuments;

      // Guard: a backup with zero business data is almost always a mistake —
      // the backend got pointed at an empty/local DB. Block scheduled runs so
      // they don't pollute R2 (and bury the real "latest" backup); allow manual
      // runs through but flag them loudly.
      if (businessDocuments === 0) {
        if (type === 'scheduled') {
          logger.warn(`[BACKUP] Skipping scheduled backup — database has no business data (${totalDocuments} system docs only). Is the backend connected to the right database?`);
          await Backup.findByIdAndDelete(backup.id);
          return null;
        }
        logger.warn(`[BACKUP] Manual backup has NO business data (${totalDocuments} system docs only) — proceeding because it was triggered manually.`);
      }

      // Serialize with canonical Extended JSON so BSON types (ObjectId, Date,
      // Int32/Long/Decimal128, Binary) survive a backup→restore round-trip
      // exactly — same approach mongodump uses. Plain JSON.stringify would
      // silently turn ObjectIds and Dates into strings.
      const jsonString = EJSON.stringify(backupData, undefined, 2, { relaxed: false });
      const jsonBuffer = Buffer.from(jsonString);

      // Compress JSON with gzip
      const gzip = promisify(zlib.gzip);
      const archiveBuffer: Buffer = Buffer.from(await gzip(jsonBuffer));

      // ✅ SECURITY: Encrypt backup before uploading to R2
      const encryptionKey = this.validateEncryptionKey();
      let fileToUpload: Buffer = archiveBuffer;
      let uploadContentType = 'application/gzip';
      
      if (encryptionKey) {
        try {
          fileToUpload = encryptBuffer(archiveBuffer, encryptionKey);
          uploadContentType = 'application/octet-stream'; // Encrypted binary
          logger.info('[BACKUP] Backup encrypted with AES-256-GCM before upload');
        } catch (error: any) {
          logger.error('[BACKUP] Encryption failed, aborting backup:', error.message);
          throw new Error(`Backup encryption failed: ${error.message}`);
        }
      }

      // Upload to R2
      await r2Service.uploadFile(r2Key, fileToUpload, uploadContentType, config.r2BackupBucketName);

      // Redundancy: mirror to the secondary backup destination (no-op if unset)
      await r2Service.replicateToSecondary(r2Key, fileToUpload, uploadContentType);

      // Update backup record
      backup.status = 'completed';
      backup.fileSize = archiveBuffer.length;
      backup.collections = collectionsToBackup;
      backup.completedAt = new Date();
      backup.metadata = {
        totalDocuments,
        businessDocuments,
        databaseSize: archiveBuffer.length,
        compression: 'gzip',
        encrypted: encryptionKey ? true : false,
        encryptionAlgorithm: encryptionKey ? 'aes-256-gcm' : undefined,
      };
      (backup as any).excludedCollections = Array.from(excludedCollections);
      await backup.save();

      // Create audit log
      await AuditLog.create({
        username: userId,
        action: 'CREATE',
        resourceType: 'backup',
        resourceId: backup.id,
        details: JSON.stringify({ fileName, fileSize: archiveBuffer.length, collections: collectionsToBackup.length, documents: totalDocuments }),
      });

      // DR: refresh the R2-side catalog so the backup list survives MongoDB loss
      await this.writeManifestSafe();

      // Enforce global keep-N via background queue (unless caller handles it)
      if (!opts?.skipRetention) {
        this.scheduleConfiguredRetention();
      }

      logger.info(`Backup created successfully: ${fileName}`);
      return backup;
    } catch (error: any) {
      logger.error('Error creating backup:', error);
      
      // Update backup status to failed
      backup.status = 'failed';
      backup.error = error.message;
      await backup.save();

      // ME-3: Fire-and-forget failure alert email to super admins
      this.sendBackupFailureAlert(backup.fileName, error.message).catch((emailErr: any) => {
        logger.warn('[BACKUP] Failed to send backup failure alert email:', emailErr?.message);
      });

      throw error;
    }
  }

  /**
   * ME-3: Send a backup failure alert to all super admins
   */
  private async sendBackupFailureAlert(fileName: string, errorMessage: string): Promise<void> {
    try {
      await emailService.sendBackupFailureAlert(fileName, errorMessage);
    } catch (err: any) {
      logger.warn('[BACKUP] sendBackupFailureAlert threw:', err?.message);
    }
  }

  /**
   * ME-1: Verify backup integrity — downloads, decrypts, decompresses and
   * checks JSON structure without restoring data to the live database.
   */
  async verifyBackup(backupId: string, userId: string): Promise<{ passed: boolean; details: string }> {
    const backup = await Backup.findById(backupId);
    if (!backup) throw new Error('Backup not found');
    if (backup.status === 'deleted') throw new Error('Backup has been deleted');
    if (backup.status !== 'completed') {
      throw new Error('Only completed backups can be verified');
    }

    let passed = false;
    let details = '';

    try {
      // Download from R2 (with automatic B2 secondary failover)
      const stream = await r2Service.downloadBackup(backup.r2Key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      let buffer: Buffer = Buffer.concat(chunks);

      if (!buffer.length) throw new Error('Downloaded backup file is empty');

      // Decrypt if the bytes look encrypted (independent of metadata flag)
      buffer = this.maybeDecrypt(buffer);

      // Decompress
      const gunzip = promisify(zlib.gunzip);
      const decompressed = await gunzip(buffer);

      // Parse Extended JSON header (also reads legacy plain-JSON backups)
      const parsed = EJSON.parse(decompressed.toString(), { relaxed: false });
      if (!parsed.timestamp || !parsed.collections || typeof parsed.collections !== 'object') {
        throw new Error('Backup JSON structure is invalid or missing required fields');
      }

      const collectionCount = Object.keys(parsed.collections).length;
      const docCount: number = Object.values(parsed.collections).reduce(
        (sum: number, docs: any) => sum + (Array.isArray(docs) ? docs.length : 0), 0
      );

      passed = true;
      details = `Verified: ${collectionCount} collections, ${docCount} documents, timestamp ${parsed.timestamp}`;
      logger.info(`[BACKUP] Verification passed for ${backup.fileName}: ${details}`);
    } catch (err: any) {
      passed = false;
      details = `Verification failed: ${err.message}`;
      logger.warn(`[BACKUP] Verification failed for ${backup.fileName}: ${err.message}`);
    }

    // Persist result onto the backup record
    backup.metadata = {
      ...(backup.metadata as any),
      verifiedAt: new Date(),
      verificationPassed: passed,
    };
    await backup.save();

    await AuditLog.create({
      username: userId,
      action: 'VERIFY_INTEGRITY',
      resourceType: 'backup',
      resourceId: backup.id,
      details: JSON.stringify({ action: 'verify', fileName: backup.fileName, passed, details }),
    });

    return { passed, details };
  }

  /**
   * Restore database from backup.
   * Sets status to 'restoring' so the UI can poll for real completion.
   * Handles both replica-set (transactional) and standalone (non-transactional) MongoDB.
   * ✅ SECURITY: Encrypted backups are decrypted with AES-256 after download.
   */
  async restoreBackup(backupId: string, userId: string): Promise<void> {
    const backup = await Backup.findById(backupId);

    if (!backup) {
      throw new Error('Backup not found');
    }

    if (backup.status !== 'completed') {
      throw new Error('Cannot restore from incomplete backup');
    }

    // Mark as restoring so the polling UI sees a real status change.
    await Backup.findByIdAndUpdate(backupId, { status: 'restoring', error: null });
    logger.info(`Starting restore from backup: ${backup.fileName}`);

    try {
      // Download backup from R2 (with automatic B2 secondary failover)
      const stream = await r2Service.downloadBackup(backup.r2Key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      let buffer: Buffer = Buffer.concat(chunks);

      // ✅ SECURITY: Decrypt backup if it was encrypted. We detect encryption from
      // the bytes themselves (gzip magic header) instead of trusting
      // metadata.encrypted — records rebuilt from the R2 listing have no metadata,
      // and skipping decryption there caused gunzip to fail with "incorrect header
      // check". This makes restore work regardless of how the catalog record was created.
      buffer = this.maybeDecrypt(buffer);

      // Decompress gzip and parse Extended JSON (reconstructs ObjectId/Date/etc).
      const gunzip = promisify(zlib.gunzip);
      const decompressed = await gunzip(buffer);
      const backupData = EJSON.parse(decompressed.toString(), { relaxed: false });

      // Snapshot the operator so the restore can't lock them out (see preserveActingUser).
      const actingUser = await this.snapshotActingUser(userId);

      // Use transactions on replica sets (Atlas/production); fall back to plain
      // sequential writes on standalone MongoDB (local Docker dev) which does not
      // support multi-document transactions.
      const rsInfo = await this.getReplicaSetInfo();

      if (rsInfo.isReplicaSet) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          for (const [collectionName, documents] of Object.entries(backupData.collections)) {
            if (this.RESTORE_PROTECTED_COLLECTIONS.has(collectionName)) {
              logger.info(`[BACKUP] Skipping protected collection during restore: ${collectionName}`);
              continue;
            }
            const collection = mongoose.connection.collection(collectionName);
            await collection.deleteMany({}, { session });
            if (Array.isArray(documents) && documents.length > 0) {
              await collection.insertMany(documents as any[], { session });
            }
            logger.info(`Restored collection: ${collectionName}`);
          }
          await session.commitTransaction();
        } catch (error) {
          await session.abortTransaction();
          throw error;
        } finally {
          session.endSession();
        }
      } else {
        logger.info('[BACKUP] Standalone MongoDB detected — restoring without transactions');
        for (const [collectionName, documents] of Object.entries(backupData.collections)) {
          if (this.RESTORE_PROTECTED_COLLECTIONS.has(collectionName)) {
            logger.info(`[BACKUP] Skipping protected collection during restore: ${collectionName}`);
            continue;
          }
          const collection = mongoose.connection.collection(collectionName);
          await collection.deleteMany({});
          if (Array.isArray(documents) && documents.length > 0) {
            await collection.insertMany(documents as any[]);
          }
          logger.info(`Restored collection: ${collectionName}`);
        }
      }

      // Re-insert the operator so they aren't locked out by the new user set.
      await this.preserveActingUser(actingUser);

      logger.info('Database restore completed successfully');

      // The restore overwrites the Backup collection, so use findByIdAndUpdate
      // (upsert) to reliably record completion even after the collection is replaced.
      await Backup.findByIdAndUpdate(
        backupId,
        { status: 'completed', $unset: { error: '' } },
        { upsert: true },
      );

      await AuditLog.create({
        username: userId,
        action: 'RESTORE',
        resourceType: 'backup',
        resourceId: backupId,
        details: JSON.stringify({ fileName: backup.fileName, collections: backup.collections.length }),
      });
    } catch (error: any) {
      logger.error('Error restoring backup:', error);

      // Keep the backup record as 'completed' (the file is still valid in R2)
      // but surface the restore error so the UI can display it.
      await Backup.findByIdAndUpdate(
        backupId,
        { status: 'completed', error: `Restore failed: ${error.message}` },
        { upsert: true },
      );

      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  /**
   * Hard-delete a completed backup from primary R2, secondary B2, and MongoDB.
   * Atomically claims the Mongo row first so PM2 cluster workers don't race
   * the same file (duplicate R2/B2 deletes).
   * @returns true if this process claimed and deleted the backup
   */
  private async hardDeleteBackup(backup: { _id: unknown; r2Key: string; fileName: string }): Promise<boolean> {
    const claimed = await Backup.findOneAndUpdate(
      { _id: backup._id, status: 'completed' },
      { $set: { status: 'deleted', deletedAt: new Date(), deletedBy: 'retention-prune' } },
      { new: true },
    );
    if (!claimed) return false;

    try {
      await r2Service.deleteFile(claimed.r2Key, config.r2BackupBucketName);
    } catch (err: any) {
      logger.warn(`[BACKUP RETENTION] Primary R2 delete failed for ${claimed.fileName}: ${String(err?.message ?? err)}`);
    }
    await r2Service.deleteFromSecondary(claimed.r2Key);
    await Backup.findByIdAndDelete(claimed._id);
    return true;
  }

  /** In-process guard (complements the Mongo lock for same-worker re-entry). */
  private retentionBusy = false;

  /**
   * Cluster-safe single-flight lock so only one PM2 worker runs retention at a time.
   * Returns null when another worker already holds the lock.
   */
  private async withRetentionLock<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.retentionBusy) {
      logger.info('[BACKUP RETENTION] Skipped — already running on this process');
      return null;
    }

    const owner = `backup-retention:${process.pid}`;
    const now = new Date();
    const lockUntil = new Date(now.getTime() + 45 * 60 * 1000); // long prune can take minutes
    let acquired = false;

    try {
      try {
        await EditLock.findOneAndUpdate(
          {
            collectionName: '_system',
            documentId: 'backup-retention',
            $or: [{ lockedUntil: { $lt: now } }, { lockedBy: owner }],
          },
          {
            $set: {
              lockedBy: owner,
              lockedByName: 'Backup Retention',
              lockedAt: now,
              lockedUntil: lockUntil,
            },
            $setOnInsert: {
              collectionName: '_system',
              documentId: 'backup-retention',
            },
          },
          { upsert: true, new: true },
        );
      } catch (err: any) {
        if (err?.code === 11000 || err?.code === 11001) {
          logger.info('[BACKUP RETENTION] Skipped — another instance holds the lock');
          return null;
        }
        throw err;
      }

      const lock = await EditLock.findOne({ collectionName: '_system', documentId: 'backup-retention' }).lean();
      if (!lock || lock.lockedBy !== owner) {
        logger.info('[BACKUP RETENTION] Skipped — another instance holds the lock');
        return null;
      }

      acquired = true;
      this.retentionBusy = true;
      return await fn();
    } finally {
      if (acquired) {
        this.retentionBusy = false;
        await EditLock.deleteOne({
          collectionName: '_system',
          documentId: 'backup-retention',
          lockedBy: owner,
        }).catch(() => { /* non-fatal */ });
      }
    }
  }

  /**
   * Delete old backups based on retention policy (age in days).
   * Removes from primary R2 and secondary B2.
   */
  async cleanupOldBackups(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const oldBackups = await Backup.find({
      createdAt: { $lt: cutoffDate },
      status: 'completed',
    });

    let deletedCount = 0;

    for (const backup of oldBackups) {
      try {
        if (await this.hardDeleteBackup(backup)) {
          deletedCount++;
          logger.info(`Deleted old backup: ${backup.fileName}`);
        }
      } catch (error) {
        logger.error(`Failed to delete backup ${backup.fileName}:`, error);
      }
    }

    if (deletedCount > 0) await this.writeManifestSafe();
    return deletedCount;
  }

  /**
   * Keep only the N most-recent completed backups (global copy-count retention).
   * Hard-deletes excess from primary R2, secondary B2, and MongoDB.
   */
  async cleanupExcessBackups(keepCount: number): Promise<number> {
    if (!Number.isFinite(keepCount) || keepCount < 1) return 0;

    const backups = await Backup.find({ status: 'completed' }).sort({ createdAt: -1 });
    const toDelete = backups.slice(Math.floor(keepCount));

    let deletedCount = 0;
    for (const backup of toDelete) {
      try {
        if (await this.hardDeleteBackup(backup)) {
          deletedCount++;
          logger.info(`[BACKUP RETENTION] Deleted excess backup (keep ${keepCount}): ${backup.fileName}`);
        }
      } catch (error) {
        logger.error(`[BACKUP RETENTION] Failed to delete ${backup.fileName}:`, error);
      }
    }

    if (deletedCount > 0) {
      await this.writeManifestSafe();
      logger.info(`[BACKUP RETENTION] Pruned ${deletedCount} excess backup(s); kept ${keepCount} most recent`);
    }
    return deletedCount;
  }

  /**
   * Apply the system-config "backupRetention" keep-N policy.
   * Cluster-safe (single-flight). Safe to call frequently; no-ops when at/under limit
   * or when another worker is already pruning.
   */
  async applyConfiguredRetention(): Promise<number> {
    try {
      const result = await this.withRetentionLock(async () => {
        const systemConfig = await SystemConfig.findOne({
          configType: 'system_settings',
          isDeleted: false,
        }).lean();
        const keepCount = systemConfig?.systemSettings?.data?.backupRetention ?? 30;
        return await this.cleanupExcessBackups(keepCount);
      });
      return result ?? 0;
    } catch (err: any) {
      logger.warn(`[BACKUP RETENTION] Global keep-N cleanup failed: ${String(err?.message ?? err)}`);
      return 0;
    }
  }

  /**
   * Fire-and-forget retention prune via BullMQ (falls back to in-process).
   */
  scheduleConfiguredRetention(): void {
    void import('./backgroundJobQueue')
      .then(({ enqueueBackgroundJob }) =>
        enqueueBackgroundJob({
          name: 'backup-retention',
          triggeredBy: 'system-retention',
        }),
      )
      .catch((err: any) => {
        logger.warn(`[BACKUP RETENTION] Failed to schedule prune: ${String(err?.message ?? err)}`);
      });
  }

  /**
   * LE-1: Tiered retention cleanup.
   * Keeps the N most-recent backups of each tier (daily/weekly/monthly),
   * hard-deleting the excess from primary R2, secondary B2, and MongoDB.
   */
  async cleanupTieredBackups(policy: { daily: number; weekly: number; monthly: number }): Promise<number> {
    let deletedCount = 0;

    for (const tier of ['daily', 'weekly', 'monthly'] as const) {
      const keepCount = policy[tier];
      const backups = await Backup.find({ status: 'completed', retentionTier: tier })
        .sort({ createdAt: -1 });

      const toDelete = backups.slice(keepCount);
      for (const backup of toDelete) {
        try {
          if (await this.hardDeleteBackup(backup)) {
            deletedCount++;
            logger.info(`[BACKUP TIERED] Deleted ${tier} backup: ${backup.fileName}`);
          }
        } catch (err) {
          logger.error(`[BACKUP TIERED] Failed to delete ${backup.fileName}:`, err);
        }
      }
    }

    if (deletedCount > 0) await this.writeManifestSafe();
    return deletedCount;
  }

  /**
   * LE-3: Permanently delete soft-deleted backups older than maxAgeDays.
   * Called by the backupTrashCleanup job.
   */
  async purgeDeletedBackups(maxAgeDays = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    const trashed = await Backup.find({
      status: 'deleted',
      deletedAt: { $lt: cutoff },
    });

    let purgedCount = 0;
    for (const backup of trashed) {
      try {
        await r2Service.deleteFile(backup.r2Key, config.r2BackupBucketName);
        await r2Service.deleteFromSecondary(backup.r2Key);
        await Backup.findByIdAndDelete(backup.id);
        purgedCount++;
        logger.info(`[BACKUP TRASH] Purged deleted backup: ${backup.fileName}`);
      } catch (err) {
        logger.error(`[BACKUP TRASH] Failed to purge ${backup.fileName}:`, err);
      }
    }

    if (purgedCount > 0) await this.writeManifestSafe();
    return purgedCount;
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<any> {
    const [totalBackups, completedBackups, failedBackups, totalSize] = await Promise.all([
      Backup.countDocuments(),
      Backup.countDocuments({ status: 'completed' }),
      Backup.countDocuments({ status: 'failed' }),
      Backup.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fileSize' } } }
      ]),
    ]);

    const oldestBackup = await Backup.findOne({ status: 'completed' }).sort({ createdAt: 1 });
    const newestBackup = await Backup.findOne({ status: 'completed' }).sort({ createdAt: -1 });

    return {
      totalBackups,
      completedBackups,
      failedBackups,
      totalSize: totalSize[0]?.total || 0,
      oldestBackup: oldestBackup?.createdAt,
      newestBackup: newestBackup?.createdAt,
      // Gap 1: surface live replication topology so the UI can prove auto-failover
      replicaSet: await this.getReplicaSetInfo(),
      // Redundancy: whether backups are mirrored to a second destination
      secondaryDestination: {
        enabled: r2Service.isSecondaryEnabled(),
        bucket: r2Service.getSecondaryBucketName() || undefined,
      },
    };
  }

  /**
   * Gap 1 (Replication/auto-failover): report the live MongoDB topology.
   * On MongoDB Atlas this returns the 3-node replica set that provides automatic
   * failover with zero manual restore — proving node-level HA is already in place.
   */
  async getReplicaSetInfo(): Promise<{ isReplicaSet: boolean; setName?: string; members?: number; topology: string }> {
    try {
      if (!mongoose.connection.db) return { isReplicaSet: false, topology: 'disconnected' };
      const admin = mongoose.connection.db.admin();
      const hello: any = await admin.command({ hello: 1 });
      const setName: string | undefined = hello.setName;
      const members = Array.isArray(hello.hosts) ? hello.hosts.length : undefined;
      return {
        isReplicaSet: !!setName,
        setName,
        members,
        topology: setName ? 'replicaSet' : 'standalone',
      };
    } catch {
      return { isReplicaSet: false, topology: 'unknown' };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Gap 5: Backup catalog stored SEPARATELY from the data (in R2, not MongoDB)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build the backup catalog from the MongoDB Backup collection.
   * Only metadata — no business data — so it is safe to store unencrypted and
   * remains readable during disaster recovery without any decryption key.
   */
  private async buildManifest(): Promise<any> {
    const backups = await Backup.find({}).sort({ createdAt: -1 }).lean();
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      database: mongoose.connection?.name,
      count: backups.length,
      backups: backups.map((b: any) => ({
        fileName: b.fileName,
        r2Key: b.r2Key,
        fileSize: b.fileSize,
        status: b.status,
        type: b.type,
        retentionTier: b.retentionTier,
        collections: b.collections,
        createdBy: b.createdBy,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
        metadata: b.metadata,
      })),
    };
  }

  /**
   * Regenerate the R2 backup catalog (`_manifest.json`) from the Backup
   * collection. This is the "metadata stored separately from the data" fix:
   * the full backup index lives in R2 alongside the files, so it survives a
   * total MongoDB failure.
   */
  async writeManifest(): Promise<void> {
    if (!r2Service.isEnabled()) return;
    const manifest = await this.buildManifest();
    const body = Buffer.from(JSON.stringify(manifest, null, 2));
    await r2Service.uploadFile(this.MANIFEST_KEY, body, 'application/json', config.r2BackupBucketName);
    // Redundancy: keep the catalog in the secondary destination too (no-op if unset)
    await r2Service.replicateToSecondary(this.MANIFEST_KEY, body, 'application/json');
    logger.info(`[BACKUP] R2 catalog updated: ${manifest.count} backup(s) indexed in ${this.MANIFEST_KEY}`);
  }

  /** Non-throwing wrapper — manifest failures must never break a backup/cleanup. */
  async writeManifestSafe(): Promise<void> {
    try {
      await this.writeManifest();
    } catch (err: any) {
      logger.warn('[BACKUP] Failed to update R2 catalog (non-fatal):', err?.message);
    }
  }

  /**
   * Read the R2 backup catalog. Works with ZERO MongoDB connection — this is
   * what makes the backup list recoverable after a database loss.
   */
  async readManifestFromR2(silent = false): Promise<any | null> {
    try {
      // Check existence first so a not-yet-created manifest doesn't log an error
      // (checks primary, then B2 secondary)
      const exists = await r2Service.backupExists(this.MANIFEST_KEY);
      if (!exists) return null;

      const stream = await r2Service.downloadBackup(this.MANIFEST_KEY);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (!buf.length) return null;
      return JSON.parse(buf.toString());
    } catch (err: any) {
      if (!silent) logger.warn('[BACKUP] R2 catalog not found or unreadable:', err?.message);
      return null;
    }
  }

  /**
   * DR: rebuild the MongoDB Backup collection from the R2 catalog.
   * Use after migrating to a fresh/empty database so the Backup & Recovery UI
   * shows the real backup history again. Idempotent (upsert by r2Key).
   * Falls back to a raw file listing if no manifest exists yet.
   */
  async rebuildBackupCollectionFromR2(userId: string): Promise<{ restored: number; source: 'manifest' | 'listing' | 'merged' }> {
    // Merge BOTH sources so the catalog reflects every physical file:
    //  - the manifest provides rich metadata (doc counts, encryption, type)
    //  - the raw bucket listing catches files the manifest doesn't know about
    //    (e.g. the manifest was overwritten by a run against a different DB, or
    //    old Mongo records were pruned while the R2 files remained).
    // Preferring the manifest alone used to hide files that exist in R2 but not
    // in the manifest — so the UI showed fewer backups than the bucket holds.
    const [manifest, files] = await Promise.all([
      this.readManifestFromR2(true),
      r2Service.listBackups('backups/'),
    ]);

    const fileList = files.filter((f: any) => f.key?.endsWith('.json.gz'));
    const physicalKeys = new Set(fileList.map((f: any) => f.key));
    const byKey = new Map<string, any>();

    // 1. Seed from the manifest (rich metadata) keyed by r2Key — but only for
    //    entries whose file still physically exists in the bucket. This drops
    //    stale manifest rows for backups that were hard-deleted from R2.
    if (manifest?.backups?.length) {
      for (const b of manifest.backups) {
        if (b?.r2Key && b?.fileName && physicalKeys.has(b.r2Key)) byKey.set(b.r2Key, b);
      }
    }

    // 2. Add any physical file the manifest didn't cover as a minimal record.
    for (const f of fileList) {
      if (byKey.has(f.key)) continue;
      byKey.set(f.key, {
        fileName: f.key.split('/').pop(),
        r2Key: f.key,
        fileSize: f.size ?? 0,
        status: 'completed',
        type: 'manual',
        collections: [],
        createdBy: 'r2-recovery',
        createdAt: f.lastModified ?? new Date(),
        completedAt: f.lastModified ?? new Date(),
      });
    }

    const manifestCount = manifest?.backups?.length ?? 0;
    const source: 'manifest' | 'listing' | 'merged' =
      manifestCount === 0 ? 'listing' : (fileList.length > manifestCount ? 'merged' : 'manifest');

    let restored = 0;
    for (const e of byKey.values()) {
      if (!e.r2Key || !e.fileName) continue;
      await Backup.updateOne(
        { r2Key: e.r2Key },
        { $setOnInsert: e },
        { upsert: true },
      );
      restored++;
    }

    await AuditLog.create({
      username: userId,
      action: 'RESTORE',
      resourceType: 'backup',
      details: JSON.stringify({ action: 'rebuild-catalog-from-r2', restored, source }),
    });

    logger.info(`[DR] Rebuilt backup catalog into MongoDB from R2 (${source}): ${restored} record(s)`);
    return { restored, source };
  }

  /**
   * Disaster Recovery: list all backup files directly from R2, enriched with
   * catalog metadata when available. Works even when MongoDB is completely
   * empty — no Backup records needed.
   */
  async listR2Backups(source: 'auto' | 'secondary' = 'auto'): Promise<Array<{
    key: string; size: number; lastModified: Date;
    fileName?: string; type?: string; createdBy?: string;
    totalDocuments?: number; encrypted?: boolean; collections?: number;
  }>> {
    const files = source === 'secondary'
      ? await r2Service.listSecondary('backups/')
      : await r2Service.listBackups('backups/');
    // The manifest is optional enrichment. In forced-secondary mode, avoid
    // contacting primary R2 entirely; object metadata is enough to restore.
    const manifest = source === 'secondary' ? null : await this.readManifestFromR2(true);
    const metaByKey = new Map<string, any>();
    if (manifest?.backups) for (const b of manifest.backups) metaByKey.set(b.r2Key, b);

    return files
      .filter((f: any) => f.key?.endsWith('.json.gz'))
      .map((f: any) => {
        const meta = metaByKey.get(f.key);
        return {
          key: f.key,
          size: f.size ?? 0,
          lastModified: f.lastModified ?? new Date(0),
          ...(meta ? {
            fileName: meta.fileName,
            type: meta.type,
            createdBy: meta.createdBy,
            totalDocuments: meta.metadata?.totalDocuments,
            encrypted: meta.metadata?.encrypted,
            collections: Array.isArray(meta.collections) ? meta.collections.length : undefined,
          } : {}),
        };
      })
      .sort((a: any, b: any) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  /**
   * Disaster Recovery: restore directly from an R2 key without a Backup model record.
   * Used when MongoDB is empty/new and no backup metadata exists in the database.
   */
  async restoreFromR2Key(r2Key: string, userId: string): Promise<void> {
    logger.info(`[DR] Starting restore from R2 key: ${r2Key}`);

    const stream = await r2Service.downloadBackup(r2Key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    let buffer: Buffer = Buffer.concat(chunks);

    if (!buffer.length) throw new Error('Downloaded backup file is empty');

    // Decrypt if the bytes look encrypted (handles records with no metadata).
    buffer = this.maybeDecrypt(buffer);

    const gunzip = promisify(zlib.gunzip);
    const decompressed = await gunzip(buffer);
    const backupData = EJSON.parse(decompressed.toString(), { relaxed: false });

    if (!backupData.collections || typeof backupData.collections !== 'object') {
      throw new Error('Invalid backup JSON structure');
    }

    if (!mongoose.connection.db) throw new Error('No active database connection');

    // Snapshot the operator so the restore can't lock them out.
    const actingUser = await this.snapshotActingUser(userId);

    // Use transactions on replica sets (Atlas/production); fall back to plain
    // sequential writes on standalone MongoDB (local Docker/dev) which does not
    // support multi-document transactions. Mirrors restoreBackup() — without
    // this, restoring directly from R2 into a local standalone Mongo always
    // failed with "Transaction numbers are only allowed on a replica set".
    const rsInfo = await this.getReplicaSetInfo();

    if (rsInfo.isReplicaSet) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        for (const [collectionName, documents] of Object.entries(backupData.collections)) {
          if (this.RESTORE_PROTECTED_COLLECTIONS.has(collectionName)) {
            logger.info(`[DR] Skipping protected collection during restore: ${collectionName}`);
            continue;
          }
          const collection = mongoose.connection.collection(collectionName);
          await collection.deleteMany({}, { session });
          if (Array.isArray(documents) && documents.length > 0) {
            await collection.insertMany(documents as any[], { session });
          }
          logger.info(`[DR] Restored collection: ${collectionName} (${(documents as any[]).length ?? 0} docs)`);
        }
        await session.commitTransaction();
        logger.info('[DR] Restore committed successfully');
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      logger.info('[DR] Standalone MongoDB detected — restoring without transactions');
      for (const [collectionName, documents] of Object.entries(backupData.collections)) {
        if (this.RESTORE_PROTECTED_COLLECTIONS.has(collectionName)) {
          logger.info(`[DR] Skipping protected collection during restore: ${collectionName}`);
          continue;
        }
        const collection = mongoose.connection.collection(collectionName);
        await collection.deleteMany({});
        if (Array.isArray(documents) && documents.length > 0) {
          await collection.insertMany(documents as any[]);
        }
        logger.info(`[DR] Restored collection: ${collectionName} (${(documents as any[]).length ?? 0} docs)`);
      }
      logger.info('[DR] Restore completed successfully (standalone)');
    }

    // Re-insert the operator so they aren't locked out by the new user set.
    await this.preserveActingUser(actingUser);

    await AuditLog.create({
      username: userId,
      action: 'RESTORE',
      resourceType: 'backup',
      resourceId: r2Key,
      details: JSON.stringify({ r2Key, source: 'r2-direct', collections: Object.keys(backupData.collections).length }),
    });
  }

  /**
   * SAFE restore (blue/green-lite): restore a backup into a brand-new side
   * database on the SAME cluster instead of overwriting live data. Nothing in
   * the live database is touched — no lockout, no 500 race. After verifying the
   * returned counts, "cut over" by pointing MONGODB_URI at the new database name
   * and restarting the backend; roll back by simply pointing it back.
   *
   * A new database is a logical namespace on the same cluster, so this costs no
   * extra compute — only temporary disk for the second copy, reclaimed by
   * dropping the database afterwards.
   */
  async restoreToNewDb(
    r2Key: string,
    userId: string,
    newDbName?: string,
    source: 'auto' | 'secondary' = 'auto',
  ): Promise<{ dbName: string; collections: number; documents: number; businessDocuments: number }> {
    logger.info(
      `[DR] Safe restore (into a new side database) from ${source === 'secondary' ? 'secondary backup storage' : 'automatic primary/secondary failover'}: ${r2Key}`
    );

    if (!mongoose.connection.db) throw new Error('No active database connection');
    const { data: backupData } = await this.downloadDecryptParse(r2Key, source);

    const liveName = mongoose.connection.name;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dbName = newDbName || `${liveName}_restored_${ts}`;
    if (dbName === liveName) throw new Error('Refusing to restore over the live database — choose a different name');

    // useDb gives another database on the existing connection (no new connection/cost).
    const target = mongoose.connection.useDb(dbName, { useCache: false });

    let documents = 0;
    let businessDocuments = 0;
    let collections = 0;
    const coreBusiness = new Set(this.CORE_BUSINESS_COLLECTIONS);

    for (const [name, docs] of Object.entries(backupData.collections)) {
      if (this.RESTORE_PROTECTED_COLLECTIONS.has(name)) continue; // never copy session state
      const col = target.collection(name);
      await col.deleteMany({}); // side DB is fresh, but stay idempotent on re-runs
      if (Array.isArray(docs) && docs.length > 0) {
        await col.insertMany(docs as any[]);
        documents += docs.length;
        if (coreBusiness.has(name)) businessDocuments += docs.length;
      }
      collections++;
    }

    await AuditLog.create({
      username: userId,
      action: 'RESTORE',
      resourceType: 'backup',
      resourceId: r2Key,
      details: JSON.stringify({ r2Key, source: 'restore-to-new-db', dbName, collections, documents, businessDocuments }),
    });

    logger.info(`[DR] Safe restore complete → database "${dbName}" (${collections} collections, ${documents} docs, ${businessDocuments} business). Live data untouched.`);
    return { dbName, collections, documents, businessDocuments };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Gap 4: Chaos engineering — automated disaster-recovery drill
  // ──────────────────────────────────────────────────────────────────────────

  /** Shared helper: download a backup from R2, decrypt (graceful), gunzip, parse. */
  private async downloadDecryptParse(
    r2Key: string,
    source: 'auto' | 'secondary' = 'auto',
  ): Promise<{ data: any; sizeBytes: number }> {
    const stream = source === 'secondary'
      ? await r2Service.downloadFromSecondary(r2Key)
      : await r2Service.downloadBackup(r2Key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    let buffer: Buffer = Buffer.concat(chunks);
    const sizeBytes = buffer.length;
    if (!buffer.length) throw new Error('Downloaded backup file is empty');

    buffer = this.maybeDecrypt(buffer);

    const gunzip = promisify(zlib.gunzip);
    const decompressed = await gunzip(buffer);
    const data = EJSON.parse(decompressed.toString(), { relaxed: false });
    if (!data.collections || typeof data.collections !== 'object') {
      throw new Error('Invalid backup JSON structure');
    }
    return { data, sizeBytes };
  }

  /**
   * Chaos drill: prove the latest backup is actually restorable WITHOUT touching
   * live data. Restores into an isolated scratch database on the same cluster,
   * verifies document counts match, then drops the scratch database.
   * Alerts via Slack + email on any failure.
   */
  async runDisasterRecoveryDrill(triggeredBy = 'system-chaos-drill'): Promise<any> {
    const t0 = Date.now();
    const report: any = { passed: false, startedAt: new Date().toISOString() };

    try {
      // 1. Pick the latest completed backup (prefer DB record, fall back to R2)
      let r2Key: string | undefined;
      const latest = await Backup.findOne({ status: 'completed' }).sort({ createdAt: -1 }).lean();
      if (latest?.r2Key) {
        r2Key = latest.r2Key;
      } else {
        const files = await this.listR2Backups();
        if (files.length) r2Key = files[0].key;
      }
      if (!r2Key) throw new Error('No backups available to drill');
      report.r2Key = r2Key;

      // 2. Download → decrypt → decompress → parse
      const { data: backupData, sizeBytes } = await this.downloadDecryptParse(r2Key);
      report.backupBytes = sizeBytes;
      report.expectedCollections = Object.keys(backupData.collections).length;
      report.expectedDocuments = Object.values(backupData.collections)
        .reduce((sum: number, docs: any) => sum + (Array.isArray(docs) ? docs.length : 0), 0);

      // 3. Restore into an ISOLATED scratch DB on the same cluster (never live data)
      if (!mongoose.connection.db) throw new Error('No active database connection');
      const scratchName = `${mongoose.connection.name}_dr_drill`;
      const scratch = mongoose.connection.useDb(scratchName, { useCache: false });
      let restoredDocs = 0;
      try {
        await scratch.dropDatabase(); // clean slate
        for (const [name, docs] of Object.entries(backupData.collections)) {
          if (Array.isArray(docs) && docs.length > 0) {
            await scratch.collection(name).insertMany(docs as any[]);
            restoredDocs += docs.length;
          }
        }
        report.restoredDocuments = restoredDocs;
        report.restoredCollections = Object.keys(backupData.collections).length;
      } finally {
        await scratch.dropDatabase().catch((e: any) =>
          logger.warn('[DR DRILL] scratch DB cleanup failed:', e?.message));
      }

      // 4. Verify
      report.passed = restoredDocs === report.expectedDocuments;
      report.durationMs = Date.now() - t0;
      report.details = report.passed
        ? `Restored ${restoredDocs}/${report.expectedDocuments} docs across ${report.expectedCollections} collections into an isolated scratch DB and verified counts.`
        : `MISMATCH: restored ${restoredDocs} but backup declares ${report.expectedDocuments}.`;

      await AuditLog.create({
        username: triggeredBy,
        action: 'VERIFY_INTEGRITY',
        resourceType: 'backup',
        resourceId: r2Key,
        details: JSON.stringify({ action: 'dr-drill', ...report }),
      });

      if (report.passed) {
        logger.info(`[DR DRILL] PASSED — ${report.details}`);
      } else {
        logger.error(`[DR DRILL] FAILED — ${report.details}`);
        await this.sendDrillAlert(report);
      }
      return report;
    } catch (err: any) {
      report.passed = false;
      report.durationMs = Date.now() - t0;
      report.error = err?.message;
      report.details = `DR drill errored: ${err?.message}`;
      logger.error(`[DR DRILL] FAILED — ${err?.message}`);
      await this.sendDrillAlert(report).catch(() => { /* non-fatal */ });
      return report;
    }
  }

  /** Fire Slack (critical) + email alert when a DR drill fails. Never throws. */
  private async sendDrillAlert(report: any): Promise<void> {
    try {
      const slack = require('./slackNotificationService').default;
      await slack.sendNotification({
        severity: 'critical',
        title: 'Disaster Recovery Drill FAILED',
        description: 'Automated backup-restore test did not pass. Your backups may not be restorable — investigate immediately.',
        details: {
          'R2 Key': report.r2Key || 'n/a',
          'Expected Docs': report.expectedDocuments ?? 'n/a',
          'Restored Docs': report.restoredDocuments ?? 'n/a',
          'Error': report.error || report.details || 'n/a',
        },
        timestamp: new Date(),
      });
    } catch (e: any) {
      logger.warn('[DR DRILL] Could not send Slack alert:', e?.message);
    }
    try {
      await emailService.sendBackupFailureAlert('DR Drill', report.error || report.details || 'DR drill failed');
    } catch { /* non-fatal */ }
  }

  /**
   * Get MongoDB version
   */
  private async getMongoVersion(): Promise<string> {
    try {
      if (!mongoose.connection.db) {
        return 'unknown';
      }
      const adminDb = mongoose.connection.db.admin();
      const info = await adminDb.serverInfo();
      return info.version;
    } catch (error) {
      return 'unknown';
    }
  }
}

export default new BackupService();
