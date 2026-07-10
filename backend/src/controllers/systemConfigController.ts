import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SystemConfig } from '../models/SystemConfig';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';
import { config } from '../config';
import r2Service from '../services/r2Service';
import { emitMaintenanceEvent, emitGeneralSettingsEvent, emitSecuritySettingsEvent } from '../services/websocket';
import { invalidateMaintenanceCache } from '../middleware/maintenance';
import { isSafeUrl } from '../utils/ssrfGuard';
import { encryptData, decryptData } from '../utils/cryptoUtils';
import { isEncrypted, getFieldEncryptionKey } from '../utils/fieldEncryption';
import { sendSuccess } from '../utils/apiResponse';
import {
  SETTINGS_DOMAIN_OWNERSHIP,
  getDomainBySection,
  getUnknownSectionKeys,
} from '../config/settingsDomainOwnership';

const STRICT_SETTINGS_OWNERSHIP = process.env.SETTINGS_OWNER_GUARDRAILS_STRICT === 'true';

const enforceSettingsOwnership = (
  section: string,
  patch: Record<string, unknown>,
  req: AuthRequest
): void => {
  const domain = getDomainBySection(section);
  if (!domain) {
    throw new ApiError(400, `Unknown settings section: ${section}`);
  }

  const unknownKeys = getUnknownSectionKeys(section, patch);
  if (unknownKeys.length > 0) {
    const msg = `Unknown settings keys submitted: ${unknownKeys.join(', ')}`;
    if (STRICT_SETTINGS_OWNERSHIP) {
      throw new ApiError(400, msg);
    }
    logger.warn(msg, {
      requestId: (req as any).requestId,
      username: req.user?.username,
      section,
      domain,
    });
  }
};

const enforcePasswordPolicyOwnership = (patch: Record<string, unknown>, req: AuthRequest): void => {
  const unknownKeys = Object.keys(patch || {}).filter(
    (key) => !SETTINGS_DOMAIN_OWNERSHIP.keys[`security.password.${key}`]
  );

  if (unknownKeys.length > 0) {
    const qualified = unknownKeys.map((key) => `security.password.${key}`);
    const msg = `Unknown settings keys submitted: ${qualified.join(', ')}`;
    if (STRICT_SETTINGS_OWNERSHIP) {
      throw new ApiError(400, msg);
    }
    logger.warn(msg, {
      requestId: (req as any).requestId,
      username: req.user?.username,
      section: 'security.password',
      domain: 'security',
    });
  }
};

/**
 * Get settings ownership metadata
 * GET /api/system-admin/config/settings/domain-metadata
 * Super Admin Only
 */
export const getSettingsDomainMetadata = async (req: AuthRequest, res: Response): Promise<void> => {
  sendSuccess(
    res,
    200,
    'Settings domain metadata retrieved successfully',
    {
      strictMode: STRICT_SETTINGS_OWNERSHIP,
      ownership: SETTINGS_DOMAIN_OWNERSHIP,
    }
  );
};

/**
 * Get all system settings
 * GET /api/system-config/settings
 * Super Admin Only
 */
export const getSystemSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      // Create default system settings
      systemConfig = await SystemConfig.create({
        configType: 'system_settings',
        systemSettings: {
          general: {
            systemName: 'Fuel Order Management System',
            timezone: 'Africa/Nairobi',
            dateFormat: 'DD/MM/YYYY',
            language: 'en',
            companyName: 'TAHMEED',
            companyWebsite: 'www.tahmeedcoach.co.ke',
            companyEmail: 'info@tahmeedcoach.co.ke',
            companyPhone: '+254 700 000 000',
            logoUrl: '',
          },
          session: {
            sessionTimeout: 30,
            jwtExpiry: 24,
            refreshTokenExpiry: 7,
            maxLoginAttempts: 5,
            lockoutDuration: 15,
            allowMultipleSessions: true,
          },
          data: {
            archivalEnabled: true,
            archivalMonths: 6,
            auditLogRetention: 12,
            trashRetention: 90,
            autoCleanupEnabled: false,
            backupFrequency: 'daily',
            backupRetention: 30,
          },
          notifications: {
            emailNotifications: true,
            criticalAlerts: true,
            dailySummary: false,
            weeklyReport: true,
            slowQueryThreshold: 500,
            storageWarningThreshold: 80,
            sendCredentialsEmail: true,
            bypassEmailVerification: false,
          },
          maintenance: {
            enabled: false,
            message: 'System is under maintenance. Please check back later.',
            allowedRoles: ['super_admin'],
          },
        },
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    sendSuccess(res, 200, 'System settings retrieved successfully', systemConfig.systemSettings);
  } catch (error: any) {
    logger.error('Error getting system settings:', error);
    throw error;
  }
};

