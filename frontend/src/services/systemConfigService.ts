import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance with auth token
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fuel_order_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * System Configuration API Service
 * Super Admin Only - System-wide settings management
 */

export interface SystemSettings {
  general: {
    systemName: string;
    timezone: string;
    dateFormat: string;
    language: string;
  };
  session: {
    sessionTimeout: number;
    jwtExpiry: number;
    refreshTokenExpiry: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    allowMultipleSessions: boolean;
  };
  data: {
    archivalEnabled: boolean;
    archivalMonths: number;
    auditLogRetention: number;
    trashRetention: number;
    autoCleanupEnabled: boolean;
    backupFrequency: 'daily' | 'weekly' | 'monthly';
    backupRetention: number;
    collectionArchivalSettings?: {
      [collectionName: string]: {
        enabled: boolean;
        retentionMonths: number;
      };
    };
  };
  notifications: {
    emailNotifications: boolean;
    criticalAlerts: boolean;
    dailySummary: boolean;
    weeklyReport: boolean;
    slowQueryThreshold: number;
    storageWarningThreshold: number;
  };
  maintenance: {
    enabled: boolean;
    message: string;
    allowedRoles: string[];
  };
}

export interface R2Configuration {
  r2Endpoint: string;
  r2BucketName: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  isConfigured: boolean;
}

export interface EmailConfiguration {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  fromName: string;
  isConfigured: boolean;
  source?: 'database' | 'environment';
}

export interface DatabaseConfiguration {
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  isConfigured: boolean;
}

export interface EnvironmentVariables {
  nodeEnv: string;
  port: string;
  timezone: string;
  mongoConfigured: boolean;
  jwtSecretConfigured: boolean;
  jwtRefreshSecretConfigured: boolean;
  emailConfigured: boolean;
  r2Configured: boolean;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface ProfilingSettings {
  enabled: boolean;
  sampleRate: number;
  slowQueryThreshold: number;
}

export const systemConfigAPI = {
  // ===== System Settings Management =====

  /**
   * Get all system settings
   * GET /api/system-admin/config/settings
   */
  getSystemSettings: async (): Promise<SystemSettings> => {
    const response = await apiClient.get('/system-admin/config/settings');
    return response.data.data;
  },

  /**
   * Update general settings
   * PUT /api/system-admin/config/settings/general
   */
  updateGeneralSettings: async (settings: SystemSettings['general']) => {
    const response = await apiClient.put('/system-admin/config/settings/general', settings);
    return response.data;
  },

  /**
   * Update security settings
   * PUT /api/system-admin/config/settings/security
   */
  updateSecuritySettings: async (settings: SystemSettings['session']) => {
    const response = await apiClient.put('/system-admin/config/settings/security', settings);
    return response.data;
  },

  /**
   * Update data retention settings
   * PUT /api/system-admin/config/settings/data-retention
   */
  updateDataRetentionSettings: async (settings: Partial<SystemSettings['data']>) => {
    const response = await apiClient.put('/system-admin/config/settings/data-retention', settings);
    return response.data;
  },

  /**
   * Update notification settings
   * PUT /api/system-admin/config/settings/notifications
   */
  updateNotificationSettings: async (settings: SystemSettings['notifications']) => {
    const response = await apiClient.put('/system-admin/config/settings/notifications', settings);
    return response.data;
  },

  /**
   * Update maintenance mode
   * PUT /api/system-admin/config/settings/maintenance
   */
  updateMaintenanceMode: async (settings: SystemSettings['maintenance']) => {
    const response = await apiClient.put('/system-admin/config/settings/maintenance', settings);
    return response.data;
  },

  // ===== External Integrations =====

  /**
   * Get Cloudflare R2 configuration (masked)
   * GET /api/system-admin/config/r2
   */
  getR2Configuration: async (): Promise<R2Configuration> => {
    const response = await apiClient.get('/system-admin/config/r2');
    return response.data.data;
  },

  /**
   * Test R2 connection
   * POST /api/system-admin/config/r2/test
   */
  testR2Connection: async () => {
    const response = await apiClient.post('/system-admin/config/r2/test');
    return response.data;
  },

  /**
   * Get email configuration (masked)
   * GET /api/system-admin/config/email
   */
  getEmailConfiguration: async (): Promise<EmailConfiguration> => {
    const response = await apiClient.get('/system-admin/config/email');
    return response.data.data;
  },

  /**
   * Update email configuration
   * PUT /api/system-admin/config/email
   */
  updateEmailConfiguration: async (config: Partial<EmailConfiguration>) => {
    const response = await apiClient.put('/system-admin/config/email', config);
    return response.data;
  },

  /**
   * Get database configuration (masked)
   * GET /api/system-admin/config/database
   */
  getDatabaseConfiguration: async (): Promise<DatabaseConfiguration> => {
    const response = await apiClient.get('/system-admin/config/database');
    return response.data.data;
  },

  // ===== Performance & Monitoring =====

  /**
   * Get profiling settings
   * GET /api/system-admin/config/profiling
   */
  getProfilingSettings: async (): Promise<ProfilingSettings> => {
    const response = await apiClient.get('/system-admin/config/profiling');
    return response.data.data;
  },

  /**
   * Update profiling settings
   * PUT /api/system-admin/config/profiling
   */
  updateProfilingSettings: async (settings: ProfilingSettings) => {
    const response = await apiClient.put('/system-admin/config/profiling', settings);
    return response.data;
  },

  // ===== Critical System Access =====

  /**
   * Get environment variables (masked)
   * GET /api/system-admin/config/environment
   */
  getEnvironmentVariables: async (): Promise<EnvironmentVariables> => {
    const response = await apiClient.get('/system-admin/config/environment');
    return response.data.data;
  },
};

export default systemConfigAPI;
