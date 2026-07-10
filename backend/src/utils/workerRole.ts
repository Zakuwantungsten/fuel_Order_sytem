/**
 * PM2 cluster helpers.
 *
 * In cluster mode PM2 sets NODE_APP_INSTANCE to "0", "1", … for each worker.
 * Background singletons (crons, change streams, DB monitor) must run on exactly
 * one worker or they duplicate work / double-emit realtime events.
 *
 * Outside PM2 (dev, bare `node`) there is no instance id → treat as primary.
 */
export function getWorkerInstanceId(): number {
  const raw = process.env.NODE_APP_INSTANCE;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function isPrimaryWorker(): boolean {
  return getWorkerInstanceId() === 0;
}
