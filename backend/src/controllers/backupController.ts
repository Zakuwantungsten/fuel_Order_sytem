import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Backup from '../models/Backup';
import BackupSchedule from '../models/BackupSchedule';
import backupService from '../services/backupService';
import r2Service from '../services/r2Service';
import { AuditLog } from '../models/AuditLog';

/**
 * Create a manual backup
 * POST /api/system-admin/backups
 */
export const createBackup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.username || 'system';

    const backup = await backupService.createBackup(userId, 'manual');

    res.status(201).json({
      success: true,
      message: 'Backup created successfully',
      data: backup,
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
      message: error.message || 'Failed to fetch backups',
    });
  }
};

/**
 * Get backup by ID
 * GET /api/system-admin/backups/:id
 */
export const getBackupById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const backup = await Backup.findById(id);

    if (!backup) {
      return res.status(404).json({
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
      message: error.message || 'Failed to fetch backup',
    });
  }
};

/**
 * Download backup
 * GET /api/system-admin/backups/:id/download
 */
export const downloadBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
    }

    if (backup.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot download incomplete backup',
      });
    }

    // Generate signed URL (expires in 1 hour)
    const downloadUrl = await r2Service.getSignedDownloadUrl(backup.r2Key, 3600);

    // Log download
    await AuditLog.create({
      user: userId,
      action: 'backup_downloaded',
      resource: 'backup',
      resourceId: backup.id,
      details: {
        fileName: backup.fileName,
      },
    });

    res.json({
      success: true,
      data: {
        url: downloadUrl,
        fileName: backup.fileName,
        expiresIn: 3600,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to download backup',
    });
  }
};

/**
 * Restore backup
 * POST /api/system-admin/backups/:id/restore
 */
export const restoreBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
    }

    // Start restore in background (in production, use a job queue)
    backupService.restoreBackup(id, userId).catch(error => {
      console.error('Restore failed:', error);
    });

    res.json({
      success: true,
      message: 'Backup restore started. This may take several minutes.',
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
export const deleteBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const backup = await Backup.findById(id);

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found',
      });
    }

    // Delete from R2
    if (backup.r2Key) {
      try {
        await r2Service.deleteFile(backup.r2Key);
      } catch (error) {
        console.error('Failed to delete from R2:', error);
      }
    }

    // Delete backup record
    await Backup.findByIdAndDelete(id);

    // Log deletion
    await AuditLog.create({
      user: userId,
      action: 'backup_deleted',
      resource: 'backup',
      resourceId: backup.id,
      details: {
        fileName: backup.fileName,
      },
    });

    res.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete backup',
    });
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
      message: error.message || 'Failed to fetch stats',
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
      message: error.message || 'Failed to fetch schedules',
    });
  }
};

/**
 * Create backup schedule
 * POST /api/system-admin/backup-schedules
 */
export const createBackupSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const { name, frequency, time, dayOfWeek, dayOfMonth, retentionDays } = req.body;
    const userId = req.user?.username || 'system';

    const schedule = await BackupSchedule.create({
      name,
      frequency,
      time,
      dayOfWeek,
      dayOfMonth,
      retentionDays,
      createdBy: userId,
    });

    // Log creation
    await AuditLog.create({
      user: userId,
      action: 'backup_schedule_created',
      resource: 'backup_schedule',
      resourceId: schedule.id,
      details: {
        name,
        frequency,
        time,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Backup schedule created successfully',
      data: schedule,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create schedule',
    });
  }
};

/**
 * Update backup schedule
 * PUT /api/system-admin/backup-schedules/:id
 */
export const updateBackupSchedule = async (req: AuthRequest, res: Response) => {
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
      return res.status(404).json({
        success: false,
        message: 'Backup schedule not found',
      });
    }

    // Log update
    await AuditLog.create({
      user: userId,
      action: 'backup_schedule_updated',
      resource: 'backup_schedule',
      resourceId: schedule.id,
      details: updates,
    });

    res.json({
      success: true,
      message: 'Backup schedule updated successfully',
      data: schedule,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update schedule',
    });
  }
};

/**
 * Delete backup schedule
 * DELETE /api/system-admin/backup-schedules/:id
 */
export const deleteBackupSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.username || 'system';

    const schedule = await BackupSchedule.findByIdAndDelete(id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Backup schedule not found',
      });
    }

    // Log deletion
    await AuditLog.create({
      user: userId,
      action: 'backup_schedule_deleted',
      resource: 'backup_schedule',
      resourceId: schedule.id,
      details: {
        name: schedule.name,
      },
    });

    res.json({
      success: true,
      message: 'Backup schedule deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete schedule',
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
      user: userId,
      action: 'backups_cleaned',
      resource: 'backup',
      details: {
        retentionDays,
        deletedCount,
      },
    });

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old backup(s)`,
      data: { deletedCount },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cleanup backups',
    });
  }
};
