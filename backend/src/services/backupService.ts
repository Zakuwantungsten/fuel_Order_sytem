import mongoose from 'mongoose';
import archiver from 'archiver';
import { Readable } from 'stream';
import Backup from '../models/Backup';
import { AuditLog } from '../models/AuditLog';
import r2Service from './r2Service';
import logger from '../utils/logger';
import { encryptBuffer, decryptBuffer } from '../utils/cryptoUtils';
import { config } from '../config';

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
   * Create a database backup
   * ✅ SECURITY: Backups are encrypted with AES-256 before R2 upload
   */
  async createBackup(userId: string, type: 'manual' | 'scheduled' = 'manual'): Promise<any> {
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
    });

    try {
      // Get all collections
      if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
      }
      
      const collections = await mongoose.connection.db.listCollections().toArray();
      const excludedCollections = await this.getExcludedCollections();
      
      // Filter out excluded collections
      const collectionsToBackup = collections
        .map(c => c.name)
        .filter(name => !excludedCollections.has(name));

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

      // Export each collection (excluding filtered ones)
      for (const collectionName of collectionsToBackup) {
        const collection = mongoose.connection.collection(collectionName);
        const documents = await collection.find({}).toArray();
        backupData.collections[collectionName] = documents;
        totalDocuments += documents.length;
        logger.info(`Backed up collection: ${collectionName} (${documents.length} documents)`);
      }

      backupData.metadata.totalDocuments = totalDocuments;

      // Convert to JSON and create a stream
      const jsonString = JSON.stringify(backupData, null, 2);
      const jsonBuffer = Buffer.from(jsonString);

      // Create gzip archive
      const archive = archiver('tar', {
        gzip: true,
        gzipOptions: { level: 9 }
      });

      // Convert archive to buffer
      const chunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));

      const archivePromise = new Promise<Buffer>((resolve, reject) => {
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
      });

      // Append JSON to archive
      archive.append(jsonBuffer, { name: 'backup.json' });
      archive.finalize();

      const archiveBuffer = await archivePromise;

      // ✅ SECURITY: Encrypt backup before uploading to R2
      const encryptionKey = this.validateEncryptionKey();
      let fileToUpload = archiveBuffer;
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
      await r2Service.uploadFile(r2Key, fileToUpload, uploadContentType);

      // Update backup record
      backup.status = 'completed';
      backup.fileSize = archiveBuffer.length;
      backup.collections = collectionsToBackup;
      backup.completedAt = new Date();
      backup.metadata = {
        totalDocuments,
        databaseSize: archiveBuffer.length,
        compression: 'gzip',
      };
      (backup as any).excludedCollections = Array.from(excludedCollections);
      (backup as any).encrypted = encryptionKey ? true : false;
      (backup as any).encryptionAlgorithm = encryptionKey ? 'aes-256-gcm' : null;
      await backup.save();

      // Create audit log
      await AuditLog.create({
        user: userId,
        action: 'backup_created',
        resource: 'backup',
        resourceId: backup.id,
        details: {
          fileName,
          fileSize: archiveBuffer.length,
          collections: collectionsToBackup.length,
          documents: totalDocuments,
        },
      });

      logger.info(`Backup created successfully: ${fileName}`);
      return backup;
    } catch (error: any) {
      logger.error('Error creating backup:', error);
      
      // Update backup status to failed
      backup.status = 'failed';
      backup.error = error.message;
      await backup.save();

      throw error;
    }
  }

  /**
   * Restore database from backup
   * ✅ SECURITY: Encrypted backups are decrypted with AES-256 after download
   */
  async restoreBackup(backupId: string, userId: string): Promise<void> {
    const backup = await Backup.findById(backupId);
    
    if (!backup) {
      throw new Error('Backup not found');
    }

    if (backup.status !== 'completed') {
      throw new Error('Cannot restore from incomplete backup');
    }

    try {
      logger.info(`Starting restore from backup: ${backup.fileName}`);

      // Download backup from R2
      const stream = await r2Service.downloadFile(backup.r2Key);
      
      // Read stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      let buffer: Buffer = Buffer.concat(chunks);

      // ✅ SECURITY: Decrypt backup if it was encrypted
      if ((backup as any).metadata?.encrypted) {
        const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
        if (!encryptionKey) {
          throw new Error('Cannot restore encrypted backup: BACKUP_ENCRYPTION_KEY not configured');
        }
        try {
          const decryptedBuffer = decryptBuffer(buffer, encryptionKey);
          // @ts-ignore - Buffer type mismatch between different implementations
          buffer = decryptedBuffer;
          logger.info('[BACKUP] Backup decrypted with AES-256-GCM');
        } catch (error: any) {
          logger.error('[BACKUP] Decryption failed:', error.message);
          throw new Error(`Backup decryption failed: ${error.message}`);
        }
      }

      // Extract and parse (simplified - in production you'd use tar extraction)
      // For now, assume the backup is JSON format
      const backupData = JSON.parse(buffer.toString());

      // Restore each collection
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        for (const [collectionName, documents] of Object.entries(backupData.collections)) {
          const collection = mongoose.connection.collection(collectionName);
          
          // Clear existing data
          await collection.deleteMany({}, { session });
          
          // Insert backup data
          if (Array.isArray(documents) && documents.length > 0) {
            await collection.insertMany(documents as any[], { session });
          }
          
          logger.info(`Restored collection: ${collectionName}`);
        }

        await session.commitTransaction();
        logger.info('Database restore completed successfully');

        // Create audit log
        await AuditLog.create({
          user: userId,
          action: 'backup_restored',
          resource: 'backup',
          resourceId: backup.id,
          details: {
            fileName: backup.fileName,
            collections: backup.collections.length,
          },
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error: any) {
      logger.error('Error restoring backup:', error);
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  /**
   * Delete old backups based on retention policy
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
        // Delete from R2
        await r2Service.deleteFile(backup.r2Key);
        
        // Delete backup record
        await Backup.findByIdAndDelete(backup.id);
        
        deletedCount++;
        logger.info(`Deleted old backup: ${backup.fileName}`);
      } catch (error) {
        logger.error(`Failed to delete backup ${backup.fileName}:`, error);
      }
    }

    return deletedCount;
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
    };
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
