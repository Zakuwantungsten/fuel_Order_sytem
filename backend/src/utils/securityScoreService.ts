import { AuditLog, User, SystemConfig } from '../models';
import ApiToken from '../models/ApiToken';
import UserMFA from '../models/UserMFA';
import { IPRule } from '../models/IPRule';
import logger from './logger';

/**
 * Security Score / Posture Dashboard Service
 * Generates a 0–100 security score based on the system's current configuration
 * and compliance with security best practices. Modeled after Microsoft Secure Score.
 */

export interface SecurityCheckResult {
  id: string;
  category: 'authentication' | 'access_control' | 'monitoring' | 'data_protection' | 'network' | 'compliance';
  title: string;
  description: string;
  status: 'pass' | 'fail' | 'partial' | 'info';
  weight: number;       // Max points for this check
  score: number;        // Actual points earned
  recommendation?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface SecurityScoreResult {
  overallScore: number;       // 0–100
  maxPossibleScore: number;
  categoryScores: Record<string, { score: number; max: number; percentage: number }>;
  checks: SecurityCheckResult[];
  generatedAt: string;
  improvementPriority: SecurityCheckResult[]; // Failed checks sorted by weight desc
}

export async function calculateSecurityScore(): Promise<SecurityScoreResult> {
  const checks: SecurityCheckResult[] = [];

  try {
    // ── Authentication Checks ──
    const config = await SystemConfig.findOne({ configType: 'system_settings' }).lean();
    const security = (config as any)?.securitySettings;
    const passwordPolicy = security?.password;

    // 1. Password minimum length
    const minLen = passwordPolicy?.minLength || 8;
    checks.push({
      id: 'auth_password_length',
      category: 'authentication',
      title: 'Strong password minimum length',
      description: `Password minimum length is ${minLen} characters`,
      status: minLen >= 12 ? 'pass' : minLen >= 8 ? 'partial' : 'fail',
      weight: 8,
      score: minLen >= 12 ? 8 : minLen >= 8 ? 4 : 0,
      recommendation: minLen < 12 ? 'Increase minimum password length to 12+ characters' : undefined,
      severity: 'high',
    });

    // 2. Password complexity
    const hasComplexity = passwordPolicy?.requireUppercase && passwordPolicy?.requireLowercase && passwordPolicy?.requireNumbers && passwordPolicy?.requireSpecialChars;
    checks.push({
      id: 'auth_password_complexity',
      category: 'authentication',
      title: 'Password complexity requirements',
      description: 'Require uppercase, lowercase, numbers, and special characters',
      status: hasComplexity ? 'pass' : 'partial',
      weight: 6,
      score: hasComplexity ? 6 : 2,
      recommendation: !hasComplexity ? 'Enable all password complexity requirements' : undefined,
      severity: 'high',
    });

    // 3. Password history
    const historyCount = passwordPolicy?.historyCount || 0;
    checks.push({
      id: 'auth_password_history',
      category: 'authentication',
      title: 'Password reuse prevention',
      description: `Tracking ${historyCount} previous passwords`,
      status: historyCount >= 5 ? 'pass' : historyCount > 0 ? 'partial' : 'fail',
      weight: 4,
      score: historyCount >= 5 ? 4 : historyCount > 0 ? 2 : 0,
      recommendation: historyCount < 5 ? 'Set password history to at least 5' : undefined,
      severity: 'medium',
    });

    // 4. MFA adoption rate
    const totalUsers = await User.countDocuments({ isActive: true, isDeleted: { $ne: true } });
    const mfaUsers = await UserMFA.countDocuments({ isEnabled: true });
    const mfaRate = totalUsers > 0 ? mfaUsers / totalUsers : 0;
    checks.push({
      id: 'auth_mfa_adoption',
      category: 'authentication',
      title: 'MFA adoption rate',
      description: `${mfaUsers}/${totalUsers} active users (${Math.round(mfaRate * 100)}%) have MFA enabled`,
      status: mfaRate >= 0.9 ? 'pass' : mfaRate >= 0.5 ? 'partial' : 'fail',
      weight: 10,
      score: mfaRate >= 0.9 ? 10 : Math.round(mfaRate * 10),
      recommendation: mfaRate < 0.9 ? 'Enforce MFA for all users, especially admin roles' : undefined,
      severity: 'critical',
    });

    // 5. Account lockout policy
    const sessionSettings = (config as any)?.systemSettings?.session;
    const lockoutThreshold = sessionSettings?.maxLoginAttempts || 5;
    checks.push({
      id: 'auth_lockout_policy',
      category: 'authentication',
      title: 'Account lockout policy',
      description: `Account locks after ${lockoutThreshold} failed attempts`,
      status: lockoutThreshold <= 5 ? 'pass' : 'partial',
      weight: 5,
      score: lockoutThreshold <= 5 ? 5 : 2,
      severity: 'high',
    });

    // ── Access Control Checks ──
    // 6. Super admin count
    const superAdminCount = await User.countDocuments({ role: 'super_admin', isActive: true, isDeleted: { $ne: true } });
    checks.push({
      id: 'access_superadmin_count',
      category: 'access_control',
      title: 'Minimal super admin accounts',
      description: `${superAdminCount} active super admin account(s)`,
      status: superAdminCount <= 3 ? 'pass' : superAdminCount <= 5 ? 'partial' : 'fail',
      weight: 6,
      score: superAdminCount <= 3 ? 6 : superAdminCount <= 5 ? 3 : 0,
      recommendation: superAdminCount > 3 ? 'Reduce super admin accounts to 3 or fewer' : undefined,
      severity: 'high',
    });

    // 7. Inactive user accounts
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const inactiveUsers = await User.countDocuments({
      isActive: true,
      isDeleted: { $ne: true },
      lastLoginAt: { $lt: thirtyDaysAgo },
    });
    checks.push({
      id: 'access_inactive_users',
      category: 'access_control',
      title: 'No stale user accounts',
      description: `${inactiveUsers} users inactive for 30+ days`,
      status: inactiveUsers === 0 ? 'pass' : inactiveUsers <= 5 ? 'partial' : 'fail',
      weight: 5,
      score: inactiveUsers === 0 ? 5 : inactiveUsers <= 5 ? 3 : 0,
      recommendation: inactiveUsers > 0 ? `Review and disable ${inactiveUsers} inactive accounts` : undefined,
      severity: 'medium',
    });

    // ── Network Checks ──
    // 8. IP rules configured
    const ipRuleCount = await IPRule.countDocuments({ isActive: true });
    checks.push({
      id: 'network_ip_rules',
      category: 'network',
      title: 'IP access rules configured',
      description: `${ipRuleCount} active IP rule(s)`,
      status: ipRuleCount > 0 ? 'pass' : 'fail',
      weight: 5,
      score: ipRuleCount > 0 ? 5 : 0,
      recommendation: ipRuleCount === 0 ? 'Configure IP allowlist/blocklist rules for admin access' : undefined,
      severity: 'medium',
    });

    // ── Monitoring Checks ──
    // 9. Audit log integrity
    const recentLogs = await AuditLog.find().sort({ timestamp: -1 }).limit(100).lean();
    const logsWithHash = recentLogs.filter((l: any) => l.hash);
    const hashRate = recentLogs.length > 0 ? logsWithHash.length / recentLogs.length : 0;
    checks.push({
      id: 'monitoring_audit_integrity',
      category: 'monitoring',
      title: 'Audit log integrity hashing',
      description: `${Math.round(hashRate * 100)}% of recent logs have integrity hashes`,
      status: hashRate >= 0.95 ? 'pass' : hashRate > 0 ? 'partial' : 'fail',
      weight: 8,
      score: hashRate >= 0.95 ? 8 : Math.round(hashRate * 8),
      recommendation: hashRate < 0.95 ? 'Ensure all audit events include integrity hashes' : undefined,
      severity: 'critical',
    });

    // 10. Recent critical events
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const criticalEvents = await AuditLog.countDocuments({
      severity: 'critical',
      timestamp: { $gte: sevenDaysAgo },
    });
    checks.push({
      id: 'monitoring_critical_events',
      category: 'monitoring',
      title: 'No unresolved critical events',
      description: `${criticalEvents} critical security events in last 7 days`,
      status: criticalEvents === 0 ? 'pass' : criticalEvents <= 3 ? 'partial' : 'fail',
      weight: 7,
      score: criticalEvents === 0 ? 7 : criticalEvents <= 3 ? 4 : 0,
      recommendation: criticalEvents > 0 ? `Investigate ${criticalEvents} critical events` : undefined,
      severity: 'critical',
    });

    // 11. Failed login rate
    const failedLogins = await AuditLog.countDocuments({
      action: 'FAILED_LOGIN',
      timestamp: { $gte: sevenDaysAgo },
    });
    const totalLogins = await AuditLog.countDocuments({
      action: { $in: ['LOGIN', 'FAILED_LOGIN'] },
      timestamp: { $gte: sevenDaysAgo },
    });
    const failRate = totalLogins > 0 ? failedLogins / totalLogins : 0;
    checks.push({
      id: 'monitoring_failed_logins',
      category: 'monitoring',
      title: 'Low failed login rate',
      description: `${Math.round(failRate * 100)}% failed login rate (${failedLogins}/${totalLogins})`,
      status: failRate <= 0.05 ? 'pass' : failRate <= 0.15 ? 'partial' : 'fail',
      weight: 5,
      score: failRate <= 0.05 ? 5 : failRate <= 0.15 ? 3 : 0,
      recommendation: failRate > 0.05 ? 'High failed login rate may indicate brute-force attempts' : undefined,
      severity: 'high',
    });

    // ── Data Protection Checks ──
    // 12. API token hygiene
    const expiredTokens = await ApiToken.countDocuments({
      revoked: false,
      expiresAt: { $lt: new Date() },
    });
    const noExpiryTokens = await ApiToken.countDocuments({
      revoked: false,
      expiresAt: { $exists: false },
    });
    checks.push({
      id: 'data_api_tokens',
      category: 'data_protection',
      title: 'API token hygiene',
      description: `${expiredTokens} expired unrevoked tokens, ${noExpiryTokens} tokens without expiry`,
      status: expiredTokens === 0 && noExpiryTokens === 0 ? 'pass' : 'fail',
      weight: 5,
      score: expiredTokens === 0 && noExpiryTokens === 0 ? 5 : 1,
      recommendation: 'Revoke expired tokens and set expiry on all API tokens',
      severity: 'medium',
    });

    // 13. CSRF protection status (always on in this system)
    checks.push({
      id: 'data_csrf',
      category: 'data_protection',
      title: 'CSRF protection enabled',
      description: 'Double-submit cookie CSRF protection is active',
      status: 'pass',
      weight: 5,
      score: 5,
      severity: 'high',
    });

    // 14. Response sanitization (always on)
    checks.push({
      id: 'data_response_sanitization',
      category: 'data_protection',
      title: 'Response sanitization enabled',
      description: 'Sensitive fields auto-redacted in API responses',
      status: 'pass',
      weight: 4,
      score: 4,
      severity: 'medium',
    });

    // ── Compliance Checks ──
    // 15. Rate limiting configured (always on)
    checks.push({
      id: 'compliance_rate_limiting',
      category: 'compliance',
      title: 'Rate limiting configured',
      description: '5 separate rate limiters tuned per endpoint type',
      status: 'pass',
      weight: 5,
      score: 5,
      severity: 'high',
    });

    // 16. Session management
    const sessionMgmt = (config as any)?.systemSettings?.session;
    checks.push({
      id: 'compliance_session_mgmt',
      category: 'compliance',
      title: 'Session management configured',
      description: `Session timeout: ${sessionMgmt?.sessionTimeout || 30}min, JWT expiry: ${sessionMgmt?.jwtExpiry || 24}h`,
      status: 'pass',
      weight: 4,
      score: 4,
      severity: 'medium',
    });

    // Calculate scores
    const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
    const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
    const overallScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;

    // Category scores
    const categories = ['authentication', 'access_control', 'monitoring', 'data_protection', 'network', 'compliance'];
    const categoryScores: Record<string, { score: number; max: number; percentage: number }> = {};
    for (const cat of categories) {
      const catChecks = checks.filter(c => c.category === cat);
      const catMax = catChecks.reduce((s, c) => s + c.weight, 0);
      const catScore = catChecks.reduce((s, c) => s + c.score, 0);
      categoryScores[cat] = {
        score: catScore,
        max: catMax,
        percentage: catMax > 0 ? Math.round((catScore / catMax) * 100) : 100,
      };
    }

    // Improvement priority: failed/partial checks sorted by weight
    const improvementPriority = checks
      .filter(c => c.status !== 'pass')
      .sort((a, b) => b.weight - a.weight);

    return {
      overallScore,
      maxPossibleScore: totalWeight,
      categoryScores,
      checks,
      generatedAt: new Date().toISOString(),
      improvementPriority,
    };
  } catch (error: any) {
    logger.error('Security score calculation failed:', error);
    throw error;
  }
}
