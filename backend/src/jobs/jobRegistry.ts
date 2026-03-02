/**
 * Central Cron Job Registry
 *
 * Tracks all scheduled jobs: their status, last/next run times, run history.
 * Provides enable/disable, trigger-now, and status introspection for the
 * SuperAdmin Cron Job Manager Dashboard.
 */

import cron from 'node-cron';
import logger from '../utils/logger';

export type JobStatus = 'idle' | 'running' | 'error' | 'disabled';

export interface JobRunRecord {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  success: boolean;
  message?: string;
}

export interface JobEntry {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  isEnabled: boolean;
  status: JobStatus;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'error';
  lastRunDuration?: number;
  nextRunAt?: string;
  runHistory: JobRunRecord[];
  handler: () => Promise<void>;
  task?: cron.ScheduledTask;
}

const MAX_HISTORY = 20;

class JobRegistry {
  private jobs = new Map<string, JobEntry>();

  register(entry: Omit<JobEntry, 'runHistory' | 'status' | 'task'>) {
    const existing = this.jobs.get(entry.id);
    // Preserve run history if re-registering
    const runHistory = existing?.runHistory ?? [];
    this.jobs.set(entry.id, {
      ...entry,
      status: entry.isEnabled ? 'idle' : 'disabled',
      runHistory,
    });
  }

  private updateNextRun(job: JobEntry) {
    if (!job.isEnabled || !cron.validate(job.cronExpression)) {
      job.nextRunAt = undefined;
      return;
    }
    // Approximate next run using croner (node-cron doesn't expose next-run).
    // We compute the next matching date manually via a lightweight approach.
    try {
      // node-cron doesn't provide nextDate() so we skip exact computation here;
      // the frontend can display the expression instead, and we set a rough hint.
      job.nextRunAt = undefined;
    } catch {
      job.nextRunAt = undefined;
    }
  }

  private scheduleTask(job: JobEntry) {
    if (job.task) {
      job.task.stop();
      job.task = undefined;
    }
    if (!job.isEnabled || !cron.validate(job.cronExpression)) return;

    job.task = cron.schedule(job.cronExpression, async () => {
      await this.executeJob(job.id);
    });
  }

  /** Start all enabled jobs. Called once on server startup. */
  startAll() {
    for (const job of this.jobs.values()) {
      if (job.isEnabled) {
        this.scheduleTask(job);
        logger.info(`[JobRegistry] Scheduled: "${job.name}" (${job.cronExpression})`);
      }
    }
  }

  /** Stop all running tasks (e.g. graceful shutdown). */
  stopAll() {
    for (const job of this.jobs.values()) {
      if (job.task) {
        job.task.stop();
        job.task = undefined;
      }
    }
  }

  /** Execute a job immediately (manual trigger). */
  async executeJob(id: string): Promise<JobRunRecord> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job "${id}" not found`);
    if (job.status === 'running') throw new Error(`Job "${job.name}" is already running`);

    job.status = 'running';
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let success = false;
    let message: string | undefined;

    try {
      logger.info(`[JobRegistry] Running job: ${job.name}`);
      await job.handler();
      success = true;
      message = 'Completed successfully';
    } catch (err: any) {
      success = false;
      message = err?.message ?? 'Unknown error';
      logger.error(`[JobRegistry] Job "${job.name}" failed:`, err);
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;

    const record: JobRunRecord = { startedAt, finishedAt, durationMs, success, message };
    job.runHistory = [record, ...job.runHistory].slice(0, MAX_HISTORY);
    job.lastRunAt = finishedAt;
    job.lastRunStatus = success ? 'success' : 'error';
    job.lastRunDuration = durationMs;
    job.status = job.isEnabled ? 'idle' : 'disabled';

    if (!success) job.status = 'error';
    // Reset to idle after a moment so error state is visible but transient
    if (!success) {
      setTimeout(() => {
        if (job.status === 'error') job.status = job.isEnabled ? 'idle' : 'disabled';
      }, 60_000);
    }

    return record;
  }

  /** Enable a job and reschedule it. */
  enable(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job "${id}" not found`);
    job.isEnabled = true;
    job.status = 'idle';
    this.scheduleTask(job);
    logger.info(`[JobRegistry] Enabled: ${job.name}`);
  }

  /** Disable a job and stop its schedule. */
  disable(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job "${id}" not found`);
    job.isEnabled = false;
    job.status = 'disabled';
    if (job.task) {
      job.task.stop();
      job.task = undefined;
    }
    logger.info(`[JobRegistry] Disabled: ${job.name}`);
  }

  /** Return a serializable snapshot of all jobs (no handlers/task references). */
  listJobs(): Omit<JobEntry, 'handler' | 'task'>[] {
    return Array.from(this.jobs.values()).map(({ handler: _h, task: _t, ...rest }) => rest);
  }

  getJob(id: string): Omit<JobEntry, 'handler' | 'task'> | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const { handler: _h, task: _t, ...rest } = job;
    return rest;
  }
}

export const jobRegistry = new JobRegistry();
