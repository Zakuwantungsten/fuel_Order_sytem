import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { jobRegistry } from '../jobs/jobRegistry';
import { ApiError } from '../middleware/errorHandler';
import AuditService from '../utils/auditService';
import logger from '../utils/logger';

/**
 * GET /api/v1/system-admin/cron-jobs
 * List all registered cron jobs with their current status.
 */
export const listJobs = async (req: AuthRequest, res: Response): Promise<void> => {
  const jobs = jobRegistry.listJobs();
  res.status(200).json({ success: true, data: jobs });
};

/**
 * POST /api/v1/system-admin/cron-jobs/:id/trigger
 * Manually trigger a cron job immediately.
 */
export const triggerJob = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const job = jobRegistry.getJob(id);
  if (!job) throw new ApiError(404, `Job "${id}" not found`);

  logger.info(`Manual job trigger: "${job.name}" by ${req.user?.username}`);
  AuditService.log({
    action: 'CONFIG_CHANGE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: 'cron_job',
    resourceId: id,
    details: `Manually triggered cron job: ${job.name}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  try {
    const record = await jobRegistry.executeJob(id);
    res.status(200).json({ success: true, data: record });
  } catch (err: any) {
    throw new ApiError(409, err?.message ?? 'Failed to trigger job');
  }
};

/**
 * PATCH /api/v1/system-admin/cron-jobs/:id/toggle
 * Enable or disable a cron job.
 */
export const toggleJob = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const job = jobRegistry.getJob(id);
  if (!job) throw new ApiError(404, `Job "${id}" not found`);

  if (job.isEnabled) {
    jobRegistry.disable(id);
  } else {
    jobRegistry.enable(id);
  }

  const updated = jobRegistry.getJob(id)!;
  AuditService.log({
    action: 'CONFIG_CHANGE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: 'cron_job',
    resourceId: id,
    details: `Cron job "${job.name}" ${updated.isEnabled ? 'enabled' : 'disabled'} by ${req.user?.username}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  res.status(200).json({ success: true, data: updated });
};
