import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(30),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  /**
   * Database timeouts. Without them an unreachable database leaves requests
   * pending forever instead of failing, which reads as a hung app rather than
   * an outage.
   */
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().positive().default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().positive().default(10_000),
  /**
   * Nominatim asks every caller to identify itself and to stay under one request
   * per second. Both are contractual, not stylistic — an anonymous or bursty
   * client gets blocked from the shared infrastructure this app depends on for
   * its map tiles too.
   */
  GEOCODING_USER_AGENT: z
    .string()
    .default('TrustCircle/1.0 (https://github.com/trust-circle; dev use)'),
  GEOCODING_BASE_URL: z.string().default('https://nominatim.openstreetmap.org'),
  GEOCODING_TIMEOUT_MS: z.coerce.number().positive().default(8000),
});

export const env = schema.parse(process.env);
