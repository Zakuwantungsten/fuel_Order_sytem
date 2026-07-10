/**
 * backgroundJobQueue.ts
 *
 * BullMQ queue for long-running / exclusive work:
 *   backup-create | backup-restore | backup-retention | backup-dr-drill | archival-run
 *
 * Pattern: HTTP (or cron) enqueues → any free PM2 worker claims the job via Redis
 * → other workers keep serving the site.
 *
 * When Redis is unavailable, jobs run in-process behind a Mongo EditLock so
 * cluster workers still cannot race (but the requesting worker is blocked).
 */

import { Queue, Worker, Job } from 'bullmq';
import { createBullMQConnection, isRedisAvailable } from '../config/redis';
import { EditLock } from '../models/EditLock';
import logger from '../utils/logger';

export type BackgroundJobName =
  | 'backup-create'
  | 'backup-restore'
  | 'backup-retention'
  | 'backup-dr-drill'
  | 'archival-run';

export interface BackgroundJobData {
  name: BackgroundJobName;
  triggeredBy: string;
  /** Manual / scheduled backup create */
  collections?: string[];
  type?: 'manual' | 'scheduled';
  retentionTier?: 'daily' | 'weekly' | 'monthly';
  /** Restore */
  backupId?: string;
  /** Archival */
  dryRun?: boolean;
  monthsToKeep?: number;
  auditLogMonthsToKeep?: number;
}

const QUEUE_NAME = 'background-jobs';

/** Jobs that must never run concurrently with each other (live DB / storage). */
const EXCLUSIVE_GROUP: Record<BackgroundJobName, string> = {
  'backup-create': 'backup-mutex',
  'backup-restore': 'backup-mutex',
  'backup-dr-drill': 'backup-mutex',
  'backup-retention': 'backup-retention',
  'archival-run': 'archival-mutex',
};

/** Stable BullMQ jobIds so duplicate enqueues collapse instead of stacking. */
const SINGLE_FLIGHT_IDS: Partial<Record<BackgroundJobName, string>> = {
  'backup-restore': 'backup-restore',
  'backup-retention': 'backup-retention',
  'backup-dr-drill': 'backup-dr-drill',
  'archival-run': 'archival-run',
};

let queue: Queue<BackgroundJobData> | null = null;
let worker: Worker<BackgroundJobData> | null = null;

async function withSystemLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const owner = `bg-job:${process.pid}:${key}`;
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 60 * 60 * 1000); // 60m max for long restores
  let acquired = false;

  try {
    try {
      await EditLock.findOneAndUpdate(
        {
          collectionName: '_system',
          documentId: key,
          $or: [{ lockedUntil: { $lt: now } }, { lockedBy: owner }],
        },
        {
          $set: {
            lockedBy: owner,
            lockedByName: `Background job (${key})`,
            lockedAt: now,
            lockedUntil: lockUntil,
          },
          $setOnInsert: { collectionName: '_system', documentId: key },
        },
        { upsert: true, new: true },
      );
    } catch (err: any) {
      if (err?.code === 11000 || err?.code === 11001) {
        throw new Error(`Background job locked: ${key} is already running on another worker`);
      }
      throw err;
    }

    const lock = await EditLock.findOne({ collectionName: '_system', documentId: key }).lean();
    if (!lock || lock.lockedBy !== owner) {
      throw new Error(`Background job locked: ${key} is already running on another worker`);
    }

    acquired = true;
    return await fn();
  } finally {
    if (acquired) {
      await EditLock.deleteOne({
        collectionName: '_system',
        documentId: key,
        lockedBy: owner,
      }).catch(() => { /* non-fatal */ });
    }
  }
}

