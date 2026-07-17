import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import BlocklistService from '../services/blocklistService';
import { unblockIPs } from '../scripts/unblockAllIPs';
import { refreshIPRuleCache } from '../middleware/ipFilter';
import { securityAlertService } from '../services/securityAlertService';
import { getClientIP } from '../utils/getClientIP';
import { timingSafeEqualStrings } from '../utils/requestSecurityContext';
import logger from '../utils/logger';

/** Tight limit — endpoint is unauthenticated but secret-gated. */
export const emergencyUnblockRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/v1/security/emergency-unblock
 * Header: X-Emergency-Token: <SECURITY_EMERGENCY_UNBLOCK_TOKEN>
 *
 * Clears all active auto-blocks when SuperAdmin UI is unreachable.
 * Disabled when SECURITY_EMERGENCY_UNBLOCK_TOKEN is unset.
 */
export async function emergencyUnblock(req: Request, res: Response): Promise<void> {
  const configuredToken = config.securityEmergencyUnblockToken;
  if (!configuredToken) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  const provided = req.headers['x-emergency-token'];
  const token = typeof provided === 'string' ? provided : '';
  if (!timingSafeEqualStrings(token, configuredToken)) {
    logger.warn('Emergency unblock: invalid token attempt', { ip: getClientIP(req) });
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  try {
    const before = await BlocklistService.getStats();
    await unblockIPs();
    BlocklistService.flushMemoryBlocks();
    await BlocklistService.forceSync();
    await refreshIPRuleCache();

    const after = await BlocklistService.getStats();
    const cleared = Math.max(0, before.activeBlocks - after.activeBlocks);

    securityAlertService.send({
      eventType: 'emergency_unblock',
      severity: 'critical',
      ip: getClientIP(req),
      title: 'Emergency IP unblock executed',
      description:
        `An operator invoked the emergency unblock endpoint and cleared ${cleared} active auto-block(s). ` +
        'Review the security dashboard if this was unexpected.',
      details: { clearedBlocks: cleared, activeBlocksRemaining: after.activeBlocks },
    }).catch(() => {});

    logger.warn('Emergency unblock executed', {
      ip: getClientIP(req),
      clearedBlocks: cleared,
    });

    res.status(200).json({
      success: true,
      message: 'Auto-blocks cleared',
      clearedBlocks: cleared,
      activeBlocksRemaining: after.activeBlocks,
    });
  } catch (err) {
    logger.error('Emergency unblock failed', err);
    res.status(500).json({ success: false, message: 'Emergency unblock failed' });
  }
}
