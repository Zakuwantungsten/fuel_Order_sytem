import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  // MongoDB
  mongodbUri: process.env.MONGODB_URI || '',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
  jwtExpire: process.env.JWT_EXPIRE || '30m',
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

  // System Timezone
  timezone: process.env.TZ || 'Africa/Nairobi',
};

// Validate required environment variables
export const validateEnv = () => {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please create a .env file based on .env.example'
    );
  }
};