async function runJob(data: BackgroundJobData): Promise<void> {
  const execute = async () => {
    switch (data.name) {
      case 'backup-create': {
        const backupService = (await import('./backupService')).default;
        await backupService.createBackup(
          data.triggeredBy,
          data.type || 'manual',
          data.collections,
          data.retentionTier,
          { skipRetention: true },
        );
        // Separate single-flight job so create mutex is released before prune
        await enqueueBackgroundJob({
          name: 'backup-retention',
          triggeredBy: data.triggeredBy,
        });
        break;
      }
      case 'backup-restore': {
        if (!data.backupId) throw new Error('backupId required for restore');
        const backupService = (await import('./backupService')).default;
        await backupService.restoreBackup(data.backupId, data.triggeredBy);
        break;
      }
      case 'backup-retention': {
        const backupService = (await import('./backupService')).default;
        const n = await backupService.applyConfiguredRetention();
        if (n > 0) logger.info(`[BG JOB] Retention pruned ${n} backup(s)`);
        break;
      }
      case 'backup-dr-drill': {
        const backupService = (await import('./backupService')).default;
        const report = await backupService.runDisasterRecoveryDrill(data.triggeredBy);
        if (!report.passed) throw new Error(report.details || 'DR drill failed');
        break;
      }
      case 'archival-run': {
        const archivalService = (await import('./archivalService')).default;
        const { SystemConfig } = await import('../models/SystemConfig');
        const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
        const result = await archivalService.archiveOldData(
          {
            monthsToKeep: data.monthsToKeep ?? sysConfig?.systemSettings?.data?.archivalMonths ?? 6,
            auditLogMonthsToKeep:
              data.auditLogMonthsToKeep ?? sysConfig?.systemSettings?.data?.auditLogRetention ?? 12,
            dryRun: data.dryRun ?? false,
            batchSize: 1000,
          },
          data.triggeredBy,
        );
        if (!result.success) {
          throw new Error(result.errors?.join(', ') ?? 'Archival failed');
        }
        break;
      }
      default:
        throw new Error(`Unknown background job: ${(data as any).name}`);
    }
  };

  // Retention uses backupService's own cluster lock — don't nest a second mutex.
  if (data.name === 'backup-retention') {
    await execute();
    return;
  }

  await withSystemLock(EXCLUSIVE_GROUP[data.name], execute);
}

export function initBackgroundJobQueue(): void {
  if (!isRedisAvailable()) {
    logger.warn('BackgroundJobQueue: Redis not available — jobs will run in-process with Mongo locks.');
    return;
  }

  const queueConnection = createBullMQConnection();
  const workerConnection = createBullMQConnection();
  if (!queueConnection || !workerConnection) {
    logger.warn('BackgroundJobQueue: Could not create BullMQ connections — in-process fallback.');
    return;
  }

  queue = new Queue<BackgroundJobData>(QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 1, // long jobs: don't auto-retry full restore/create
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 50 },
    },
  });

  // Low concurrency: each worker processes one heavy job at a time; Redis claims
  // distribute across PM2 instances. Exclusive Mongo mutex still prevents
  // create+restore overlapping across workers.
  worker = new Worker<BackgroundJobData>(
    QUEUE_NAME,
    async (job: Job<BackgroundJobData>) => {
      logger.info(`[BG JOB] Starting ${job.data.name} (id=${job.id}) by ${job.data.triggeredBy}`);
      await runJob(job.data);
      logger.info(`[BG JOB] Finished ${job.data.name} (id=${job.id})`);
    },
    {
      connection: workerConnection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`[BG JOB] ${job?.data?.name} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`[BG JOB] Worker error: ${err.message}`);
  });

  logger.info('BackgroundJobQueue: BullMQ queue + worker initialized (concurrency=1 per process)');
}

export interface EnqueueResult {
  queued: boolean;
  jobId?: string;
  ranInline?: boolean;
}

/**
 * Enqueue a background job. Falls back to inline execution (Mongo-locked) if Redis/queue is down.
 */
export async function enqueueBackgroundJob(data: BackgroundJobData): Promise<EnqueueResult> {
  if (queue) {
    try {
      const jobId = SINGLE_FLIGHT_IDS[data.name];
      const job = await queue.add(data.name, data, {
        ...(jobId ? { jobId } : {}),
        // backup-create: allow parallel enqueue of distinct jobs; mutex serializes execution
      });
      logger.info(`[BG JOB] Enqueued ${data.name} (id=${job.id}) by ${data.triggeredBy}`);
      return { queued: true, jobId: job.id };
    } catch (err: any) {
      // Duplicate jobId while previous still active — treat as success (already running)
      if (String(err?.message || '').includes('Job is already') || err?.code === -1) {
        logger.info(`[BG JOB] ${data.name} already queued/running — skipped duplicate`);
        return { queued: true, jobId: SINGLE_FLIGHT_IDS[data.name] };
      }
      logger.warn(`[BG JOB] Enqueue failed, running inline: ${err?.message}`);
    }
  }

  // Inline fallback (dev / Redis down)
  await runJob(data);
  return { queued: false, ranInline: true };
}

export async function closeBackgroundJobQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  logger.info('BackgroundJobQueue: closed');
}
