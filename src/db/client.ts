import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env';
import * as schema from './schema';

/**
 * Timeouts are not optional here.
 *
 * With no `connectionTimeoutMillis`, a database that is unreachable leaves the
 * query pending indefinitely — the HTTP request never returns, and the client
 * sees a hang rather than an error. That is exactly what happened when Docker's
 * `docker0` bridge lost its address: every route that touched the database
 * stopped responding, while `/health` (which does not touch it) kept returning
 * 200 and made the whole app look like a network problem on the phone.
 *
 * Failing fast turns that class of outage into a 503 the user can be told
 * about, instead of an indefinite spinner.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === 'test' ? 2 : 10,
  /** How long to wait for a connection to be established. */
  connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
  /** How long to wait for a free connection from the pool. */
  idleTimeoutMillis: 30_000,
  /**
   * How long a single query may run. A runaway query should fail rather than
   * pin a pool connection forever — with `max: 10`, ten stuck queries take the
   * whole API down.
   */
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
});

/**
 * True when an error is the database being unreachable, rather than a bad query.
 *
 * The interesting error is usually buried. Drizzle wraps driver errors in a
 * `DrizzleQueryError` whose own `cause` is the pg error, whose `cause` is in
 * turn the socket error — and the code that identifies it (`ECONNREFUSED` and
 * friends) lives on whichever of those is the real one, not on the wrapper.
 * So the whole chain is walked and every level is inspected.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  const CODES = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    '57P03', // cannot_connect_now
  ]);

  const MESSAGES = [
    'timeout exceeded when trying to connect',
    'connection terminated due to connection timeout',
    'connection terminated unexpectedly',
    'connection refused',
    'the database system is starting up',
    'connection ended',
  ];

  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const candidate = current as { code?: string; message?: string; cause?: unknown };
    if (candidate.code && CODES.has(candidate.code)) return true;

    const message = (candidate.message ?? '').toLowerCase();
    if (MESSAGES.some((needle) => message.includes(needle))) return true;

    current = candidate.cause;
  }

  return false;
}

export const db = drizzle(pool, { schema });

/** node-postgres drizzle `db.execute()` may return rows directly or a QueryResult. */
export function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && 'rows' in res) {
    return (res as { rows: unknown }).rows as T[];
  }
  return [];
}
