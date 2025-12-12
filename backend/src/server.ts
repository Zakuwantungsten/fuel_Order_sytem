import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config, validateEnv } from './config';
import connectDatabase from './config/database';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { csrfProtection, provideCsrfToken, csrfErrorHandler } from './middleware/csrf';
import logger from './utils/logger';

// Validate environment variables
validateEnv();

// Create Express app
const app: Application = express();

// Security middleware
app.use(helmet());

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

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use('/api/', limiter);

// Import archival scheduler
import { startArchivalScheduler } from './jobs/archivalScheduler';

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    })
  );
}

// CSRF Protection - Apply to state-changing routes
// GET requests to provide CSRF token to frontend
app.get('/api/csrf-token', provideCsrfToken, (_req, res) => {
  res.json({ success: true, message: 'CSRF token set' });
});

// Apply CSRF protection to all POST, PUT, DELETE, PATCH requests
app.use('/api/', (req, res, next) => {
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

// API routes
app.use('/api', routes);

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

    // Start archival scheduler (runs monthly at 2 AM on 1st day)
    startArchivalScheduler();

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
      logger.info('Archival scheduler: Active (runs monthly on 1st day at 2:00 AM)');
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
