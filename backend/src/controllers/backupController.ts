import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Backup from '../models/Backup';
import BackupSchedule from '../models/BackupSchedule';
import backupService from '../services/backupService';
import r2Service from '../services/r2Service';
import { AuditLog } from '../models/AuditLog';
import { config } from '../config';

/**
 * Disaster Recovery: list all backup files directly from R2.
 * Works even when the MongoDB backup-metadata collection is empty (e.g. after
 * migrating to a new database).
 * GET /backup/r2-backups
 */
export const listR2Backups = async (req: AuthRequest, res: Response) => {
  try {
    const files = await backupService.listR2Backups();
    res.json({ success: true, data: { backups: files, total: files.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to list R2 backups' });
  }
};

/**
 * Disaster Recovery: restore directly from an R2 key without a Backup model record.
 * POST /backup/restore-from-r2  body: { r2Key: "backups/backup_xxx.json.gz" }
 */
export const restoreFromR2Key = async (req: AuthRequest, res: Response) => {
  try {
    const { r2Key } = req.body;
    if (!r2Key || typeof r2Key !== 'string') {
      res.status(400).json({ success: false, message: 'r2Key is required' });
      return;
    }
    const userId = req.user?.username || 'system';
    await backupService.restoreFromR2Key(r2Key, userId);
    res.json({ success: true, message: `Database restored from ${r2Key}` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Restore failed' });
  }
};

/**
 * SAFE restore (blue/green-lite): restore a backup into a NEW database on the
 * same cluster instead of overwriting live data. Live data is untouched.
 * POST /backup/restore-to-new-db  body: { r2Key, newDbName? }
 */
export const restoreToNewDb = async (req: AuthRequest, res: Response) => {
  try {
    const { r2Key, newDbName } = req.body;
    if (!r2Key || typeof r2Key !== 'string') {
      res.status(400).json({ success: false, message: 'r2Key is required' });
      return;
    }
    const userId = req.user?.username || 'system';
    const result = await backupService.restoreToNewDb(r2Key, userId, newDbName);
    res.json({
      success: true,
      message:
        `Restored into new database "${result.dbName}" (${result.documents} docs, ${result.businessDocuments} business). ` +
        `Live data was NOT touched. To go live: point MONGODB_URI at "${result.dbName}" and restart the backend.`,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Safe restore failed' });
  }
};

/**
 * Disaster Recovery: rebuild the MongoDB backup catalog from the R2 manifest.
 * Run this after migrating to a fresh/empty database so the Backup & Recovery
 * UI shows the real backup history again.
 * POST /backup/sync-from-r2
 */
export const syncBackupsFromR2 = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.username || 'system';
    const result = await backupService.rebuildBackupCollectionFromR2(userId);
    res.json({
      success: true,
      message: `Rebuilt backup catalog from R2 (${result.source}): ${result.restored} record(s)`,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to sync from R2' });
  }
};

/**
 * Chaos engineering: run an on-demand disaster-recovery drill that restores the
 * latest backup into an isolated scratch database and verifies it — without
 * touching live data.
 * POST /backup/dr-drill
 */
export const runDrill = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.username || 'system';
    const { enqueueBackgroundJob } = await import('../services/backgroundJobQueue');
    const result = await enqueueBackgroundJob({
      name: 'backup-dr-drill',
      triggeredBy: userId,
    });
    res.status(202).json({
      success: true,
      message: result.queued
        ? 'DR drill queued. Check logs for results.'
        : 'DR drill started inline. Check logs for results.',
      data: { queued: result.queued, jobId: result.jobId },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'DR drill failed' });
  }
};

/**
 * Create a manual backup
 * POST /api/system-admin/backups
 * Enqueues to BullMQ — HTTP returns immediately; any worker runs the job.
 */
export const createBackup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.username || 'system';
    const { collections } = req.body;

    const { enqueueBackgroundJob } = await import('../services/backgroundJobQueue');
    const result = await enqueueBackgroundJob({
      name: 'backup-create',
      triggeredBy: userId,
      type: 'manual',
      collections,
    });

    res.status(202).json({
      success: true,
      message: result.queued
        ? 'Backup job queued. It will run in the background.'
        : 'Backup started (ran inline — Redis queue unavailable).',
      data: { queued: result.queued, jobId: result.jobId, ranInline: result.ranInline },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create backup',
    });
  }
};

/**
 * Get all backups
 * GET /api/system-admin/backups
 */
export const getBackups = async (req: AuthRequest, res: Response) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (Number(page) - 1) * Number(limit);

    // Auto-sync: on the first unfiltered page load, compare local MongoDB count
    // against the R2 file count. If R2 has more backup files than local MongoDB
    // has records, silently rebuild the catalog. This handles both the completely
    // fresh local DB (0 records) and the partially-synced case (e.g. 1 local
    // record vs 18 in R2). The rebuild is idempotent (upsert by r2Key).
    const isFirstUnfilteredPage = Number(page) === 1 && !status && !type;
    if (isFirstUnfilteredPage && r2Service.isEnabled()) {
      try {
        const [localCount, r2Files] = await Promise.all([
          Backup.countDocuments({ status: { $ne: 'deleted' } }),
          r2Service.listBackups('backups/'),
        ]);
        const r2Count = r2Files.filter((f: any) => f.key?.endsWith('.json.gz')).length;
        if (r2Count > localCount) {
          const userId = (req as AuthRequest).user?.username || 'system';
          await backupService.rebuildBackupCollectionFromR2(userId);
        }
      } catch (err: any) {
        // Non-fatal — if R2 is unreachable just return whatever is in local DB.
        console.warn('[BACKUP] Auto-sync from R2 failed (non-fatal):', err?.message);
      }
    }

    const [backups, total] = await Promise.all([
      Backup.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Backup.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        backups,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch backups',
    });
  }
};

/**
 * Get backup by ID
 * GET /api/system-admin/backups/:id
 */
export const getBackupById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const backup = await Backup.findById(id);

    if (!backup) {
      res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
    }

    res.json({
      success: true,
      data: backup,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch backup',
    });
  }
};

