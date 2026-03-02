import { Request, Response } from 'express';
import { calculateSecurityScore } from '../utils/securityScoreService';
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