/**
 * Update general system settings
 * PUT /api/system-config/settings/general
 * Super Admin Only
 */
export const updateGeneralSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { systemName, timezone, dateFormat, language, companyName, companyWebsite, companyEmail, companyPhone, logoUrl } = req.body;

    enforceSettingsOwnership('general', req.body || {}, req);

    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    const oldSettings = systemConfig.systemSettings?.general;

    // Update general settings
    if (systemConfig.systemSettings?.general) {
      if (systemName !== undefined) systemConfig.systemSettings.general.systemName = systemName;
      if (timezone !== undefined) systemConfig.systemSettings.general.timezone = timezone;
      if (dateFormat !== undefined) systemConfig.systemSettings.general.dateFormat = dateFormat;
      if (language !== undefined) systemConfig.systemSettings.general.language = language;
      if (companyName !== undefined) systemConfig.systemSettings.general.companyName = companyName;
      if (companyWebsite !== undefined) systemConfig.systemSettings.general.companyWebsite = companyWebsite;
      if (companyEmail !== undefined) systemConfig.systemSettings.general.companyEmail = companyEmail;
      if (companyPhone !== undefined) systemConfig.systemSettings.general.companyPhone = companyPhone;
      if (logoUrl !== undefined) systemConfig.systemSettings.general.logoUrl = logoUrl;
    }

    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Broadcast the new settings to every connected client so all open tabs
    // update their system name, timezone, and date format immediately.
    const savedGeneral = systemConfig.systemSettings?.general;
    if (savedGeneral) {
      emitGeneralSettingsEvent({
        systemName: savedGeneral.systemName || 'Fuel Order Management System',
        timezone: savedGeneral.timezone || 'Africa/Nairobi',
        dateFormat: savedGeneral.dateFormat || 'DD/MM/YYYY',
        language: savedGeneral.language || 'en',
      });
    }

    // Audit log
    await AuditService.logConfigChange(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'general_settings',
      oldSettings,
      systemConfig.systemSettings?.general,
      req.ip
    );

    logger.info(`General settings updated by ${req.user?.username}`);

    sendSuccess(res, 200, 'General settings updated successfully', systemConfig.systemSettings?.general);
  } catch (error: any) {
    logger.error('Error updating general settings:', error);
    throw error;
  }
};

/**
 * Update session and security settings
 * PUT /api/system-config/settings/security
 * Super Admin Only
 */
export const updateSecuritySettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      sessionTimeout,
      jwtExpiry,
      refreshTokenExpiry,
      maxLoginAttempts,
      lockoutDuration,
      allowMultipleSessions,
    } = req.body;

    enforceSettingsOwnership('session', req.body || {}, req);

    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    const oldSettings = systemConfig.systemSettings?.session;

    // Update session settings
    if (systemConfig.systemSettings?.session) {
      if (sessionTimeout !== undefined) systemConfig.systemSettings.session.sessionTimeout = sessionTimeout;
      if (jwtExpiry !== undefined) systemConfig.systemSettings.session.jwtExpiry = jwtExpiry;
      if (refreshTokenExpiry !== undefined) systemConfig.systemSettings.session.refreshTokenExpiry = refreshTokenExpiry;
      if (maxLoginAttempts !== undefined) systemConfig.systemSettings.session.maxLoginAttempts = maxLoginAttempts;
      if (lockoutDuration !== undefined) systemConfig.systemSettings.session.lockoutDuration = lockoutDuration;
      if (allowMultipleSessions !== undefined) systemConfig.systemSettings.session.allowMultipleSessions = allowMultipleSessions;
    }

    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Broadcast to all open super_admin tabs so SecurityTab and SystemConfigDashboard
    // both reflect the new session settings immediately without a page refresh.
    const savedSession = systemConfig.systemSettings?.session;
    if (savedSession) {
      emitSecuritySettingsEvent({ session: savedSession as any });
    }

    // Audit log with HIGH severity
    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'config',
      resourceId: 'security_settings',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: JSON.stringify({
        message: 'Security settings updated',
        oldSettings,
        newSettings: systemConfig.systemSettings?.session,
      }),
      severity: 'high',
      ipAddress: req.ip,
    });

    logger.warn(`Security settings updated by ${req.user?.username} - requires attention`);

    sendSuccess(
      res,
      200,
      'Security settings updated successfully. Changes will take effect for new sessions.',
      systemConfig.systemSettings?.session
    );
  } catch (error: any) {
    logger.error('Error updating security settings:', error);
    throw error;
  }
};