/**
 * Download backup
 * GET /api/system-admin/backups/:id/download
 */
export const downloadBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
    } else if (backup.status !== 'completed') {
      res.status(400).json({
        success: false,
        message: 'Cannot download incomplete backup',
      });
    } else {
      // Generate signed URL (expires in 1 hour)
      const downloadUrl = await r2Service.getSignedDownloadUrl(backup.r2Key, 3600);

      // Log download
      await AuditLog.create({
        username: userId,
        action: 'EXPORT',
        resourceType: 'backup',
        resourceId: backup.id,
        details: JSON.stringify({ fileName: backup.fileName }),
      });

      res.json({
        success: true,
        data: {
          url: downloadUrl,
          fileName: backup.fileName,
          expiresIn: 3600,
        },
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to download backup',
    });
  }
};

/**
 * Restore backup
 * POST /api/system-admin/backups/:id/restore
 * Enqueues to BullMQ — single-flight across the cluster.
 */
export const restoreBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
      return;
    }

    const { enqueueBackgroundJob } = await import('../services/backgroundJobQueue');
    const result = await enqueueBackgroundJob({
      name: 'backup-restore',
      triggeredBy: userId,
      backupId: id,
    });

    res.json({
      success: true,
      message: result.queued
        ? 'Backup restore queued. This may take several minutes.'
        : 'Backup restore started (inline). This may take several minutes.',
      data: { queued: result.queued, jobId: result.jobId },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore backup',
    });
  }
};

/**
 * Delete backup
 * DELETE /api/system-admin/backups/:id
 */
export const deleteBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
    } else {
      // LE-3: Soft-delete — mark as deleted instead of immediately removing from R2
      backup.status = 'deleted';
      backup.deletedAt = new Date();
      backup.deletedBy = userId;
      await backup.save();

      // Log deletion
      await AuditLog.create({
        username: userId,
        action: 'DELETE',
        resourceType: 'backup',
        resourceId: backup.id,
        details: JSON.stringify({ backupId: backup.id, fileName: backup.fileName, softDelete: true }),
      });

      // Keep the R2 catalog in sync with the new status
      await backupService.writeManifestSafe();

      res.json({
        success: true,
        message: 'Backup moved to trash. It will be permanently deleted after 7 days.',
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup',
    });
  }
};

/**
 * ME-1: Verify backup integrity
 * POST /api/system-admin/backups/:id/verify
 */
export const verifyBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const result = await backupService.verifyBackup(id, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const status = error.message === 'Backup not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to verify backup',
    });
  }
};

/**
 * LE-3: List soft-deleted backups (trash)
 * GET /api/system-admin/backups/trash
 */
export const getDeletedBackups = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [backups, total] = await Promise.all([
      Backup.find({ status: 'deleted' })
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Backup.countDocuments({ status: 'deleted' }),
    ]);

    res.json({
      success: true,
      data: {
        backups,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deleted backups',
    });
  }
};

/**
 * LE-3: Restore a backup from trash (undelete)
 * POST /api/system-admin/backups/:id/undelete
 */
