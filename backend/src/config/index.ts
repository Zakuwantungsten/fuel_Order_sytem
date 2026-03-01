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
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  r2BucketName: process.env.R2_BUCKET_NAME || 'fuel-order-backups',

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
