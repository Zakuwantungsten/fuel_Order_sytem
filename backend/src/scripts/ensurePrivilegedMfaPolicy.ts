/**
 * Ensures MFA is required for privileged roles (admin, super_admin).
 * Idempotent — only updates when policy is not yet enabled for those roles.
 */

import { SystemConfig } from '../models/SystemConfig';
import logger from '../utils/logger';

const PRIVILEGED_ROLES = ['admin', 'super_admin'];

export async function ensurePrivilegedMfaPolicy(): Promise<void> {
  try {
    const doc = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!doc) {
      logger.info('ensurePrivilegedMfaPolicy: no system_settings doc — skipping');
      return;
    }

    const mfa = (doc as any).securitySettings?.mfa ?? {};
    const requiredRoles: string[] = mfa.requiredRoles ?? [];
    const missing = PRIVILEGED_ROLES.filter((r) => !requiredRoles.includes(r));

    if (mfa.globalEnabled && missing.length === 0) {
      return; // already configured
    }

    if (!(doc as any).securitySettings) (doc as any).securitySettings = {};
    if (!(doc as any).securitySettings.mfa) (doc as any).securitySettings.mfa = {};

    (doc as any).securitySettings.mfa.globalEnabled = true;
    const merged = [...new Set([...requiredRoles, ...PRIVILEGED_ROLES])];
    (doc as any).securitySettings.mfa.requiredRoles = merged;

    await doc.save();

    logger.info('ensurePrivilegedMfaPolicy: MFA now required for admin + super_admin', {
      requiredRoles: merged,
    });
  } catch (err) {
    logger.warn('ensurePrivilegedMfaPolicy failed (non-fatal):', err);
  }
}