export const undeleteBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      res.status(404).json({ success: false, message: 'Backup not found' });
      return;
    }

    if (backup.status !== 'deleted') {
      res.status(400).json({ success: false, message: 'Backup is not in trash' });
      return;
    }

    backup.status = 'completed';
    backup.deletedAt = undefined;
    backup.deletedBy = undefined;
    await backup.save();

    await AuditLog.create({
      username: userId,
      action: 'UPDATE',
      resourceType: 'backup',
      resourceId: backup.id,
      details: JSON.stringify({ action: 'undelete', fileName: backup.fileName }),
    });

    await backupService.writeManifestSafe();

    res.json({ success: true, message: 'Backup restored from trash', data: backup });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to restore backup from trash' });
  }
};

/**
 * LE-3: Permanently delete a backup (removes from R2 + DB)
 * DELETE /api/system-admin/backups/:id/permanent
 */
export const permanentlyDeleteBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      res.status(404).json({ success: false, message: 'Backup not found' });
      return;
    }

    // Delete from R2 (primary + secondary)
    if (backup.r2Key) {
      try {
        await r2Service.deleteFile(backup.r2Key, config.r2BackupBucketName);
        await r2Service.deleteFromSecondary(backup.r2Key);
      } catch (r2Err) {
        console.error('[BACKUP] Failed to delete from R2 during permanent delete:', r2Err);
      }
    }

    await Backup.findByIdAndDelete(id);

    await AuditLog.create({
      username: userId,
      action: 'DELETE',
      resourceType: 'backup',
      resourceId: backup.id,
      details: JSON.stringify({ action: 'permanent_delete', fileName: backup.fileName }),
    });

    await backupService.writeManifestSafe();

    res.json({ success: true, message: 'Backup permanently deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to permanently delete backup' });
  }
};

/**
 * Get backup statistics
 * GET /api/system-admin/backups/stats
 */
export const getBackupStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await backupService.getBackupStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
    });
  }
};

/**
 * Get backup schedules
 * GET /api/system-admin/backup-schedules
 */
export const getBackupSchedules = async (req: AuthRequest, res: Response) => {
  try {
    const schedules = await BackupSchedule.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: schedules,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schedules',
    });
  }
};

/**
 * Create backup schedule
 * POST /api/system-admin/backup-schedules
 */
export const createBackupSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const { name, frequency, time, dayOfWeek, dayOfMonth, retentionDays, retentionPolicy } = req.body;
    const userId = req.user?.username || 'system';

    const schedule = await BackupSchedule.create({
      name,
      frequency,
      time,
      dayOfWeek,
      dayOfMonth,
      retentionDays,
      retentionPolicy,
      createdBy: userId,
    });

    // Log creation
    await AuditLog.create({
      username: userId,
      action: 'CREATE',
      resourceType: 'backup_schedule',
      resourceId: schedule.id,
      details: JSON.stringify({ name, frequency, time }),
    });

    res.status(201).json({
      success: true,
      message: 'Backup schedule created successfully',
      data: schedule,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create schedule',
    });
  }
};

/**
 * Update backup schedule
 * PUT /api/system-admin/backup-schedules/:id
 */
export const updateBackupSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.username || 'system';

    const schedule = await BackupSchedule.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: userId },
      { new: true, runValidators: true }
    );

    if (!schedule) {
      res.status(404).json({
        success: false,
        message: 'Backup schedule not found',
      });
    } else {
      // Log update
      await AuditLog.create({
        username: userId,
        action: 'UPDATE',
        resourceType: 'backup_schedule',
        resourceId: schedule.id,
        details: JSON.stringify(updates),
      });

      res.json({
        success: true,
        message: 'Backup schedule updated successfully',
        data: schedule,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update schedule',
    });
  }
};

/**
 * Delete backup schedule
 * DELETE /api/system-admin/backup-schedules/:id
 */
export const deleteBackupSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const schedule = await BackupSchedule.findByIdAndDelete(id);

    if (!schedule) {
      res.status(404).json({
        success: false,
        message: 'Backup schedule not found',
      });
    } else {
      // Log deletion
      await AuditLog.create({
        username: userId,
        action: 'DELETE',
        resourceType: 'backup_schedule',
        resourceId: schedule.id,
        details: JSON.stringify({ name: schedule.name }),
      });

      res.json({
        success: true,
        message: 'Backup schedule deleted successfully',
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete schedule',
    });
  }
};

/**
 * Cleanup old backups
 * POST /api/system-admin/backups/cleanup
 */
export const cleanupBackups = async (req: AuthRequest, res: Response) => {
  try {
    const { retentionDays = 30 } = req.body;
    const userId = req.user?.username || 'system';

    const deletedCount = await backupService.cleanupOldBackups(retentionDays);

    // Log cleanup
    await AuditLog.create({
      username: userId,
      action: 'BULK_OPERATION',
      resourceType: 'backup',
      details: JSON.stringify({ retentionDays, deletedCount }),
    });

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old backup(s)`,
      data: { deletedCount },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup backups',
    });
  }
};
