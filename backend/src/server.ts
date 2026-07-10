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
import { backfillFuelMonthKeys } from './scripts/backfillFuelMonthKeys';
import databaseMonitor from './utils/databaseMonitor';
import { isPrimaryWorker, getWorkerInstanceId } from './utils/workerRole';

// Validate environment variables
try {
  validateEnv();
} catch (err: any) {
  // logger for structured logs + console as a guaranteed-flush fallback before exit
  // (matches the crash/exit handlers below).
  logger.error('Startup error (validateEnv):', err);
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
  //    The TLS-terminating edge (Cloudflare) and nginx both sit in front of the
  //    app, so this header is always served over HTTPS in production.
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
//    OPTIONS (CORS preflight) requests are excluded: their preflight cache is controlled
//    by Access-Control-Max-Age (a separate browser cache), not the HTTP response cache.
//    Applying no-store to OPTIONS prevents browsers from honouring maxAge caching.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check route registered EARLY — before HTTPS enforcement and all security
// middleware so the platform's internal HTTP health probe (no x-forwarded-proto
// header) is never blocked by the HTTPS-only or IP-filtering middleware.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    // ✅ SECURITY: timestamp omitted — exposing server time on a public
    // unauthenticated endpoint is unnecessary and aids timing/fingerprint attacks.
  });
});

// Passkey discovery endpoint. Browsers and password managers automatically probe
// this well-known path to learn whether the site supports passkeys (WebAuthn) and
// where users enroll/manage them. Registered EARLY (before security middleware) so
// it always returns a clean 200 and never shows up as a 404 / blocklist strike.
// See PASSKEY_IMPLEMENTATION.md (Phase 1).
app.get('/.well-known/passkey-endpoints', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({
    enroll: 'https://www.tahfuelorder.dev/settings/security',
    manage: 'https://www.tahfuelorder.dev/settings/security',
  });
});

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    optionsSuccessStatus: 200,
    // Cache preflight responses for 24 h. Browsers store this in a separate
    // CORS preflight cache (not the HTTP cache), so each unique endpoint only
    // pays one OPTIONS round-trip per day instead of one per request.
    maxAge: 86400,
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
import './jobs/securityDigest'; // Rolls routine auto-blocks into a scheduled summary email
import './jobs/fleetDailyCleanup';
import './jobs/backupTrashCleanup'; // LE-3: purge soft-deleted backups after retention window
import './jobs/disasterRecoveryDrill'; // Chaos: weekly automated backup-restore verification
import { jobRegistry } from './jobs/jobRegistry';
import backupService from './services/backupService';

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
// Return token in response body so cross-origin clients can read it without
// accessing cookies.
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
    if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/refresh' || req.path === '/auth/first-login-password' || req.path === '/auth/verify-mfa' || req.path === '/auth/setup-mfa/generate' || req.path === '/auth/setup-mfa/verify' || req.path === '/auth/setup-mfa/email/send' || req.path === '/auth/setup-mfa/email/verify' || req.path === '/auth/passkey/login/options' || req.path === '/auth/passkey/login/verify' || req.path === '/mfa/send-otp') {
      return next();
    }
    // Skip CSRF for Bearer-token (mobile / non-browser API) requests. CSRF only
    // applies to ambient cookie-authenticated requests: this API authenticates
    // solely via the `Authorization: Bearer <jwt>` header (no auth cookie), and a
    // cross-site attacker can neither read nor set that header, so such requests
    // cannot be forged. Requiring an X-XSRF-TOKEN here only breaks legitimate
    // mobile clients (they were getting 403 "CSRF token missing").
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }
    // Apply CSRF protection
    csrfProtection(req, res, next);
  });
};

applyCsrfProtection(apiBasePath);
applyCsrfProtection(legacyApiBasePath);

