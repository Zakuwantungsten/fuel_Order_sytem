/**
 * Session Anomaly Controller
 *
 * Enriches active sessions with risk indicators by cross-referencing
 * LoginActivity history and KnownDevice trust status.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import activeSessionTracker from '../utils/activeSessionTracker';
import { KnownDevice } from '../models/KnownDevice';
import LoginActivity from '../models/LoginActivity';

interface SessionAnomaly {
  userId: string;
  username: string;
  role: string;
  ip: string;
  firstSeen: string;
  lastSeen: string;
  requestCount: number;
  riskScore: number;
  anomalyReasons: string[];
  isNewDevice: boolean;
  deviceBlocked: boolean;
  deviceTrusted: boolean;
}

/**
 * GET /system-admin/sessions/anomalies
 * Returns active sessions enriched with anomaly analysis.
 */
export async function getSessionAnomalies(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const sessions = await activeSessionTracker.getActive();
    if (sessions.length === 0) {
      return res.json({ success: true, data: { sessions: [], riskySessions: 0 } });
    }

    // Batch-load recent login activity for all active users
    const userIds = sessions.map(s => s.userId);
    const recentLogins = await LoginActivity.find({
      userId: { $in: userIds },
      isCurrent: true,
    })
      .sort({ loginAt: -1 })
      .lean();

    const loginMap = new Map<string, typeof recentLogins[0]>();
    for (const login of recentLogins) {
      const key = login.userId.toString();
      if (!loginMap.has(key)) loginMap.set(key, login);
    }

    // Batch-load known device statuses
    const deviceDocs = await KnownDevice.find({ userId: { $in: userIds } }).lean();
    const deviceMap = new Map<string, typeof deviceDocs>();
    for (const d of deviceDocs) {
      const key = d.userId.toString();
      if (!deviceMap.has(key)) deviceMap.set(key, []);
      deviceMap.get(key)!.push(d);
    }

    // Analyze each session
    const enriched: SessionAnomaly[] = [];
    let riskySessions = 0;

    for (const session of sessions) {
      let riskScore = 0;
      const reasons: string[] = [];
      let isNewDevice = false;
      let deviceBlocked = false;
      let deviceTrusted = false;

      const login = loginMap.get(session.userId);
      const devices = deviceMap.get(session.userId) || [];

      // Check 1: New device
      if (login?.isNewDevice) {
        riskScore += 30;
        reasons.push('New device');
        isNewDevice = true;
      }

      // Check 2: Device blocked
      const matchingDevice = devices.find(d => {
        if (!login) return false;
        return d.browser === login.browser && d.os === login.os;
      });

      if (matchingDevice?.blocked) {
        riskScore += 50;
        reasons.push('Blocked device');
        deviceBlocked = true;
      }
      if (matchingDevice?.trusted) {
        deviceTrusted = true;
      }

      // Check 3: Unusual IP — not seen in last 30 days of logins
      if (login) {
        const recentIPs = await LoginActivity.distinct('ipAddress', {
          userId: login.userId,
          loginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        });
        const uniqueRecent = new Set(recentIPs);
        if (uniqueRecent.size > 1 && !uniqueRecent.has(session.ip)) {
          riskScore += 20;
          reasons.push('Unusual IP address');
        }
      }

      // Check 4: Off-hours activity (before 6 AM or after 10 PM local server time)
      const hour = new Date().getHours();
      if (hour < 6 || hour >= 22) {
        const timeSinceFirst = Date.now() - new Date(session.firstSeen).getTime();
        if (timeSinceFirst < 10 * 60 * 1000) {
          // Session started within last 10 minutes during off-hours
          riskScore += 15;
          reasons.push('Off-hours activity');
        }
      }

      if (riskScore > 0) riskySessions++;

      enriched.push({
        userId: session.userId,
        username: session.username,
        role: session.role,
        ip: session.ip,
        firstSeen: session.firstSeen.toISOString(),
        lastSeen: session.lastSeen.toISOString(),
        requestCount: session.requestCount,
        riskScore,
        anomalyReasons: reasons,
        isNewDevice,
        deviceBlocked,
        deviceTrusted,
      });
    }

    // Sort by risk score descending
    enriched.sort((a, b) => b.riskScore - a.riskScore);

    return res.json({
      success: true,
      data: {
        sessions: enriched,
        riskySessions,
        total: enriched.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to analyze sessions', error: error.message });
  }
}
