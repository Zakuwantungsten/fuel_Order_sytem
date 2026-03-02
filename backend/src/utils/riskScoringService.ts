import { AuditLog, User } from '../models';
import geolocationService from './geolocationService';
import logger from './logger';

/**
 * Risk-Based / Adaptive Authentication Service
 * Assigns a 0–100 risk score to each login attempt.
 * Score drives step-up MFA decisions:
 *   0–30  = Low risk  → allow frictionless login
 *   31–60 = Medium    → require MFA if enabled
 *   61–80 = High      → force MFA / email verification
 *   81+   = Critical  → block + alert
 */

export interface RiskFactors {
  newDevice: boolean;
  newIP: boolean;
  newCountry: boolean;
  impossibleTravel: boolean;
  offHours: boolean;
  recentFailedAttempts: number;
  daysSinceLastLogin: number;
  isKnownBadIP: boolean;
  userRiskLevel: 'standard' | 'elevated' | 'admin';
}

export interface RiskAssessment {
  score: number;            // 0–100
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactors;
  requireMFA: boolean;
  blockLogin: boolean;
  reasons: string[];
}

const RISK_WEIGHTS = {
  newDevice: 10,
  newIP: 8,
  newCountry: 20,
  impossibleTravel: 40,
  offHours: 5,
  failedAttempts: 3,       // per failed attempt
  longAbsence: 10,         // >30 days since last login
  knownBadIP: 30,
  adminRole: 10,           // elevated risk for admin accounts
};

/**
 * Calculate login risk score based on contextual signals.
 */
export async function assessLoginRisk(
  userId: string,
  username: string,
  ipAddress: string,
  userAgent: string,
  userRole: string
): Promise<RiskAssessment> {
  const reasons: string[] = [];
  let score = 0;

  try {
    // 1. Determine user risk level (admin accounts get base risk bump)
    const isAdmin = ['super_admin', 'admin', 'boss'].includes(userRole);
    const userRiskLevel = isAdmin ? 'admin' : 'standard';
    if (isAdmin) {
      score += RISK_WEIGHTS.adminRole;
      reasons.push('Administrative account');
    }

    // 2. Check recent failed login attempts (last 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFailedAttempts = await AuditLog.countDocuments({
      action: 'FAILED_LOGIN',
      timestamp: { $gte: oneHourAgo },
      $or: [
        { 'details.username': username },
        { ipAddress },
      ],
    });
    if (recentFailedAttempts > 0) {
      const failPenalty = Math.min(recentFailedAttempts * RISK_WEIGHTS.failedAttempts, 30);
      score += failPenalty;
      reasons.push(`${recentFailedAttempts} failed login attempts in last hour`);
    }

    // 3. Check if IP is new for this user (not seen in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const previousIPLogins = await AuditLog.countDocuments({
      action: 'LOGIN',
      outcome: 'SUCCESS',
      username,
      ipAddress,
      timestamp: { $gte: thirtyDaysAgo },
    });
    const newIP = previousIPLogins === 0;
    if (newIP) {
      score += RISK_WEIGHTS.newIP;
      reasons.push('Login from new IP address');
    }

    // 4. Check device (user-agent) familiarity
    const previousDeviceLogins = await AuditLog.countDocuments({
      action: 'LOGIN',
      outcome: 'SUCCESS',
      username,
      userAgent,
      timestamp: { $gte: thirtyDaysAgo },
    });
    const newDevice = previousDeviceLogins === 0;
    if (newDevice) {
      score += RISK_WEIGHTS.newDevice;
      reasons.push('Login from new device');
    }

    // 5. Geolocation: new country + impossible travel
    let newCountry = false;
    let impossibleTravel = false;
    try {
      const geoResult = await geolocationService.detectNewCountryLogin(username, ipAddress);
      if (geoResult?.isNewCountry) {
        newCountry = true;
        score += RISK_WEIGHTS.newCountry;
        reasons.push(`Login from new country: ${geoResult.newCountry || 'Unknown'}`);
      }

      const travelResult = await geolocationService.detectImpossibleTravel(username, ipAddress);
      if (travelResult?.isImpossible) {
        impossibleTravel = true;
        score += RISK_WEIGHTS.impossibleTravel;
        reasons.push(`Impossible travel detected: ${travelResult.details || 'Location conflict'}`);
      }
    } catch (geoError) {
      // Geolocation failure is non-blocking
      logger.debug('Geolocation check failed during risk assessment:', geoError);
    }

    // 6. Off-hours check (8 PM – 6 AM local, or weekends)
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const offHours = hour < 6 || hour >= 20 || dayOfWeek === 0 || dayOfWeek === 6;
    if (offHours) {
      score += RISK_WEIGHTS.offHours;
      reasons.push('Login during off-hours');
    }

    // 7. Dormant account (>30 days since last login)
    const user = await User.findById(userId).select('lastLoginAt').lean();
    const lastLogin = (user as any)?.lastLoginAt;
    let daysSinceLastLogin = 0;
    if (lastLogin) {
      daysSinceLastLogin = Math.floor((Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastLogin > 30) {
        score += RISK_WEIGHTS.longAbsence;
        reasons.push(`Account dormant for ${daysSinceLastLogin} days`);
      }
    }

    // Clamp score to 0–100
    score = Math.min(Math.max(Math.round(score), 0), 100);

    // Determine risk level
    let level: RiskAssessment['level'];
    if (score >= 81) level = 'critical';
    else if (score >= 61) level = 'high';
    else if (score >= 31) level = 'medium';
    else level = 'low';

    return {
      score,
      level,
      factors: {
        newDevice,
        newIP,
        newCountry,
        impossibleTravel,
        offHours,
        recentFailedAttempts,
        daysSinceLastLogin,
        isKnownBadIP: false, // Can be enhanced with threat intelligence feeds
        userRiskLevel,
      },
      requireMFA: score >= 31,
      blockLogin: score >= 81,
      reasons,
    };
  } catch (error: any) {
    // On failure, return moderate risk (fail-safe)
    logger.error('Risk assessment failed (returning medium risk):', error.message);
    return {
      score: 40,
      level: 'medium',
      factors: {
        newDevice: false, newIP: false, newCountry: false,
        impossibleTravel: false, offHours: false,
        recentFailedAttempts: 0, daysSinceLastLogin: 0,
        isKnownBadIP: false, userRiskLevel: 'standard',
      },
      requireMFA: true,
      blockLogin: false,
      reasons: ['Risk assessment unavailable — applying precautionary MFA'],
    };
  }
}
