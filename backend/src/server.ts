import express, { Application } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { config, validateEnv } from './config';
import connectDatabase from './config/database';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { csrfProtection, provideCsrfToken, csrfErrorHandler } from './middleware/csrf';
import { responseSanitizationMiddleware, requestLoggingMiddleware } from './middleware/responseSanitization';
import { auditAccessDenied } from './middleware/auditAccessDenied';
import { ipFilterMiddleware } from './middleware/ipFilter';
import { attackPatternMiddleware } from './middleware/attackPatternMiddleware';
import { ipReputationMiddleware } from './middleware/ipReputationMiddleware';
import { uaBlockingMiddleware } from './middleware/uaBlockingMiddleware';
import { suspicious404Middleware } from './middleware/suspicious404Middleware';
import { fingerprintObfuscationMiddleware } from './middleware/fingerprintObfuscation';
import honeypotRoutes from './routes/honeypotRoutes';
import logger from './utils/logger';
import { initializeWebSocket } from './services/websocket';
import BlocklistService from './services/blocklistService';
import { requestId } from './middleware/requestId';

// Validate environment variables
try {
  validateEnv();
} catch (err: any) {
  console.error('STARTUP ERROR (validateEnv):', err.message);
  process.exit(1);
}

// Create Express app
const app: Application = express();

app.set('trust proxy', 1);

// Create HTTP server
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  dnsPrefetchControl: {
    allow: false, // ✅ Prevent browser DNS prefetch for user-supplied URLs (SSRF defense)
  },
  hidePoweredBy: true,  // ✅ Strip X-Powered-By header
  frameguard: { action: 'deny' },  // ✅ Prevent clickjacking
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ✅ SECURITY: Strip technology-revealing response headers
app.use(fingerprintObfuscationMiddleware);

// Health check route registered EARLY — before HTTPS enforcement and all security
// middleware so Railway's internal HTTP health probe (no x-forwarded-proto header)
// is never blocked by the HTTPS-only or IP-filtering middleware.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

if (config.nodeEnv === 'production') {
  app.use(
    helmet.hsts({
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    })
  );
}

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Cookie parser (required for CSRF)
app.use(cookieParser());

// ✅ SECURITY: Block malicious path probes before anything else
// Runs early to reject /.env, /.git, /wp-admin, etc. with 403
app.use(attackPatternMiddleware);

// ✅ SECURITY: IP reputation / auto-blocklist (fail2ban-style)
// Checks if IP was auto-blocked after repeated suspicious activity
app.use(ipReputationMiddleware);

// ✅ SECURITY: Block requests from known malicious / scanning user-agents
app.use(uaBlockingMiddleware);

// Request ID for traceability
app.use(requestId);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'text/csv', 'application/octet-stream'], limit: '5mb' }));

// Remove MongoDB operator characters from inputs
app.use(
  mongoSanitize({
    replaceWith: '_',
  })
);

// Compression middleware
app.use(compression());

const apiBasePath = '/api/v1';
const legacyApiBasePath = '/api';

// Import archival scheduler
import { startArchivalScheduler } from './jobs/archivalScheduler';
// Import fuel price scheduler (registers itself with jobRegistry on import)
import './jobs/fuelPriceScheduler';
import './jobs/securityEventRetention';
import './jobs/securityScoreSnapshot';
import { jobRegistry } from './jobs/jobRegistry';

// Enforce HTTPS only in production
if (config.nodeEnv === 'production') {
  app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (req.secure || forwardedProto === 'https') {
      return next();
    }

    res.status(403).json({
      success: false,
      message: 'HTTPS required',
    });
  });
}

// ✅ SECURITY: Response sanitization - prevents sensitive data leakage in responses
app.use(responseSanitizationMiddleware);

// ✅ SECURITY: Request logging - avoids logging sensitive request bodies
app.use(requestLoggingMiddleware);

// ✅ AUDIT: Auto-log every 401/403 as ACCESS_DENIED (PCI-DSS 10.2.3)
app.use(auditAccessDenied);

// Logging middleware (always through Winston)
morgan.token('reqId', (req) => (req as any).requestId || 'unknown');
const morganFormat =
  config.nodeEnv === 'development'
    ? ':reqId :method :url :status :response-time ms'
    : ':reqId :remote-addr :method :url :status :res[content-length] - :response-time ms';

app.use(
  morgan(morganFormat, {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// CSRF Protection - Apply to state-changing routes
// GET requests to provide CSRF token to frontend
app.get(`${apiBasePath}/csrf-token`, provideCsrfToken, (_req, res) => {
  res.json({ success: true, message: 'CSRF token set' });
});

app.get(`${legacyApiBasePath}/csrf-token`, provideCsrfToken, (_req, res) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 23:59:59 GMT');
  res.json({ success: true, message: 'CSRF token set' });
});

const applyCsrfProtection = (basePath: string) => {
  app.use(basePath, (req, res, next) => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Provide CSRF token for GET requests
      provideCsrfToken(req, res, () => next());
      return;
    }
    // Skip CSRF for login/register routes (initial auth)
    if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/refresh' || req.path === '/auth/first-login-password' || req.path === '/auth/verify-mfa' || req.path === '/auth/setup-mfa/generate' || req.path === '/auth/setup-mfa/verify' || req.path === '/auth/setup-mfa/email/send' || req.path === '/auth/setup-mfa/email/verify' || req.path === '/mfa/send-otp') {
      return next();
    }
    // Apply CSRF protection
    csrfProtection(req, res, next);
  });
};

applyCsrfProtection(apiBasePath);
applyCsrfProtection(legacyApiBasePath);

// IP Allowlist / Blocklist filter (evaluated against active rules in DB)
app.use(ipFilterMiddleware);

// API routes
app.use(apiBasePath, routes);
app.use(legacyApiBasePath, (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 23:59:59 GMT');
  next();
}, routes);

// Welcome route (no version or tech info)
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'API is running',
  });
});

// ✅ SECURITY: Honeypot trap routes (catches scanners probing common CMS/admin paths)
app.use(honeypotRoutes);

// ✅ SECURITY: Track 404 rate per IP — auto-block after sustained probing
app.use(suspicious404Middleware);

// 404 handler
app.use(notFound);

// CSRF error handler (must be before global error handler)
app.use(csrfErrorHandler);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.port;

const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Load persisted autoblock config from DB into runtime config
    await BlocklistService.initConfig();

    // Initialize WebSocket server
    initializeWebSocket(httpServer);
    logger.info('WebSocket server initialized');

    // Start archival scheduler (runs monthly at 2 AM on 1st day)
    startArchivalScheduler();

    // Start all registered cron jobs via central registry
    jobRegistry.startAll();
    logger.info('Job registry started');

    // Start listening
    httpServer.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
      logger.info('Archival scheduler: Active (runs monthly on 1st day at 2:00 AM)');
      logger.info('WebSocket server: Active');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    console.error('FAILED TO START SERVER:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('UNHANDLED REJECTION:', reason);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  console.error('UNCAUGHT EXCEPTION:', error.message, error.stack);
  process.exit(1);
});

// Start the server
startServer();

export default app;
