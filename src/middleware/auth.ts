import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }
  try {
    req.userId = verifyAccessToken(header.slice(7)).userId;
    next();
  } catch {
    next(new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired access token'));
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
