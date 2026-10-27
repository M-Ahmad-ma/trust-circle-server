import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';

export const app = createApp();

export async function resetDb(): Promise<void> {
  await pool.query(
    'TRUNCATE users, friendships, refresh_tokens, places, experiences, photos CASCADE'
  );
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
}

export function auth(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.accessToken}` };
}

let counter = 0;

export async function registerUser(
  overrides: { name?: string; email?: string; password?: string } = {}
): Promise<TestUser> {
  const n = ++counter;
  const body = {
    email: overrides.email ?? `user${n}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.dev`,
    password: overrides.password ?? 'password123',
    name: overrides.name ?? `User ${n}`,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    id: res.body.data.user.id,
    email: body.email,
    name: body.name,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

export async function makeFriends(a: TestUser, b: TestUser): Promise<void> {
  const req = await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
  if (req.status !== 201) {
    throw new Error(`friend request failed: ${req.status} ${JSON.stringify(req.body)}`);
  }
  const accept = await request
    (app)
    .post(`/api/friends/${req.body.data.request.id}/accept`)
    .set(auth(b));
  if (accept.status !== 200) {
    throw new Error(`accept failed: ${accept.status} ${JSON.stringify(accept.body)}`);
  }
}

export async function createPlace(
  token: string,
  body: { name: string; lat: number; lng: number; category?: string; address?: string; city?: string }
): Promise<{ id: string; name: string; lat: number; lng: number }> {
  const res = await request(app).post('/api/places').set({ Authorization: `Bearer ${token}` }).send(body);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`create place failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

export async function createExperience(
  token: string,
  body: {
    placeId: string;
    rating?: number;
    reviewText?: string;
    visitedAt?: string;
    visibility: 'circle' | 'extended' | 'community';
    photoIds?: string[];
  }
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await request(app)
    .post('/api/experiences')
    .set({ Authorization: `Bearer ${token}` })
    .send({
      rating: 5,
      reviewText: 'Great place, would visit again.',
      visitedAt: '2026-09-01',
      ...body,
    });
  if (res.status !== 201) {
    throw new Error(`create experience failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
