/**
 * notificationQueue.ts
 *
 * BullMQ-based async notification dispatch.
 * When Redis is available, push notifications are enqueued and processed
 * by a background worker — the HTTP request returns immediately.
 * When Redis is NOT available, falls back to direct (sync) sending.
 */

import { Queue, Worker, Job } from 'bullmq';
import { createBullMQConnection, isRedisAvailable } from '../config/redis';
import logger from '../utils/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PushJobData {
  recipients: string[];
  payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  };
}

// ── Queue & Worker singletons ────────────────────────────────────────────────

const QUEUE_NAME = 'push-notifications';

let pushQueue: Queue<PushJobData> | null = null;
let pushWorker: Worker<PushJobData> | null = null;

/**
 * Initialize the BullMQ queue and worker.
 * Must be called AFTER Redis is connected (in server.ts startup).
 * If Redis is not available, this is a no-op and the system uses direct sending.
 */
export function initNotificationQueue(): void {
  if (!isRedisAvailable()) {
    logger.warn('NotificationQueue: Redis not available — push notifications will be sent synchronously.');
    return;
  }

  const queueConnection = createBullMQConnection();
  const workerConnection = createBullMQConnection();

  if (!queueConnection || !workerConnection) {
    logger.warn('NotificationQueue: Could not create BullMQ connections — falling back to synchronous sending.');
    return;
  }

  // Create the queue (producer side)
  pushQueue = new Queue<PushJobData>(QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },  // keep last 500 completed jobs
      removeOnFail: { count: 200 },      // keep last 200 failed jobs
    },
  });

  // Create the worker (consumer side — runs in the same process)
  pushWorker = new Worker<PushJobData>(
    QUEUE_NAME,
    async (job: Job<PushJobData>) => {
      // Lazy-import to avoid circular dependency at module load time
      const { sendPushDirect } = await import('./pushNotificationService');
      await sendPushDirect(job.data.recipients, job.data.payload);
    },
    {
      connection: workerConnection,
      concurrency: 300, // process up to 300 push jobs in parallel
      limiter: {
        max: 50,       // max 50 jobs
        duration: 10000, // per 10 seconds — prevents flooding push APIs
      },
    },
  );

  pushWorker.on('completed', (job) => {
    logger.debug(`Push job ${job.id} completed`);
  });

  pushWorker.on('failed', (job, err) => {
    logger.error(`Push job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
  });

  pushWorker.on('error', (err) => {
    logger.error('Push worker error:', err.message);
  });

  logger.info('NotificationQueue: BullMQ queue + worker initialized (concurrency=300)');
}

/**
 * Enqueue a push notification job.
 * If the queue is not available (no Redis), returns false
 * and the caller should fall back to direct sending.
 */
export async function enqueuePush(
  recipients: string[],
  payload: PushJobData['payload']
): Promise<boolean> {
  if (!pushQueue) return false;

  try {
    await pushQueue.add('send-push', { recipients, payload }, {
      priority: 2, // normal priority
    });
    return true;
  } catch (err) {
    logger.error('Failed to enqueue push notification:', err);
    return false;
  }
}

/**
 * Enqueue a high-priority push notification (e.g., critical alerts).
 */
export async function enqueuePushUrgent(
  recipients: string[],
  payload: PushJobData['payload']
): Promise<boolean> {
  if (!pushQueue) return false;

  try {
    await pushQueue.add('send-push-urgent', { recipients, payload }, {
      priority: 1, // high priority — processed first
    });
    return true;
  } catch (err) {
    logger.error('Failed to enqueue urgent push notification:', err);
    return false;
  }
}

/**
 * Graceful shutdown — close worker and queue.
 */
export async function closeNotificationQueue(): Promise<void> {
  if (pushWorker) {
    await pushWorker.close();
    pushWorker = null;
  }
  if (pushQueue) {
    await pushQueue.close();
    pushQueue = null;
  }
  logger.info('NotificationQueue: closed');
}
