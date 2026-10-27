import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isDatabaseUnavailable } from '../db/client';
import { ApiError } from './auth';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'NOT_FOUND', 'Resource not found'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  const anyErr = err as { name?: string; code?: string; message?: string };
  if (anyErr?.name === 'MulterError') {
    res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: anyErr.message || 'Upload failed' } });
    return;
  }

  // The database is down or unreachable. This is an outage, not a bad request,
  // and saying so is the difference between "we are down, try again shortly" and
  // a generic 500 that sends the user hunting for a bug in their own input.
  if (isDatabaseUnavailable(err)) {
    console.error('[db] database unavailable:', anyErr?.message ?? err);
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is unavailable. Please try again shortly.',
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