/**
 * Get password policy
 * GET /api/system-admin/config/settings/security/password-policy
 * Super Admin Only
 */
export const getPasswordPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    const defaults = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      historyCount: 5,
      expirationDays: 0,
    };

    const p = systemConfig?.securitySettings?.password;
    sendSuccess(res, 200, 'Password policy retrieved successfully', {
      minLength: p?.minLength ?? defaults.minLength,
      requireUppercase: p?.requireUppercase ?? defaults.requireUppercase,
      requireLowercase: p?.requireLowercase ?? defaults.requireLowercase,
      requireNumbers: p?.requireNumbers ?? defaults.requireNumbers,
      requireSpecialChars: p?.requireSpecialChars ?? defaults.requireSpecialChars,
      historyCount: p?.historyCount ?? defaults.historyCount,
      expirationDays: p?.expirationDays ?? defaults.expirationDays,
    });
  } catch (error: any) {
    logger.error('Error getting password policy:', error);
    throw error;
  }
};

/**
 * Update password policy
 * PUT /api/system-admin/config/settings/security/password-policy
 * Super Admin Only
 */
export const updatePasswordPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      minLength,
      requireUppercase,
      requireLowercase,
      requireNumbers,
      requireSpecialChars,
      historyCount,
      expirationDays,
    } = req.body;

    enforcePasswordPolicyOwnership(req.body || {}, req);

    const systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    if (!systemConfig.securitySettings) {
      (systemConfig as any).securitySettings = {};
    }
    const secSettings = systemConfig.securitySettings as NonNullable<typeof systemConfig.securitySettings>;
    if (!secSettings.password) {
      (secSettings as any).password = {};
    }

    const pw = secSettings.password!;
    if (minLength          !== undefined) pw.minLength          = minLength;
    if (requireUppercase   !== undefined) pw.requireUppercase   = requireUppercase;
    if (requireLowercase   !== undefined) pw.requireLowercase   = requireLowercase;
    if (requireNumbers     !== undefined) pw.requireNumbers     = requireNumbers;
    if (requireSpecialChars !== undefined) pw.requireSpecialChars = requireSpecialChars;
    if (historyCount       !== undefined) pw.historyCount       = historyCount;
    if (expirationDays     !== undefined) pw.expirationDays     = expirationDays;

    systemConfig.markModified('securitySettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'config',
      resourceId: 'password_policy',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: JSON.stringify({
        message: 'Password policy updated',
        newSettings: systemConfig.securitySettings?.password,
      }),
      severity: 'high',
      ipAddress: req.ip,
    });

    logger.warn(`Password policy updated by ${req.user?.username}`);

    sendSuccess(res, 200, 'Password policy updated successfully', systemConfig.securitySettings?.password);
  } catch (error: any) {
    logger.error('Error updating password policy:', error);
    throw error;
  }
};

/**
 * Update data management and retention settings
 * PUT /api/system-config/settings/data-retention
 * Super Admin Only
 */
export const updateDataRetentionSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      archivalEnabled,
      archivalMonths,
      auditLogRetention,
      trashRetention,
      autoCleanupEnabled,
      backupFrequency,
      backupRetention,
      collectionArchivalSettings,
    } = req.body;

    enforceSettingsOwnership('data', req.body || {}, req);

    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    const oldSettings = systemConfig.systemSettings?.data;

    // Update data retention settings
    if (systemConfig.systemSettings?.data) {
      if (archivalEnabled !== undefined) systemConfig.systemSettings.data.archivalEnabled = archivalEnabled;
      if (archivalMonths !== undefined) systemConfig.systemSettings.data.archivalMonths = archivalMonths;
      if (auditLogRetention !== undefined) systemConfig.systemSettings.data.auditLogRetention = auditLogRetention;
      if (trashRetention !== undefined) systemConfig.systemSettings.data.trashRetention = trashRetention;
      if (autoCleanupEnabled !== undefined) systemConfig.systemSettings.data.autoCleanupEnabled = autoCleanupEnabled;
      if (backupFrequency !== undefined) systemConfig.systemSettings.data.backupFrequency = backupFrequency;
      if (backupRetention !== undefined) systemConfig.systemSettings.data.backupRetention = backupRetention;
      if (collectionArchivalSettings !== undefined) {
        systemConfig.systemSettings.data.collectionArchivalSettings = collectionArchivalSettings;
      }
    }

    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Prune in the background — awaiting hundreds of R2/B2 deletes times out the HTTP request
    // (settings still save; UI was showing "Failed to save" while prune continued on the server).
    let pruneStarted = false;
    if (backupRetention !== undefined) {
      try {
        const backupService = (await import('../services/backupService')).default;
        backupService.scheduleConfiguredRetention();
        pruneStarted = true;
      } catch (err: any) {
        logger.warn(`Backup retention prune schedule after settings save failed: ${String(err?.message ?? err)}`);
      }
    }

    // Audit log
    await AuditService.logConfigChange(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'data_retention',
      oldSettings,
      systemConfig.systemSettings?.data,
      req.ip
    );

    logger.info(`Data retention settings updated by ${req.user?.username}${pruneStarted ? ' (retention prune started in background)' : ''}`);

    sendSuccess(res, 200, 'Data retention settings updated successfully', {
      ...systemConfig.systemSettings?.data,
      pruneStarted,
    });
  } catch (error: any) {
    logger.error('Error updating data retention settings:', error);
    throw error;
  }
};

