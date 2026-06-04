const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
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
import { startChangeStreams, stopChangeStreams } from './services/changeStreamListener';
import { EditLock } from './models';
import { connectRedis, disconnectRedis } from './config/redis';
import { initNotificationQueue, closeNotificationQueue } from './services/notificationQueue';
import BlocklistService from './services/blocklistService';
import { requestId } from './middleware/requestId';
import { runFirewallSeed } from './scripts/seedFirewallDefaults';
import databaseMonitor from './utils/databaseMonitor';

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
  // ✅ CSP: This is a REST API — no scripts, styles, or media are served.
  //    Locking down all fetch directives prevents any inadvertent content
  //    from being interpreted if an API response is ever opened in a browser.
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'none'"],
      scriptSrc:      ["'none'"],
      styleSrc:       ["'none'"],
      imgSrc:         ["'none'"],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
      formAction:     ["'self'"],
      baseUri:        ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  // ✅ SECURITY: HSTS — always on, not gated on NODE_ENV.
  //    max-age=31536000 (1 year) + includeSubDomains + preload meets the minimum
  //    requirements for HSTS preload list submission (RFC 6797 / hstspreload.org).
  //    Railway and Firebase both terminate TLS before the app sees the request,
  //    so this header is always served over HTTPS in production.
  hsts: {
    maxAge: 31536000,       // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  // ✅ SECURITY: Explicitly declared (Helmet default) — prevents MIME-sniffing
  //    on all responses including error pages (401, 403, 500).
  //    Declared explicitly so it cannot be accidentally removed with a default change.
  xContentTypeOptions: true,
  dnsPrefetchControl: {
    allow: false, // ✅ Prevent browser DNS prefetch for user-supplied URLs (SSRF defense)
  },
  hidePoweredBy: true,  // ✅ Strip X-Powered-By header
  frameguard: { action: 'deny' },  // ✅ Prevent clickjacking
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ✅ SECURITY: Strip technology-revealing response headers
app.use(fingerprintObfuscationMiddleware);

// ✅ SECURITY: Prevent caching of all API responses. Every endpoint returns dynamic,
//    potentially user-specific data. no-store prevents the browser or any intermediate
//    proxy from persisting the response. Pragma/Expires provide HTTP/1.0 back-compat
//    for older proxies and CDN edge nodes.
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check route registered EARLY — before HTTPS enforcement and all security
// middleware so Railway's internal HTTP health probe (no x-forwarded-proto header)
// is never blocked by the HTTPS-only or IP-filtering middleware.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    // ✅ SECURITY: timestamp omitted — exposing server time on a public
    // unauthenticated endpoint is unnecessary and aids timing/fingerprint attacks.
  });
});

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
// Import backup scheduler
import { startBackupScheduler } from './jobs/backupScheduler';
// Import fuel price scheduler (registers itself with jobRegistry on import)
import './jobs/fuelPriceScheduler';
import './jobs/securityEventRetention';
import './jobs/securityScoreSnapshot';
import './jobs/fleetDailyCleanup';
import './jobs/backupTrashCleanup'; // LE-3: purge soft-deleted backups after retention window
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
// Return token in response body so cross-origin clients (e.g. Firebase-hosted
// frontend talking to Railway backend) can read it without accessing cookies.
app.get(`${apiBasePath}/csrf-token`, provideCsrfToken, (_req, res) => {
  res.json({ success: true, csrfToken: res.locals.csrfToken });
});

app.get(`${legacyApiBasePath}/csrf-token`, provideCsrfToken, (_req, res) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 23:59:59 GMT');
  res.json({ success: true, csrfToken: res.locals.csrfToken });
});

const applyCsrfProtection = (basePath: string) => {
  app.use(basePath, (req, res, next) => {
    // The legacy /api mount matches /api/v1/* paths too (req.path starts with
    // /v1/). Those are already handled by the /api/v1 mount above, so skip
    // them here to avoid double-processing with a mismatched exclusion list.
    if (basePath === legacyApiBasePath && req.path.startsWith('/v1')) {
      return next();
    }
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

    // Ensure the EditLock indexes exist (unique lock key + TTL auto-expiry).
    // Mongoose builds indexes for new collections automatically, but syncing
    // here guarantees the TTL index is applied to pre-existing databases too.
    try {
      await EditLock.syncIndexes();
      logger.info('EditLock indexes synced (unique key + TTL)');
    } catch (idxErr) {
      logger.warn('EditLock index sync failed (non-fatal):', idxErr);
    }

    // Seed firewall defaults (path rules, honeypots, bot UAs) on every boot.
    // Idempotent — skips rows that already exist, only inserts new ones.
    try {
      await runFirewallSeed();
    } catch (seedErr) {
      logger.warn('Firewall seed failed (non-fatal):', seedErr);
    }

    // Connect to Redis (for Socket.io adapter, caching, sessions)
    // If REDIS_URL is not set, operates in single-instance mode
    await connectRedis();

    // Load persisted autoblock config from DB into runtime config
    await BlocklistService.initConfig();

    // Initialize WebSocket server (will attach Redis adapter if available)
    initializeWebSocket(httpServer);
    logger.info('WebSocket server initialized');

    // Start MongoDB Change Streams for real-time push (requires replica set)
    startChangeStreams();

    // Initialize BullMQ notification queue (uses Redis for async push dispatch)
    initNotificationQueue();

    // Start archival scheduler (runs monthly at 2 AM on 1st day)
    startArchivalScheduler();

    // Start backup scheduler (polls every minute for due user-defined schedules)
    startBackupScheduler();

    // Start all registered cron jobs via central registry
    jobRegistry.startAll();
    logger.info('Job registry started');

    // Start continuous DB/memory health monitoring (every 60s). Threshold alerts
    // (connection-pool, storage, memory) are evaluated here — independently of
    // whether a super-admin is viewing a monitoring tab. 60s is a deliberate balance:
    // frequent enough to catch real pressure, infrequent enough that the serverStatus
    // / dbStats / collection-count queries don't add meaningful load at 600 users.
    databaseMonitor.start(60_000);
    logger.info('Database monitor started (60s interval)');

    // Start listening
    httpServer.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
      logger.info('Archival scheduler: Active (runs monthly on 1st day at 2:00 AM)');
      logger.info('WebSocket server: Active');
    });

    // Graceful shutdown — handles SIGTERM (Railway, Docker, K8s) and SIGINT (Ctrl+C)
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;          // prevent double-shutdown
      shuttingDown = true;
      logger.info(`${signal} received — shutting down gracefully`);

      // Stop accepting new connections, let in-flight requests drain (15s max)
      httpServer.close(() => logger.info('HTTP server closed'));
      setTimeout(() => {
        logger.warn('Shutdown timeout reached — forcing exit');
        process.exit(1);
      }, 15_000).unref();

      databaseMonitor.stop();
      await stopChangeStreams();
      await closeNotificationQueue();
      await disconnectRedis();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
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
