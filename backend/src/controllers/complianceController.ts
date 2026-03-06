/**
 * Compliance Controller
 *
 * Maps existing security score checks to compliance frameworks
 * relevant to a Tanzanian fuel logistics operation.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { calculateSecurityScore, SecurityCheckResult } from '../utils/securityScoreService';

/* ── compliance framework mapping ── */

interface ComplianceControl {
  id: string;
  framework: string;
  title: string;
  status: 'pass' | 'fail' | 'partial' | 'info';
  mappedChecks: string[];
  recommendation?: string;
}

interface ComplianceFramework {
  name: string;
  description: string;
  percentage: number;
  controls: ComplianceControl[];
  passed: number;
  failed: number;
  partial: number;
  total: number;
}

/**
 * Maps security score check IDs to compliance framework controls.
 * Each entry: [controlId, framework, title, ...checkIds]
 */
const FRAMEWORK_MAPPINGS: [string, string, string, ...string[]][] = [
  // Internal Security Policy
  ['ISP-1', 'Internal Security Policy', 'Password complexity enforced', 'auth_password_length', 'auth_password_complexity'],
  ['ISP-2', 'Internal Security Policy', 'MFA enabled for admin roles', 'auth_mfa_admin', 'auth_mfa_coverage'],
  ['ISP-3', 'Internal Security Policy', 'Session timeout configured', 'auth_session_timeout'],
  ['ISP-4', 'Internal Security Policy', 'Account lockout policy set', 'auth_lockout_policy'],
  ['ISP-5', 'Internal Security Policy', 'Audit logging enabled', 'monitoring_audit_logging'],
  ['ISP-6', 'Internal Security Policy', 'Security monitoring active', 'monitoring_security_events', 'monitoring_threat_detection'],
  ['ISP-7', 'Internal Security Policy', 'API tokens scoped', 'access_api_tokens'],
  ['ISP-8', 'Internal Security Policy', 'Break-glass access controlled', 'access_break_glass'],

  // Data Protection
  ['DP-1', 'Data Protection', 'Data export controls (DLP) configured', 'data_protection_dlp'],
  ['DP-2', 'Data Protection', 'Access logging enabled', 'monitoring_audit_logging', 'monitoring_security_events'],
  ['DP-3', 'Data Protection', 'Rate limiting configured', 'network_rate_limiting'],
  ['DP-4', 'Data Protection', 'CSRF protection active', 'network_csrf'],
  ['DP-5', 'Data Protection', 'Sensitive data access audited', 'monitoring_audit_logging'],

  // Operational Security
  ['OS-1', 'Operational Security', 'IP blocking enabled', 'access_ip_rules'],
  ['OS-2', 'Operational Security', 'Rate limiting configured', 'network_rate_limiting'],
  ['OS-3', 'Operational Security', 'CSRF protection active', 'network_csrf'],
  ['OS-4', 'Operational Security', 'Security monitoring enabled', 'monitoring_security_events', 'monitoring_threat_detection'],
  ['OS-5', 'Operational Security', 'Break-glass account governed', 'access_break_glass'],
  ['OS-6', 'Operational Security', 'Autoblock thresholds set', 'access_autoblock'],

  // Access Management
  ['AM-1', 'Access Management', 'Role-based access enforced', 'access_role_audit'],
  ['AM-2', 'Access Management', 'MFA for privileged roles', 'auth_mfa_admin'],
  ['AM-3', 'Access Management', 'IP allowlist operational', 'access_ip_rules'],
  ['AM-4', 'Access Management', 'Session management active', 'auth_session_timeout', 'auth_multiple_sessions'],
  ['AM-5', 'Access Management', 'Device tracking enabled', 'compliance_device_tracking'],
];

/**
 * GET /system-admin/compliance
 * Returns compliance status across multiple frameworks.
 */
export async function getComplianceStatus(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const scoreResult = await calculateSecurityScore();
    const checkMap = new Map<string, SecurityCheckResult>();
    for (const check of scoreResult.checks) {
      checkMap.set(check.id, check);
    }

    // Group by framework
    const frameworkMap = new Map<string, ComplianceControl[]>();

    for (const [controlId, framework, title, ...checkIds] of FRAMEWORK_MAPPINGS) {
      const mapped = checkIds.filter(id => checkMap.has(id));
      const checks = mapped.map(id => checkMap.get(id)!);

      let status: 'pass' | 'fail' | 'partial' | 'info' = 'info';
      if (checks.length > 0) {
        const allPass = checks.every(c => c.status === 'pass');
        const anyFail = checks.some(c => c.status === 'fail');
        status = allPass ? 'pass' : anyFail ? 'fail' : 'partial';
      }

      const failedRecs = checks.filter(c => c.status !== 'pass').map(c => c.recommendation).filter(Boolean);

      if (!frameworkMap.has(framework)) frameworkMap.set(framework, []);
      frameworkMap.get(framework)!.push({
        id: controlId,
        framework,
        title,
        status,
        mappedChecks: checkIds,
        recommendation: failedRecs[0],
      });
    }

    // Build framework summaries
    const frameworks: ComplianceFramework[] = [];
    const DESCRIPTIONS: Record<string, string> = {
      'Internal Security Policy': 'Organization-level security requirements for authentication, access control, and monitoring.',
      'Data Protection': 'Controls ensuring sensitive fuel logistics data is protected from unauthorized access and exfiltration.',
      'Operational Security': 'Runtime security controls including network protection, blocking, and threat detection.',
      'Access Management': 'Identity and access management controls governing role-based permissions and session policies.',
    };

    for (const [name, controls] of frameworkMap) {
      const passed = controls.filter(c => c.status === 'pass').length;
      const failed = controls.filter(c => c.status === 'fail').length;
      const partial = controls.filter(c => c.status === 'partial').length;
      const total = controls.length;
      const percentage = Math.round(((passed + partial * 0.5) / total) * 100);

      frameworks.push({
        name,
        description: DESCRIPTIONS[name] || '',
        percentage,
        controls,
        passed,
        failed,
        partial,
        total,
      });
    }

    // Overall compliance percentage
    const totalControls = frameworks.reduce((s, f) => s + f.total, 0);
    const totalPassed = frameworks.reduce((s, f) => s + f.passed, 0);
    const totalPartial = frameworks.reduce((s, f) => s + f.partial, 0);
    const overallPercentage = totalControls > 0
      ? Math.round(((totalPassed + totalPartial * 0.5) / totalControls) * 100)
      : 0;

    return res.json({
      success: true,
      data: {
        overallPercentage,
        frameworks,
        securityScore: scoreResult.overallScore,
        generatedAt: scoreResult.generatedAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to generate compliance status', error: error.message });
  }
}