/**
 * Update notification settings
 * PUT /api/system-config/settings/notifications
 * Super Admin Only
 */
export const updateNotificationSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      emailNotifications,
      criticalAlerts,
      dailySummary,
      weeklyReport,
      slowQueryThreshold,
      storageWarningThreshold,
      sendCredentialsEmail,
      bypassEmailVerification,
    } = req.body;

    enforceSettingsOwnership('notifications', req.body || {}, req);

    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    const oldSettings = systemConfig.systemSettings?.notifications;

    // Update notification settings
    if (systemConfig.systemSettings?.notifications) {
      if (emailNotifications !== undefined) systemConfig.systemSettings.notifications.emailNotifications = emailNotifications;
      if (criticalAlerts !== undefined) systemConfig.systemSettings.notifications.criticalAlerts = criticalAlerts;
      if (dailySummary !== undefined) systemConfig.systemSettings.notifications.dailySummary = dailySummary;
      if (weeklyReport !== undefined) systemConfig.systemSettings.notifications.weeklyReport = weeklyReport;
      if (slowQueryThreshold !== undefined) systemConfig.systemSettings.notifications.slowQueryThreshold = slowQueryThreshold;
      if (storageWarningThreshold !== undefined) systemConfig.systemSettings.notifications.storageWarningThreshold = storageWarningThreshold;
      if (sendCredentialsEmail !== undefined) (systemConfig.systemSettings.notifications as any).sendCredentialsEmail = sendCredentialsEmail;
      if (bypassEmailVerification !== undefined) (systemConfig.systemSettings.notifications as any).bypassEmailVerification = bypassEmailVerification;
    }

    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Audit log
    await AuditService.logConfigChange(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'notification_settings',
      oldSettings,
      systemConfig.systemSettings?.notifications,
      req.ip
    );

    logger.info(`Notification settings updated by ${req.user?.username}`);

    sendSuccess(res, 200, 'Notification settings updated successfully', systemConfig.systemSettings?.notifications);
  } catch (error: any) {
    logger.error('Error updating notification settings:', error);
    throw error;
  }
};

/**
 * Enable/Disable Maintenance Mode
 * PUT /api/system-config/settings/maintenance
 * Super Admin Only
 */
export const updateMaintenanceMode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled, message, allowedRoles } = req.body;

    enforceSettingsOwnership('maintenance', req.body || {}, req);

    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    const oldSettings = systemConfig.systemSettings?.maintenance;

    // Update maintenance settings
    if (systemConfig.systemSettings?.maintenance) {
      if (enabled !== undefined) systemConfig.systemSettings.maintenance.enabled = enabled;
      if (message !== undefined) systemConfig.systemSettings.maintenance.message = message;
      if (allowedRoles !== undefined) systemConfig.systemSettings.maintenance.allowedRoles = allowedRoles;
    }

    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Invalidate cache so the next API request re-reads the new state from DB
    invalidateMaintenanceCache();

    // Broadcast the change to all connected clients in real time
    const currentMaintenance = systemConfig.systemSettings?.maintenance;
    emitMaintenanceEvent(
      currentMaintenance?.enabled ?? false,
      currentMaintenance?.message ?? 'System is under maintenance.',
      currentMaintenance?.allowedRoles ?? ['super_admin']
    );

    // Audit log with CRITICAL severity
    await AuditService.log({
      action: enabled ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
      resourceType: 'config',
      resourceId: 'maintenance_mode',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: JSON.stringify({
        message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
        oldSettings,
        newSettings: systemConfig.systemSettings?.maintenance,
      }),
      severity: 'critical',
      ipAddress: req.ip,
    });

    logger.warn(`Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'} by ${req.user?.username}`);

    sendSuccess(
      res,
      200,
      `Maintenance mode ${enabled ? 'enabled' : 'disabled'} successfully`,
      systemConfig.systemSettings?.maintenance
    );
  } catch (error: any) {
    logger.error('Error updating maintenance mode:', error);
    throw error;
  }
};

