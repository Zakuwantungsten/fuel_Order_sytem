export type SettingsDomain =
  | 'platform'
  | 'security'
  | 'data_lifecycle'
  | 'monitoring_alerts'
  | 'operations'
  | 'integrations';

export interface SettingsDomainOwnership {
  sections: Record<string, SettingsDomain>;
  keys: Record<string, SettingsDomain>;
}

const SECTION_OWNERSHIP: Record<string, SettingsDomain> = {
  general: 'platform',
  session: 'security',
  data: 'data_lifecycle',
  notifications: 'monitoring_alerts',
  maintenance: 'operations',
};

const KEY_OWNERSHIP: Record<string, SettingsDomain> = {
  'general.systemName': 'platform',
  'general.timezone': 'platform',
  'general.dateFormat': 'platform',
  'general.language': 'platform',
  'general.companyName': 'platform',
  'general.companyWebsite': 'platform',
  'general.companyEmail': 'platform',
  'general.companyPhone': 'platform',
  'general.logoUrl': 'platform',

  'session.sessionTimeout': 'security',
  'session.jwtExpiry': 'security',
  'session.refreshTokenExpiry': 'security',
  'session.maxLoginAttempts': 'security',
  'session.lockoutDuration': 'security',
  'session.allowMultipleSessions': 'security',

  'data.archivalEnabled': 'data_lifecycle',
  'data.archivalMonths': 'data_lifecycle',
  'data.auditLogRetention': 'data_lifecycle',
  'data.trashRetention': 'data_lifecycle',
  'data.autoCleanupEnabled': 'data_lifecycle',
  'data.backupFrequency': 'data_lifecycle',
  'data.backupRetention': 'data_lifecycle',
  'data.collectionArchivalSettings': 'data_lifecycle',

  'notifications.emailNotifications': 'monitoring_alerts',
  'notifications.criticalAlerts': 'monitoring_alerts',
  'notifications.dailySummary': 'monitoring_alerts',
  'notifications.weeklyReport': 'monitoring_alerts',
  'notifications.slowQueryThreshold': 'monitoring_alerts',
  'notifications.storageWarningThreshold': 'monitoring_alerts',
  'notifications.sendCredentialsEmail': 'monitoring_alerts',
  'notifications.bypassEmailVerification': 'monitoring_alerts',

  'maintenance.enabled': 'operations',
  'maintenance.message': 'operations',
  'maintenance.allowedRoles': 'operations',

  'security.password.minLength': 'security',
  'security.password.requireUppercase': 'security',
  'security.password.requireLowercase': 'security',
  'security.password.requireNumbers': 'security',
  'security.password.requireSpecialChars': 'security',
  'security.password.historyCount': 'security',
  'security.password.expirationDays': 'security',
};

export const SETTINGS_DOMAIN_OWNERSHIP: SettingsDomainOwnership = {
  sections: SECTION_OWNERSHIP,
  keys: KEY_OWNERSHIP,
};

export const getDomainBySection = (section: string): SettingsDomain | undefined => {
  return SETTINGS_DOMAIN_OWNERSHIP.sections[section];
};

export const getUnknownSectionKeys = (section: string, patch: Record<string, unknown>): string[] => {
  const unknown: string[] = [];
  Object.keys(patch || {}).forEach((key) => {
    const fullyQualified = `${section}.${key}`;
    if (!SETTINGS_DOMAIN_OWNERSHIP.keys[fullyQualified]) {
      unknown.push(fullyQualified);
    }
  });
  return unknown;
};
