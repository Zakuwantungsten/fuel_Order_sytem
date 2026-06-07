import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  // MongoDB
  mongodbUri: process.env.MONGODB_URI || '',

  // JWT – secrets have no fallback; validateEnv() ensures they are set at startup
  jwtSecret: process.env.JWT_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  jwtExpire: process.env.JWT_EXPIRE || '15m',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'],

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || 'logs/app.log',

  // Cloudflare R2 (S3-compatible storage)
  r2Endpoint: process.env.R2_ENDPOINT || '',
  // Region for the primary destination. Cloudflare R2 uses 'auto'. Make it
  // configurable so the primary client can be repointed at another S3 provider
  // (e.g. Backblaze B2 'us-west-004') as a last-resort manual failover.
  r2Region: process.env.R2_REGION || 'auto',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  // Assets bucket — stores public files such as company logos
  r2BucketName: process.env.R2_BUCKET_NAME || 'fuel-order-assets',
  // Public base URL for R2 assets (e.g. https://pub-xxx.r2.dev or https://assets.yourdomain.com)
  r2PublicUrl: process.env.R2_PUBLIC_URL || '',
  // Backups bucket — private, encrypted database backups (separate from assets)
  // Falls back to r2BucketName only as a last resort so existing single-bucket setups still work.
  r2BackupBucketName: process.env.R2_BACKUP_BUCKET_NAME || process.env.R2_BUCKET_NAME || 'fuel-order-backups',

  // Secondary backup destination (geo/provider redundancy). Optional — leave the
  // bucket name blank to disable. If the secondary endpoint/creds are blank, the
  // primary R2 endpoint+creds are reused (same account, different bucket). Set
  // them to mirror to a different account/region/provider for stronger isolation.
  r2BackupBucketNameSecondary: process.env.R2_BACKUP_BUCKET_NAME_SECONDARY || '',
  r2SecondaryEndpoint: process.env.R2_SECONDARY_ENDPOINT || '',
  r2SecondaryAccessKeyId: process.env.R2_SECONDARY_ACCESS_KEY_ID || '',
  r2SecondarySecretAccessKey: process.env.R2_SECONDARY_SECRET_ACCESS_KEY || '',
  // Region for the secondary destination. Cloudflare R2 uses 'auto', but
  // Backblaze B2 (and most S3 providers) require the real region baked into the
  // endpoint — e.g. 'us-west-004' for s3.us-west-004.backblazeb2.com — or SigV4
  // signature validation fails.
  r2SecondaryRegion: process.env.R2_SECONDARY_REGION || 'auto',

  // Email Configuration
  emailHost: process.env.EMAIL_HOST || process.env.SMTP_HOST || '',
  emailPort: parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '587', 10),
  emailSecure: process.env.EMAIL_SECURE === 'true' || process.env.SMTP_SECURE === 'true',
  emailUser: process.env.EMAIL_USER || process.env.SMTP_USER || '',
  emailPassword: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Fuel Order System',

  // ✅ SECURITY: Encryption Keys (required in production)
  // These are used for backup encryption and field-level encryption
  backupEncryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY || '',

  // System Timezone
  timezone: process.env.TZ || 'Africa/Nairobi',

  // ✅ SECURITY: Hardening Configuration
  securityPathBlocking: process.env.SECURITY_PATH_BLOCKING !== 'false',   // enabled by default
  securityBlockPaths: process.env.SECURITY_BLOCK_PATHS || '',             // comma-separated extra paths/regex
  securityIpBlocking: process.env.SECURITY_IP_BLOCKING !== 'false',       // enabled by default
  securitySuspiciousThreshold: parseInt(process.env.SECURITY_SUSPICIOUS_THRESHOLD || '5', 10),
  securityBlockDurationMs: parseInt(process.env.SECURITY_BLOCK_DURATION_MS || '600000', 10), // 10 min
  security404CountThreshold: parseInt(process.env.SECURITY_404_COUNT_THRESHOLD || '30', 10),
  security404WindowMs: parseInt(process.env.SECURITY_404_WINDOW_MS || '300000', 10),         // 5 min
  securityEventLogging: process.env.SECURITY_EVENT_LOGGING !== 'false',   // enabled by default
  securityAlertEmail: process.env.SECURITY_ALERT_EMAIL || '',
  securityAlertCooldownMs: parseInt(process.env.SECURITY_ALERT_COOLDOWN_MS || '300000', 10), // 5 min
  securityUaBlocking: process.env.SECURITY_UA_BLOCKING !== 'false',       // enabled by default
  securityIpGating: process.env.SECURITY_IP_GATING === 'true',           // disabled by default
  securityEventRetentionDays: parseInt(process.env.SECURITY_EVENT_RETENTION_DAYS || '90', 10),

  // Redis — used for Socket.io adapter, caching, and session sharing
  redisUrl: process.env.REDIS_URL || '',

  // Web Push (VAPID) — used for browser push notifications
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  // Accept either VAPID_SUBJECT (new) or VAPID_EMAIL (legacy) from .env
  vapidEmail: process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@fuelorder.local',
};

// Validate required environment variables
export const validateEnv = () => {
  // Always required
  const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  
  // Required in production only
  const productionRequired = process.env.NODE_ENV === 'production' ? [
    'BACKUP_ENCRYPTION_KEY',
    'FIELD_ENCRYPTION_KEY',
    'REDIS_URL',
  ] : [];

  // Validate all required variables
  const allRequired = [...required, ...productionRequired];
  const missing = allRequired.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const envType = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    throw new Error(
      `Missing required environment variables for ${envType}: ${missing.join(', ')}\n` +
      'Please check your .env file or set these environment variables.\n' +
      'Encryption keys are required in production for security.'
    );
  }

  // Validate encryption key lengths
  const encryptionKeys = ['BACKUP_ENCRYPTION_KEY', 'FIELD_ENCRYPTION_KEY'];
  for (const key of encryptionKeys) {
    const value = process.env[key];
    if (value && value.length < 12) {
      throw new Error(
        `${key} must be at least 12 characters long for security. ` +
        `Current length: ${value.length} characters.`
      );
    }
  }
};