/**
 * Get Cloudflare R2 configuration (sensitive)
 * GET /api/system-config/r2
 * Super Admin Only
 */
export const getR2Configuration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Return masked configuration for display
    const r2Config = {
      r2Endpoint: config.r2Endpoint,
      r2BucketName: config.r2BucketName,
      r2AccessKeyId: config.r2AccessKeyId ? '***' + config.r2AccessKeyId.slice(-4) : 'Not configured',
      r2SecretAccessKey: config.r2SecretAccessKey ? '***************' : 'Not configured',
      isConfigured: !!(config.r2Endpoint && config.r2AccessKeyId && config.r2SecretAccessKey),
    };

    // Audit log
    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: 'r2_configuration',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: 'R2 configuration viewed (masked)',
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'R2 configuration retrieved successfully',
      data: r2Config,
    });
  } catch (error: any) {
    logger.error('Error getting R2 configuration:', error);
    throw error;
  }
};

/**
 * Test R2 connection
 * POST /api/system-config/r2/test
 * Super Admin Only
 */
export const testR2Connection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Implement actual R2 connection test when R2 service is available
    const isConfigured = !!(config.r2Endpoint && config.r2AccessKeyId && config.r2SecretAccessKey);

    if (!isConfigured) {
      throw new ApiError(400, 'R2 is not configured. Please set R2 environment variables.');
    }

    // Audit log
    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: 'r2_connection',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: 'R2 connection test performed',
      severity: 'low',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'R2 connection test successful (configuration verified)',
      data: {
        configured: true,
        endpoint: config.r2Endpoint,
        bucket: config.r2BucketName,
      },
    });
  } catch (error: any) {
    logger.error('Error testing R2 connection:', error);
    throw error;
  }
};

/**
 * Get email configuration (masked)
 * GET /api/system-config/email
 * Super Admin Only
 */
export const getEmailConfiguration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get from SystemConfig first, fallback to env vars
    const systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    const emailConfig = {
      host: systemConfig?.systemSettings?.email?.host || process.env.EMAIL_HOST || '',
      port: systemConfig?.systemSettings?.email?.port || parseInt(process.env.EMAIL_PORT || '587'),
      secure: systemConfig?.systemSettings?.email?.secure ?? (process.env.EMAIL_SECURE === 'true'),
      user: systemConfig?.systemSettings?.email?.user || process.env.EMAIL_USER || '',
      password: (systemConfig?.systemSettings?.email?.password || process.env.EMAIL_PASSWORD) ? '***************' : '',
      from: systemConfig?.systemSettings?.email?.from || process.env.EMAIL_FROM || '',
      fromName: systemConfig?.systemSettings?.email?.fromName || process.env.EMAIL_FROM_NAME || 'Fuel Order System',
      isConfigured: !!(
        (systemConfig?.systemSettings?.email?.host || process.env.EMAIL_HOST) && 
        (systemConfig?.systemSettings?.email?.user || process.env.EMAIL_USER) && 
        (systemConfig?.systemSettings?.email?.password || process.env.EMAIL_PASSWORD)
      ),
      source: systemConfig?.systemSettings?.email?.host ? 'database' : 'environment',
    };

    // Audit log
    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: 'email_configuration',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: 'Email configuration viewed (masked)',
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Email configuration retrieved successfully',
      data: emailConfig,
    });
  } catch (error: any) {
    logger.error('Error getting email configuration:', error);
    throw error;
  }
};

/**
 * Update email configuration
 * PUT /api/system-config/email
 * Super Admin Only
 */