// IP Allowlist / Blocklist filter (evaluated against active rules in DB)
// Only apply strict IP rules to admin surfaces. Mobile users and general app
// traffic often come from changing carrier / CGNAT IPs, so a global allowlist
// can accidentally lock out legitimate users during token refresh or login.
const applyIpFilterProtection = (basePath: string) => {
  app.use(`${basePath}/admin`, ipFilterMiddleware);
  app.use(`${basePath}/system-admin`, ipFilterMiddleware);
};

applyIpFilterProtection(apiBasePath);
applyIpFilterProtection(legacyApiBasePath);

// API routes
app.use(apiBasePath, routes);
app.use(legacyApiBasePath, (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 23:59:59 GMT');
  next();
}, routes);

// Apex `/` → frontend; API lives under /api/v1 (and legacy /api)
app.get('/', (_req, res) => {
  res.redirect(302, 'https://www.tahfuelorder.dev');
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
    // Primary-only: avoid duplicate index builds when PM2 starts 2 workers.
    if (isPrimaryWorker()) {
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

      // Backfill FuelRecord.monthKey (idempotent; a no-op once filled). Awaited
      // so the indexed month filter in getAllFuelRecords never serves requests
      // against partially-backfilled data.
      try {
        await backfillFuelMonthKeys();
      } catch (backfillErr) {
        logger.error('monthKey backfill failed — month filters may miss old records until next restart:', backfillErr);
      }
    }

    // Connect to Redis (for Socket.io adapter, caching, sessions)
    // REQUIRED for PM2 cluster / multi-instance — without Redis, sockets won't
    // cross workers and realtime broadcasts stay local to one process.
    await connectRedis();

    // Load persisted autoblock config from DB into runtime config
    await BlocklistService.initConfig();

    // Initialize WebSocket server (will attach Redis adapter if available)
    initializeWebSocket(httpServer);
    logger.info('WebSocket server initialized');

    // BullMQ workers are safe on every instance (jobs are claimed once via Redis).
    initNotificationQueue();

    // Singleton background work: only the primary PM2 worker (NODE_APP_INSTANCE=0).
    // Secondary workers still serve HTTP + Socket.io.
    if (isPrimaryWorker()) {
      // Start MongoDB Change Streams for real-time push (requires replica set)
      startChangeStreams();

      // Start archival scheduler (runs monthly at 2 AM on 1st day)
      startArchivalScheduler();

      // Start backup scheduler (polls every minute for due user-defined schedules)
      startBackupScheduler();

      // DR: refresh the R2-side backup catalog (metadata stored separately from
      // MongoDB) so the backup list survives a total database loss. Fire-and-forget.
      backupService.writeManifestSafe().catch(() => { /* non-fatal */ });

      // Start all registered cron jobs via central registry
      jobRegistry.startAll();
      logger.info('Job registry started (primary worker)');

      // Start continuous DB/memory health monitoring (every 60s). Threshold alerts
      // (connection-pool, storage, memory) are evaluated here — independently of
      // whether a super-admin is viewing a monitoring tab. 60s is a deliberate balance:
      // frequent enough to catch real pressure, infrequent enough that the serverStatus
      // / dbStats / collection-count queries don't add meaningful load at 600 users.
      databaseMonitor.start(60_000);
      logger.info('Database monitor started (60s interval, primary worker)');
    } else {
      logger.info(`Secondary worker ${getWorkerInstanceId()} — HTTP/WS only (crons/change-streams skipped)`);
    }

    // Start listening
    httpServer.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT} (worker ${getWorkerInstanceId()})`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
      if (isPrimaryWorker()) {
        logger.info('Archival scheduler: Active (runs monthly on 1st day at 2:00 AM)');
      }
      logger.info('WebSocket server: Active');

      // Phase 3: signal PM2 (wait_ready) that the app is fully initialised and now
      // accepting connections. Only meaningful when launched under PM2 with an IPC
      // channel; process.send is undefined for a bare `node` run, so guard it.
      if (typeof process.send === 'function') {
        process.send('ready');
      }
    });

    // Graceful shutdown — handles SIGTERM (Docker, K8s, systemd) and SIGINT (Ctrl+C)
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
