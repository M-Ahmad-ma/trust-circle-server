import path from 'path';
import fs from 'fs';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { pool } from './db/client';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth';
import { usersRouter } from './modules/users';
import { friendsRouter } from './modules/friends';
import { placesRouter } from './modules/places';
import { experiencesRouter } from './modules/experiences';
import { uploadsRouter } from './modules/uploads';
import { exploreRouter } from './modules/explore';
import { geocodingRouter } from './modules/geocoding';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Railway terminates TLS and forwards the real client address in
  // `X-Forwarded-For`. Without this, Express treats every request as coming
  // from the proxy itself, so `req.ip` and `req.protocol` are wrong.
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const uploadDir = path.resolve(env.UPLOAD_DIR);
  fs.mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true }));

  /**
   * Liveness plus readiness. Reporting only "the process is up" is what let a
   * database outage hide: `/health` kept returning 200 while every route that
   * touched the database hung, so the app looked like a network problem on the
   * phone rather than a server-side outage.
   */
  app.get('/health', async (_req, res) => {
    let database: 'ok' | 'unavailable' = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch {
      database = 'unavailable';
    }

    // 503 when the database is gone: a load balancer should take this instance
    // out of rotation, and a human should not have to read the body to know.
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'trust-circle-api',
      database,
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/friends', requireAuth, friendsRouter);
  app.use('/api/places', requireAuth, placesRouter);
  app.use('/api/experiences', requireAuth, experiencesRouter);
  app.use('/api/uploads', requireAuth, uploadsRouter);
  app.use('/api/explore', requireAuth, exploreRouter);
app.use('/api/geocode', requireAuth, geocodingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