export const updateEmailConfiguration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { host, port, secure, user, password, from, fromName } = req.body;

    if (!host || !user || !from) {
      throw new ApiError(400, 'Host, user, and from address are required');
    }

    // ✅ SSRF PROTECTION: Validate SMTP host against SSRF vulnerabilities
    // Prevent configuration of private IPs or AWS metadata endpoints
    const smtpUrl = `https://${host}:${port || 587}`;
    const isSafeHost = await isSafeUrl(smtpUrl);
    
    if (!isSafeHost) {
      logger.warn(`[SSRF] Blocked attempt to configure unsafe SMTP host: ${host} by user ${req.user?.username}`);
      throw new ApiError(
        400,
        'SMTP host must be a public domain. Private IPs, localhost, and AWS metadata endpoints are not allowed.'
      );
    }

    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      // Create default config if it doesn't exist
      systemConfig = new SystemConfig({
        configType: 'system_settings',
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    // Initialize systemSettings if not exists
    if (!systemConfig.systemSettings) {
      systemConfig.systemSettings = {};
    }

    // Encrypt password before storing — never store credentials in plaintext
    const encKey = getFieldEncryptionKey();
    const existingPassword = systemConfig.systemSettings.email?.password || '';
    const incomingPassword = password || '';
    let storedPassword = existingPassword; // keep existing encrypted value if no new password sent
    if (incomingPassword) {
      // Encrypt the new plaintext password using FIELD_ENCRYPTION_KEY (AES-256-GCM)
      storedPassword = encKey
        ? `encrypted:${encryptData(incomingPassword, encKey)}`
        : incomingPassword;
    }

    // Update email configuration
    systemConfig.systemSettings.email = {
      host,
      port: port || 587,
      secure: secure || false,
      user,
      password: storedPassword,
      from,
      fromName: fromName || 'Fuel Order System',
    };

    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Reinitialize email service with new config
    const emailService = require('../services/emailService').default;
    await emailService.reinitialize();

    // Audit log
    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: 'email_configuration',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: `Email configuration updated: Host=${host}, User=${user}, From=${from}`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Email configuration updated successfully',
      data: {
        host,
        port,
        secure,
        user,
        password: '***************',
        from,
        fromName,
      },
    });
  } catch (error: any) {
    // ✅ SECURITY: Log error without sensitive config details
    logger.error('Error updating email configuration:', { 
      code: error.code, 
      message: 'Internal server error',
      username: req.user?.username 
    });
    throw error;
  }
};

/**
 * Get database configuration (masked)
 * GET /api/system-config/database
 * Super Admin Only
 */
export const getDatabaseConfiguration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const mongoUri = config.mongodbUri;
    let dbConfig: any = {
      isConfigured: !!mongoUri,
    };

    if (mongoUri) {
      // Parse MongoDB URI to extract safe information
      try {
        const url = new URL(mongoUri);
        dbConfig = {
          host: url.hostname,
          port: url.port || '27017',
          database: url.pathname.replace('/', ''),
          username: url.username ? '***' + url.username.slice(-2) : 'Not set',
          password: url.password ? '***************' : 'Not set',
          isConfigured: true,
        };
      } catch (e) {
        dbConfig = {
          connectionString: 'Configured (unable to parse)',
          isConfigured: true,
        };
      }
    }

    // Audit log
    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: 'database_configuration',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: 'Database configuration viewed (masked)',
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Database configuration retrieved successfully',
      data: dbConfig,
    });
  } catch (error: any) {
    logger.error('Error getting database configuration:', error);
    throw error;
  }
};

/**
 * Get environment variables (masked, super admin only)
 * GET /api/system-config/environment
 * Super Admin Only - Critical
 */
export const getEnvironmentVariables = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Only show non-sensitive environment information
    const safeEnvVars = {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || '5000',
      timezone: process.env.TZ || 'Africa/Nairobi',
      
      // Masked sensitive variables (show only if configured)
      mongoConfigured: !!process.env.MONGODB_URI,
      jwtSecretConfigured: !!process.env.JWT_SECRET,
      jwtRefreshSecretConfigured: !!process.env.JWT_REFRESH_SECRET,
      emailConfigured: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
      r2Configured: !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
      
      // System info
      // nodeVersion, platform, arch intentionally omitted (fingerprint defense)
    };

    // Audit log with CRITICAL severity
    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: 'environment_variables',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: 'Environment variables viewed',
      severity: 'critical',
      ipAddress: req.ip,
    });

    logger.warn(`Environment variables accessed by ${req.user?.username} from ${req.ip}`);

    res.status(200).json({
      success: true,
      message: 'Environment variables retrieved successfully (masked)',
      data: safeEnvVars,
    });
  } catch (error: any) {
    logger.error('Error getting environment variables:', error);
    throw error;
  }
};

