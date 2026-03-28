import cron from 'node-cron';
import BackupSchedule from '../models/BackupSchedule';
import backupService from '../services/backupService';
import logger from '../utils/logger';

/**
 * Backup Scheduler
 *
 * Runs every minute and checks for enabled BackupSchedule documents whose
 * nextRun time is due. For each due schedule it triggers a backup, then
 * updates lastRun and computes the next nextRun.
 */

let schedulerJob: cron.ScheduledTask | null = null;

/**
 * Given a BackupSchedule document whose job just ran, compute when it should
 * next execute. Uses the schedule's frequency / time / dayOfWeek / dayOfMonth
 * fields to step one period forward from the current time.
 */
function computeNextRun(schedule: {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}): Date {
  const [hours, minutes] = schedule.time.split(':').map(Number);

  const next = new Date();
  next.setSeconds(0, 0);

  if (schedule.frequency === 'daily') {
    // Advance to the next occurrence of the configured time (always tomorrow or
    // later to prevent immediate re-runs right after a backup completes).
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
  } else if (schedule.frequency === 'weekly') {
    const targetDay = schedule.dayOfWeek ?? 0; // default Sunday
    const daysUntil = ((targetDay - next.getDay() + 7) % 7) || 7;
    next.setDate(next.getDate() + daysUntil);
    next.setHours(hours, minutes, 0, 0);
  } else {
    // monthly
    const targetDom = schedule.dayOfMonth ?? 1;
    next.setDate(1); // avoid overflow (e.g. Jan 31 + 1 month)
    next.setMonth(next.getMonth() + 1);
    next.setDate(targetDom);
    next.setHours(hours, minutes, 0, 0);
  }

  return next;
}

async function runDueBackups() {
  try {
    const now = new Date();

    const dueSchedules = await BackupSchedule.find({
      enabled: true,
      nextRun: { $lte: now },
    });

    for (const schedule of dueSchedules) {
      logger.info(`[BACKUP SCHEDULER] Running scheduled backup: "${schedule.name}" (${schedule.frequency})`);

      try {
        await backupService.createBackup('system-scheduler', 'scheduled');
        logger.info(`[BACKUP SCHEDULER] Backup completed for schedule: "${schedule.name}"`);
      } catch (err: any) {
        logger.error(`[BACKUP SCHEDULER] Backup failed for schedule "${schedule.name}":`, err.message);
      }

      // Always advance the schedule even if the backup errored, to prevent a
      // failing backup from blocking all future runs in a busy-retry loop.
      schedule.lastRun = now;
      schedule.nextRun = computeNextRun({
        frequency: schedule.frequency,
        time: schedule.time,
        dayOfWeek: schedule.dayOfWeek,
        dayOfMonth: schedule.dayOfMonth,
      });
      await schedule.save();
    }

    // Apply retention cleanup for any schedule that defines a retentionDays value
    const activeSchedules = await BackupSchedule.find({ enabled: true, retentionDays: { $gt: 0 } });
    for (const schedule of activeSchedules) {
      try {
        await backupService.cleanupOldBackups(schedule.retentionDays);
      } catch (err: any) {
        logger.warn(`[BACKUP SCHEDULER] Retention cleanup failed for "${schedule.name}":`, err.message);
      }
    }
  } catch (err: any) {
    logger.error('[BACKUP SCHEDULER] Error in runDueBackups:', err.message);
  }
}

/**
 * Seed nextRun for any enabled schedule that does not yet have one set.
 * This runs once on startup so newly created schedules become active
 * without requiring a manual first-run trigger.
 */
async function seedNextRunIfMissing() {
  try {
    const schedules = await BackupSchedule.find({ enabled: true, nextRun: { $exists: false } });
    for (const schedule of schedules) {
      schedule.nextRun = computeNextRun({
        frequency: schedule.frequency,
        time: schedule.time,
        dayOfWeek: schedule.dayOfWeek,
        dayOfMonth: schedule.dayOfMonth,
      });
      await schedule.save();
      logger.info(`[BACKUP SCHEDULER] Initialised nextRun for schedule "${schedule.name}": ${schedule.nextRun}`);
    }
  } catch (err: any) {
    logger.warn('[BACKUP SCHEDULER] Could not seed nextRun values:', err.message);
  }
}

export function startBackupScheduler() {
  seedNextRunIfMissing().catch(() => { /* non-fatal */ });

  // Poll every minute for due schedules
  schedulerJob = cron.schedule('* * * * *', async () => {
    await runDueBackups();
  });

  logger.info('[BACKUP SCHEDULER] Started — polling every minute for due backup schedules');
}

export function stopBackupScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    logger.info('[BACKUP SCHEDULER] Stopped');
  }
}
