import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import r2Service from '../services/r2Service';
import { AuditService } from '../utils/auditService';
import logger from '../utils/logger';

/**
 * GET /api/system-admin/storage/info
 */
export const getStorageInfo = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!r2Service.isEnabled()) {
    res.json({
      success: true,
      data: { enabled: false, bucketName: null, totalFiles: 0, totalBytes: 0, files: [] },
    });
    return;
  }

  const files = await r2Service.listFiles();
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

  // Categorise by prefix
  const categories: Record<string, { count: number; bytes: number }> = {};
  for (const f of files) {
    const prefix = f.key.split('/')[0] || 'root';
    if (!categories[prefix]) categories[prefix] = { count: 0, bytes: 0 };
    categories[prefix].count += 1;
    categories[prefix].bytes += f.size || 0;
  }

  res.json({
    success: true,
    data: {
      enabled: true,
      totalFiles: files.length,
      totalBytes,
      categories,
      recentFiles: files
        .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
        .slice(0, 20)
        .map((f) => ({ key: f.key, size: f.size, lastModified: f.lastModified })),
    },
  });
};

/**
 * DELETE /api/system-admin/storage/purge-temp
 * Deletes all objects under the "temp/" prefix (export center temporary files)
 */
export const purgeTempFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!r2Service.isEnabled()) {
    res.status(503).json({ success: false, message: 'Storage service not configured' });
    return;
  }

  const tempFiles = await r2Service.listFiles('temp/');
  let deleted = 0;
  const errors: string[] = [];

  for (const f of tempFiles) {
    try {
      await r2Service.deleteFile(f.key);
      deleted++;
    } catch (err) {
      errors.push(f.key);
      logger.error(`Failed to delete temp file ${f.key}:`, err);
    }
  }

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'DELETE',
    resourceType: 'storage',
    details: `Purged ${deleted} temp file(s) from R2 bucket. Failures: ${errors.length}`,
    severity: 'high',
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `${deleted} temp file(s) deleted${errors.length ? `, ${errors.length} failed` : ''}`,
    data: { deleted, failed: errors.length },
  });
};

