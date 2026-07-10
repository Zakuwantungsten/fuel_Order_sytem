import Redis from 'ioredis';
import logger from '../utils/logger';

let redisClient: Redis | null = null;
// Dedicated pub/sub connections for Socket.io Redis adapter (required for PM2 cluster).
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

const REDIS_URL = process.env.REDIS_URL || '';

function createClient(label: string): Redis | null {
  if (!REDIS_URL) {
    logger.warn(`Redis not configured (${label}) — REDIS_URL is missing. Running in single-instance mode.`);
    return null;
  }

  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) {
        logger.error(`Redis ${label}: max retries reached, giving up`);
        return null; // stop retrying
      }
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
    lazyConnect: true,
  });

  client.on('connect', () => logger.info(`Redis ${label}: connected`));
  client.on('error', (err) => logger.error(`Redis ${label} error:`, err.message));
  client.on('close', () => logger.warn(`Redis ${label}: connection closed`));

  return client;
}

/**
 * Connect to Redis. Creates three clients:
 * - redisClient: general commands (cache, sessions)
 * - redisPub: Socket.io adapter publisher
 * - redisSub: Socket.io adapter subscriber
 *
 * If REDIS_URL is not set, all clients are null and the system
 * operates in single-instance mode (no cross-replica pub/sub).
 */
export async function connectRedis(): Promise<void> {
  if (!REDIS_URL) {
    logger.warn('REDIS_URL not set — Redis disabled. Socket.io will run in-memory only.');
    return;
  }

  try {
    redisClient = createClient('main');
    redisPub = createClient('pub');
    redisSub = createClient('sub');

    await Promise.all([
      redisClient?.connect(),
      redisPub?.connect(),
      redisSub?.connect(),
    ]);

    logger.info('Redis: main + pub/sub clients connected (Socket.io multi-instance ready)');
  } catch (error) {
    logger.error('Redis connection failed — falling back to in-memory mode:', error);
    redisClient = null;
    redisPub = null;
    redisSub = null;
  }
}

/** General Redis client for caching / sessions */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/** Publisher client for Socket.io Redis adapter */
export function getRedisPub(): Redis | null {
  return redisPub;
}

/** Subscriber client for Socket.io Redis adapter */
export function getRedisSub(): Redis | null {
  return redisSub;
}

/** Check if Redis is available */
export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Create a fresh ioredis connection suitable for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null for its blocking commands.
 * Each Queue / Worker should get its own dedicated connection.
 */
export function createBullMQConnection(): Redis | null {
  if (!REDIS_URL) return null;
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
  });
}

/**
 * Graceful shutdown — close all Redis connections.
 */
export async function disconnectRedis(): Promise<void> {
  const closers: Promise<unknown>[] = [];
  if (redisClient) {
    closers.push(redisClient.quit().catch(() => {}));
    redisClient = null;
  }
  if (redisPub) {
    closers.push(redisPub.quit().catch(() => {}));
    redisPub = null;
  }
  if (redisSub) {
    closers.push(redisSub.quit().catch(() => {}));
    redisSub = null;
  }
  await Promise.all(closers);
  logger.info('Redis: clients disconnected');
}