/**
 * Enable/Disable Performance Profiling
 * PUT /api/system-config/profiling
 * Super Admin Only
 */
export const updateProfilingSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled, sampleRate, slowQueryThreshold } = req.body;

    // In a production system, this would enable/disable MongoDB profiling
    // For now, we'll store it in system settings
    let systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!systemConfig) {
      throw new ApiError(404, 'System configuration not found');
    }

    // Store profiling settings in notifications section for now
    const oldSettings = {
      enabled: systemConfig.systemSettings?.notifications?.slowQueryThreshold !== undefined,
      slowQueryThreshold: systemConfig.systemSettings?.notifications?.slowQueryThreshold,
    };

    if (systemConfig.systemSettings?.notifications) {
      if (slowQueryThreshold !== undefined) {
        systemConfig.systemSettings.notifications.slowQueryThreshold = slowQueryThreshold;
      }
    }

    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    // Audit log
    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'config',
      resourceId: 'profiling_settings',
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: JSON.stringify({
        message: `Profiling ${enabled ? 'enabled' : 'disabled'}`,
        oldSettings,
        newSettings: { enabled, sampleRate, slowQueryThreshold },
      }),
      severity: 'medium',
      ipAddress: req.ip,
    });

    logger.info(`Performance profiling ${enabled ? 'enabled' : 'disabled'} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: `Performance profiling ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        enabled,
        sampleRate: sampleRate || 0.1,
        slowQueryThreshold: slowQueryThreshold || 500,
      },
    });
  } catch (error: any) {
    logger.error('Error updating profiling settings:', error);
    throw error;
  }
};

/**
 * Get current profiling status
 * GET /api/system-config/profiling
 * Super Admin Only
 */
export const getProfilingSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const systemConfig = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    const profilingSettings = {
      enabled: false,
      sampleRate: 0.1,
      slowQueryThreshold: systemConfig?.systemSettings?.notifications?.slowQueryThreshold || 500,
    };

    res.status(200).json({
      success: true,
      message: 'Profiling settings retrieved successfully',
      data: profilingSettings,
    });
  } catch (error: any) {
    logger.error('Error getting profiling settings:', error);
    throw error;
  }
};

/**
 * GET /api/system-config/settings/rate-limits
 * Return current rate limit settings (stored in system config or env defaults)
 */
export const getRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const systemConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    const rateLimits = systemConfig?.systemSettings?.rateLimits || {
      apiRateLimitMax: parseInt(process.env.API_RATE_LIMIT_MAX || '500', 10),
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    };
    res.json({ success: true, data: rateLimits });
  } catch (error: any) {
    logger.error('Error getting rate limit settings:', error);
    throw error;
  }
};

/**
 * PUT /api/system-config/settings/rate-limits
 * Persist rate limit settings to system config (effective after server restart)
 */
export const updateRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { apiRateLimitMax, rateLimitWindowMs } = req.body;

    if (typeof apiRateLimitMax !== 'number' || apiRateLimitMax < 10 || apiRateLimitMax > 10_000) {
      res.status(400).json({ success: false, message: 'apiRateLimitMax must be between 10 and 10,000' });
      return;
    }

    let systemConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    if (!systemConfig || !systemConfig.systemSettings) {
      res.status(404).json({ success: false, message: 'System settings not found' });
      return;
    }

    systemConfig.systemSettings.rateLimits = { apiRateLimitMax, rateLimitWindowMs };
    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CONFIG_CHANGE',
      resourceType: 'rate_limits',
      details: `Rate limits updated: max=${apiRateLimitMax}, window=${rateLimitWindowMs}ms`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.json({ success: true, data: { apiRateLimitMax, rateLimitWindowMs }, message: 'Rate limit settings saved. Restart server to apply.' });
  } catch (error: any) {
    logger.error('Error updating rate limit settings:', error);
    throw error;
  }
};

// ─── Alert Thresholds ────────────────────────────────────────────────────────

const DEFAULT_ALERT_THRESHOLDS = {
  memoryUsagePct: 70,       // % heap used above which alert fires
  dbConnectionsMax: 90,     // number of connections that triggers alert
  errorRatePer5min: 20,     // error log entries per 5 minutes
  diskUsagePct: 90,         // not auto-collected, just for reference
  cpuUsagePct: 90,
};

