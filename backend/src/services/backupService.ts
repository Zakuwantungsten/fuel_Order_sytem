import mongoose from 'mongoose';
import archiver from 'archiver';
import { Readable } from 'stream';
import Backup from '../models/Backup';
import { AuditLog } from '../models/AuditLog';
import r2Service from './r2Service';
import logger from '../utils/logger';

class BackupService {
  /**
   * Create a database backup
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
      const collectionNames = collections.map(c => c.name);

      const backupData: any = {
        timestamp: new Date().toISOString(),
        database: mongoose.connection.name,
        collections: {},
        metadata: {
          mongoVersion: await this.getMongoVersion(),
          totalCollections: collectionNames.length,
          totalDocuments: 0,
        }
      };

      let totalDocuments = 0;

      // Export each collection
      for (const collectionName of collectionNames) {
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

      // Upload to R2
      await r2Service.uploadFile(r2Key, archiveBuffer, 'application/gzip');

      // Update backup record
      backup.status = 'completed';
      backup.fileSize = archiveBuffer.length;
      backup.collections = collectionNames;
      backup.completedAt = new Date();
      backup.metadata = {
        totalDocuments,
        databaseSize: archiveBuffer.length,
        compression: 'gzip',
      };
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
          collections: collectionNames.length,
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
      const buffer = Buffer.concat(chunks);

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
