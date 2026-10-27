import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, closeDb, registerUser, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

describe('auth', () => {
  it('registers a user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'Ahmed@Example.com ', password: 'password123', name: 'Ahmed Khan' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('ahmed@example.com');
    expect(res.body.data.user.name).toBe('Ahmed Khan');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('rejects duplicate email', async () => {
    await registerUser({ email: 'dup@test.dev' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.dev', password: 'password123', name: 'Copy' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@test.dev', password: 'abc', name: 'Short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials only', async () => {
    const user = await registerUser({ email: 'login@test.dev', password: 'password123' });

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.dev', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.dev', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.id).toBe(user.id);
    expect(ok.body.data.accessToken).toBeTruthy();
  });

  it('rejects unknown email with the same error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('protects authenticated routes', async () => {
    const noToken = await request(app).get('/api/users/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get('/api/users/me')
      .set({ Authorization: 'Bearer not-a-real-token' });
    expect(badToken.status).toBe(401);
    expect(badToken.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the current user from /me', async () => {
    const user = await registerUser({ name: 'Me Tester' });
    const res = await request(app).get('/api/users/me').set(auth(user));
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Me Tester');
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('rotates refresh tokens and invalidates the old one', async () => {
    const user = await registerUser();

    const first = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(user.refreshToken);

    // old token was rotated — using it again must fail
    const replay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(replay.status).toBe(401);

    // the new token works
    const second = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken });
    expect(second.status).toBe(200);

    // access token from refresh is valid
    const me = await request(app)
      .get('/api/users/me')
      .set({ Authorization: `Bearer ${second.body.data.accessToken}` });
    expect(me.status).toBe(200);
    expect(me.body.data.user.id).toBe(user.id);
  });

  it('logout revokes the refresh token', async () => {
    const user = await registerUser();
    const out = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: user.refreshToken });
    expect(out.status).toBe(200);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('rejects garbage refresh tokens', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'definitely-not-a-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