export const getAlertThresholds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const systemConfig = await SystemConfig.findOne().lean();
    const thresholds = (systemConfig as any)?.systemSettings?.alertThresholds || DEFAULT_ALERT_THRESHOLDS;
    res.json({ success: true, data: thresholds });
  } catch (error: any) {
    logger.error('Error getting alert thresholds:', error);
    throw error;
  }
};

export const updateAlertThresholds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { memoryUsagePct, dbConnectionsMax, errorRatePer5min, diskUsagePct, cpuUsagePct } = req.body;

    const clamp = (v: unknown, min: number, max: number, def: number): number => {
      const n = Number(v);
      if (isNaN(n)) return def;
      return Math.min(max, Math.max(min, Math.round(n)));
    };

    const thresholds = {
      memoryUsagePct: clamp(memoryUsagePct, 10, 100, DEFAULT_ALERT_THRESHOLDS.memoryUsagePct),
      dbConnectionsMax: clamp(dbConnectionsMax, 1, 10000, DEFAULT_ALERT_THRESHOLDS.dbConnectionsMax),
      errorRatePer5min: clamp(errorRatePer5min, 1, 10000, DEFAULT_ALERT_THRESHOLDS.errorRatePer5min),
      diskUsagePct: clamp(diskUsagePct, 10, 100, DEFAULT_ALERT_THRESHOLDS.diskUsagePct),
      cpuUsagePct: clamp(cpuUsagePct, 10, 100, DEFAULT_ALERT_THRESHOLDS.cpuUsagePct),
    };

    let systemConfig = await SystemConfig.findOne();
    if (!systemConfig) systemConfig = new SystemConfig({});
    if (!systemConfig.systemSettings) (systemConfig as any).systemSettings = {};
    (systemConfig as any).systemSettings.alertThresholds = thresholds;
    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CONFIG_CHANGE',
      resourceType: 'alert_thresholds',
      details: `Alert thresholds updated: ${JSON.stringify(thresholds)}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.json({ success: true, data: thresholds, message: 'Alert thresholds saved' });
  } catch (error: any) {
    logger.error('Error updating alert thresholds:', error);
    throw error;
  }
};

/**
 * Upload company logo — converts uploaded image to base64 data URL and persists in SystemConfig.
 * POST /api/system-admin/config/logo
 * Super Admin Only
 * Accepts: multipart/form-data with field name "logo"
 * Allowed types: image/png, image/jpeg, image/webp, image/svg+xml  (max 2 MB)
 */
export const uploadLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'No logo file provided. Send a PNG, JPG, WEBP, or SVG file in the "logo" field.');
    }

    const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      throw new ApiError(400, `Invalid file type "${req.file.mimetype}". Allowed: PNG, JPG, WEBP, SVG.`);
    }

    if (req.file.size > 2 * 1024 * 1024) {
      throw new ApiError(400, 'Logo file exceeds the 2 MB size limit.');
    }

    // Store logo: prefer R2 (returns a public HTTPS URL), fall back to base64 data URL
    let logoUrl: string;
    if (r2Service.isEnabled() && config.r2PublicUrl) {
      const ext = req.file.mimetype.split('/')[1].replace('svg+xml', 'svg');
      const key = `logos/company-logo-${Date.now()}.${ext}`;
      logoUrl = await r2Service.uploadLogoToR2(req.file.buffer, key, req.file.mimetype);
    } else {
      // R2 not configured — store as base64 data URL in MongoDB
      logoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    let systemConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    if (!systemConfig) {
      // Auto-create a minimal config document so logo can be saved without
      // requiring the user to save General Settings first.
      systemConfig = new SystemConfig({
        configType: 'system_settings',
        systemSettings: {
          general: {
            systemName: 'FuelOrder',
            timezone: 'UTC',
            dateFormat: 'DD/MM/YYYY',
            language: 'en',
            companyName: '',
            companyWebsite: '',
            companyEmail: '',
            companyPhone: '',
            logoUrl: '',
          },
        },
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    if (systemConfig.systemSettings?.general) {
      systemConfig.systemSettings.general.logoUrl = logoUrl;
    }
    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CONFIG_CHANGE',
      resourceType: 'company_logo',
      details: `Company logo updated (${req.file.size} bytes, ${req.file.mimetype})`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    logger.info(`Company logo updated by ${req.user?.username} (${req.file.mimetype}, ${req.file.size} bytes)`);

    sendSuccess(res, 200, 'Logo uploaded successfully', { logoUrl });
  } catch (error: any) {
    logger.error('Error uploading company logo:', error);
    throw error;
  }
};
