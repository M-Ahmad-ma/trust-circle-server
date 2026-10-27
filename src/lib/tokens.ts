import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new Error('invalid token type');
  }
  return { userId: payload.sub };
}

export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
