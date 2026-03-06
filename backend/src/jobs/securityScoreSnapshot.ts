/**
 * Security Score Snapshot Scheduler
 *
 * Takes a daily snapshot of the security score and stores it for trend analysis.
 * Runs daily at 2:00 AM. Also provides a manual trigger for the first snapshot.
 */

import cron from 'node-cron';
import { calculateSecurityScore } from '../utils/securityScoreService';
import { SecurityScoreSnapshot } from '../models/SecurityScoreSnapshot';
import { jobRegistry } from './jobRegistry';
import logger from '../utils/logger';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function takeScoreSnapshot(): Promise<void> {
  const today = startOfDay(new Date());

  // Skip if we already have a snapshot for today
  const existing = await SecurityScoreSnapshot.findOne({ date: today }).lean();
  if (existing) {
    logger.info('[SecurityScoreSnapshot] Snapshot already exists for today, skipping');
    return;
  }

  const score = await calculateSecurityScore();

  const summary = {
    total: score.checks.length,
    passed: score.checks.filter(c => c.status === 'pass').length,
    failed: score.checks.filter(c => c.status === 'fail').length,
    partial: score.checks.filter(c => c.status === 'partial').length,
  };

  await SecurityScoreSnapshot.create({
    date: today,
    overallScore: score.overallScore,
    categoryScores: score.categoryScores,
    checksSummary: summary,
  });

  logger.info(`[SecurityScoreSnapshot] Saved daily snapshot: score=${score.overallScore}`);
}

// Register with job registry
jobRegistry.register({
  id: 'security-score-snapshot',
  name: 'Security Score Snapshot',
  description: 'Takes a daily snapshot of the security posture score for trend analysis. Runs daily at 2:00 AM.',
  cronExpression: '0 2 * * *',
  isEnabled: true,
  handler: takeScoreSnapshot,
});

let snapshotTask: cron.ScheduledTask | null = null;

export function startSecurityScoreSnapshot(): void {
  snapshotTask = cron.schedule('0 2 * * *', async () => {
    try {
      await takeScoreSnapshot();
    } catch (err: any) {
      logger.error(`[SecurityScoreSnapshot] Failed: ${err.message}`);
    }
  });
  logger.info('[SecurityScoreSnapshot] Scheduler started — runs daily at 2:00 AM');
}

export function stopSecurityScoreSnapshot(): void {
  if (snapshotTask) {
    snapshotTask.stop();
    snapshotTask = null;
    logger.info('[SecurityScoreSnapshot] Scheduler stopped');
  }
}
