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
import logger from './utils/logger';
import { initializeWebSocket } from './services/websocket';
import { requestId } from './middleware/requestId';

// Validate environment variables
validateEnv();

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
}));

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

// Request ID for traceability
app.use(requestId);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/refresh') {
      return next();
    }
    // Apply CSRF protection
    csrfProtection(req, res, next);
  });
};

applyCsrfProtection(apiBasePath);
applyCsrfProtection(legacyApiBasePath);

// API routes
app.use(apiBasePath, routes);
app.use(legacyApiBasePath, (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 23:59:59 GMT');
  next();
}, routes);

// Welcome route
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Fuel Order Management System API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// Health check route
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

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

    // Initialize WebSocket server
    initializeWebSocket(httpServer);
    logger.info('WebSocket server initialized');

    // Start archival scheduler (runs monthly at 2 AM on 1st day)
    startArchivalScheduler();

    // Start listening
    httpServer.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
      logger.info('Archival scheduler: Active (runs monthly on 1st day at 2:00 AM)');
      logger.info('WebSocket server: Active');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();

export default app;
