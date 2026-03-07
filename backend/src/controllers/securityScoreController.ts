import { Request, Response } from 'express';
import { calculateSecurityScore } from '../utils/securityScoreService';
import { SecurityScoreSnapshot } from '../models/SecurityScoreSnapshot';
import { takeScoreSnapshot } from '../jobs/securityScoreSnapshot';
import AuditService from '../utils/auditService';

/**
 * Security Score / Posture Dashboard Controller
 */
export const getSecurityScore = async (req: Request, res: Response) => {
  try {
    const score = await calculateSecurityScore();

    await AuditService.log({
      action: 'VIEW_SENSITIVE_DATA',
      resourceType: 'security_score',
      resourceId: 'dashboard',
      username: (req as any).user?.username || 'system',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ overallScore: score.overallScore }),
      severity: 'low',
      outcome: 'SUCCESS',
    });

    res.json({
      success: true,
      data: score,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to calculate security score',
      error: error.message,
    });
  }
};

/**
 * GET /system-admin/security-score/history?days=30
 * Returns daily score snapshots for trend charting.
 */
export const getSecurityScoreHistory = async (req: Request, res: Response) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await SecurityScoreSnapshot.find({ date: { $gte: since } })
      .sort({ date: 1 })
      .select('date overallScore categoryScores checksSummary')
      .lean();

    // If no snapshots exist yet, take one now (first-use bootstrap)
    if (snapshots.length === 0) {
      try {
        await takeScoreSnapshot();
        const fresh = await SecurityScoreSnapshot.find({ date: { $gte: since } })
          .sort({ date: 1 })
          .select('date overallScore categoryScores checksSummary')
          .lean();
        return res.json({ success: true, data: { days, snapshots: fresh } });
      } catch {
        // non-critical, return empty
        return res.json({ success: true, data: { days, snapshots: [] } });
      }
    }

    return res.json({ success: true, data: { days, snapshots } });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch score history',
      error: error.message,
    });
  }
};
