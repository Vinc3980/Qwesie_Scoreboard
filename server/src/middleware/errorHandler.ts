import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ApiErrorResponse } from '@qwesie/shared';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();

  if (err instanceof AppError) {
    logger.warn(`AppError [${err.statusCode}]: ${err.message}`, err.details);
    const details = err.details as any;
    const issues = Array.isArray(details) ? details : Array.isArray(details?.issues) ? details.issues : undefined;
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.name,
        ...(issues ? { issues } : {}),
        details: err.details,
      },
      timestamp,
    } as any);
    return;
  }

  if (err instanceof ZodError) {
    const issues = err.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('ValidationError (Zod):', issues);
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        // canonical + backward-compatible fields
        issues,
        details: issues,
      },
      timestamp,
    } as any);
    return;
  }

  logger.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      code: 'INTERNAL_SERVER_ERROR',
    },
    timestamp,
  });
}
