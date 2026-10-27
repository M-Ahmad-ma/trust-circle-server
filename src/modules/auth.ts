import { Router } from 'express';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { refreshTokens, users, type User } from '../db/schema';
import { ApiError } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { hashPassword, verifyPassword } from '../lib/password';
import { generateRefreshToken, hashToken, refreshExpiryDate, signAccessToken } from '../lib/tokens';

export const authRouter = Router();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().trim().min(1).max(80),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export function selfUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarPath: user.avatarPath,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken(userId);
  const { token, tokenHash } = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt: refreshExpiryDate(),
  });
  return { accessToken, refreshToken: token };
}

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  const { email, password, name } = req.body as z.infer<typeof registerSchema>;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(password), name })
    .returning();

  const tokens = await issueTokens(user.id);
  res.status(201).json({ data: { user: selfUser(user), ...tokens } });
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const tokens = await issueTokens(user.id);
  res.status(200).json({ data: { user: selfUser(user), ...tokens } });
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokenHash = hashToken(refreshToken);

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));

  const tokens = await issueTokens(row.userId);
  res.status(200).json({ data: tokens });
});

authRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokenHash = hashToken(refreshToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  res.status(200).json({ data: { ok: true } });
});
