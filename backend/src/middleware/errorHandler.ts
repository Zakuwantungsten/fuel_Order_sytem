import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'express-validator';
import logger from '../utils/logger';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  data?: Record<string, any>;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Attach extra payload (e.g. current record for 409 conflicts) */
  withData(data: Record<string, any>): this {
    this.data = data;
    return this;
  }
}

/**
 * Handle not found routes
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  // Don't reveal the exact URL in the error message (path enumeration defense)
  const error = new ApiError(404, 'Not found');
  next(error);
};

/**
 * Global error handler
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  // Handle ApiError
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // Handle Mongoose validation errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values((err as any).errors)
      .map((e: any) => e.message)
      .join(', ');
    isOperational = true;
  }

  // Handle Mongoose duplicate key errors
  else if ((err as any).code === 11000) {
    statusCode = 400;
    const field = Object.keys((err as any).keyPattern)[0];
    message = `${field} already exists`;
    isOperational = true;
  }

  // Handle Mongoose cast errors
  else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    isOperational = true;
  }

  // Handle Mongoose "document vanished/changed under us" — happens when a record
  // is deleted or replaced mid-request (e.g. a database restore swapping data, or
  // a concurrent write). Surface a retryable 503 instead of a scary 500.
  else if (err.name === 'DocumentNotFoundError' || err.name === 'VersionError') {
    statusCode = 503;
    message = 'The system is briefly busy (data is being updated). Please retry in a moment.';
    isOperational = true;
  }

  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    isOperational = true;
  }

  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    isOperational = true;
  }

  // Handle body-parser PayloadTooLargeError
  else if ((err as any).type === 'entity.too.large' || (err as any).status === 413 || (err as any).statusCode === 413) {
    statusCode = 413;
    message = 'Request body too large';
    isOperational = true;
  }

  // Log error
  if (!isOperational) {
    logger.error('Unhandled error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      requestId: (req as any).requestId,
    });
  } else {
    logger.warn('Operational error:', {
      message,
      statusCode,
      url: req.url,
      method: req.method,
      requestId: (req as any).requestId,
    });
  }

  // Send error response — never include stack traces (even in dev, use server logs)
  const response: Record<string, any> = {
    success: false,
    message,
    requestId: (req as any).requestId,
  };

  // Attach extra data (e.g. current record for 409 version conflicts)
  if (err instanceof ApiError && err.data) {
    response.data = err.data;
  }

  res.status(statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
