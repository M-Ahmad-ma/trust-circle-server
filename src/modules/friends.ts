import { Router } from 'express';
import { and, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, rowsOf } from '../db/client';
import { friendships, users } from '../db/schema';
import { ApiError } from '../middleware/auth';
import { parse } from '../middleware/validate';
import { relationshipObject } from '../lib/relationship';
import { relationshipBetween } from '../lib/social';

export const friendsRouter = Router();

const idParam = z.string().uuid();
const requestIdParam = z.string().uuid();

interface PairRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
}

async function findPair(a: string, b: string): Promise<PairRow | undefined> {
  const rows = rowsOf<PairRow>(
    await db.execute(sql`
      SELECT id, requester_id, addressee_id, status
      FROM friendships
      WHERE (requester_id = ${a} AND addressee_id = ${b})
         OR (requester_id = ${b} AND addressee_id = ${a})
      LIMIT 1
    `)
  );
  return rows[0];
}

/** GET /api/friends — accepted connections */
friendsRouter.get('/', async (req, res) => {
  const me = req.userId!;
  const rows = rowsOf<{
    id: string;
    name: string;
    avatar_path: string | null;
    bio: string | null;
    friends_since: Date | string;
  }>(
    await db.execute(sql`
      SELECT u.id, u.name, u.avatar_path, u.bio, f.created_at AS friends_since
      FROM friendships f
      JOIN users u
        ON u.id = CASE WHEN f.requester_id = ${me} THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'accepted'
        AND (f.requester_id = ${me} OR f.addressee_id = ${me})
      ORDER BY u.name
    `)
  );

  res.json({
    data: rows.map((r) => ({
      user: { id: r.id, name: r.name, avatarPath: r.avatar_path, bio: r.bio },
      friendsSince: r.friends_since instanceof Date ? r.friends_since.toISOString() : r.friends_since,
    })),
  });
});

/**
 * GET /api/friends/blocked — people *you* blocked.
 *
 * Exists because blocking is otherwise a one-way door: once you block someone
 * their profile 404s for you (API.md §6), so there is no profile left to visit
 * and no screen to put an unblock control on. `relationship` returns `none` for
 * blocked pairs, so the client cannot infer the block either. This list is the
 * only place that state is observable, and therefore the only place unblock can
 * honestly live.
 *
 * Directed by design: this lists blocks you placed, not blocks placed on you.
 * Someone who blocked you simply ceases to exist for you.
 */
friendsRouter.get('/blocked', async (req, res) => {
  const me = req.userId!;
  const rows = rowsOf<{
    id: string;
    name: string;
    avatar_path: string | null;
    bio: string | null;
    blocked_at: Date | string;
  }>(
    await db.execute(sql`
      SELECT u.id, u.name, u.avatar_path, u.bio, f.created_at AS blocked_at
      FROM friendships f
      JOIN users u ON u.id = f.addressee_id
      WHERE f.status = 'blocked' AND f.requester_id = ${me}
      ORDER BY f.created_at DESC
    `)
  );

  res.json({
    data: rows.map((r) => ({
      user: { id: r.id, name: r.name, avatarPath: r.avatar_path, bio: r.bio },
      blockedAt: r.blocked_at instanceof Date ? r.blocked_at.toISOString() : r.blocked_at,
    })),
  });
});

/** GET /api/friends/requests — incoming + outgoing pending requests */
friendsRouter.get('/requests', async (req, res) => {
  const me = req.userId!;

  const [incoming, outgoing] = await Promise.all([
    db.execute(sql`
      SELECT f.id, f.created_at, u.id AS user_id, u.name, u.avatar_path, u.bio
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ${me} AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `),
    db.execute(sql`
      SELECT f.id, f.created_at, u.id AS user_id, u.name, u.avatar_path, u.bio
      FROM friendships f
      JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = ${me} AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `),
  ]);

  type ReqRow = {
    id: string;
    created_at: Date | string;
    user_id: string;
    name: string;
    avatar_path: string | null;
    bio: string | null;
  };

  const mapReq = (r: ReqRow) => ({
    requestId: r.id,
    user: { id: r.user_id, name: r.name, avatarPath: r.avatar_path, bio: r.bio },
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });

  res.json({
    data: {
      incoming: rowsOf<ReqRow>(incoming).map(mapReq),
      outgoing: rowsOf<ReqRow>(outgoing).map(mapReq),
    },
  });
});

/** POST /api/friends/request/:userId — send a friend request */
friendsRouter.post('/request/:userId', async (req, res) => {
  const me = req.userId!;
  const target = parse(idParam, req.params.userId);

  if (target === me) {
    throw new ApiError(400, 'SELF_REQUEST', 'You cannot send a friend request to yourself');
  }

  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, target)).limit(1);
  if (!targetUser) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

  const pair = await findPair(me, target);
  if (pair) {
    if (pair.status === 'accepted') {
      throw new ApiError(409, 'ALREADY_FRIENDS', 'You are already friends with this user');
    }
    if (pair.status === 'blocked') {
      const iAmBlocker = pair.requester_id === me;
      throw new ApiError(
        403,
        iAmBlocker ? 'YOU_BLOCKED_THEM' : 'BLOCKED',
        iAmBlocker
          ? 'You have blocked this user. Unblock them first.'
          : 'This user has blocked you.'
      );
    }
    // pending
    const iAmRequester = pair.requester_id === me;
    throw new ApiError(
      409,
      iAmRequester ? 'REQUEST_ALREADY_SENT' : 'REQUEST_ALREADY_RECEIVED',
      iAmRequester
        ? 'A friend request to this user is already pending'
        : 'This user has already sent you a friend request',
      { requestId: pair.id }
    );
  }

  const [row] = await db
    .insert(friendships)
    .values({ requesterId: me, addresseeId: target, status: 'pending' })
    .returning();

  res.status(201).json({ data: { request: { id: row.id, status: row.status, direction: 'outgoing' } } });
});

/** POST /api/friends/:requestId/accept */
friendsRouter.post('/:requestId/accept', async (req, res) => {
  const me = req.userId!;
  const requestId = parse(requestIdParam, req.params.requestId);

  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId)).limit(1);
  if (!row || row.addresseeId !== me || row.status !== 'pending') {
    throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  }

  const [updated] = await db
    .update(friendships)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(friendships.id, requestId))
    .returning();

  const friendId = updated.requesterId;
  const [friend] = await db.select().from(users).where(eq(users.id, friendId)).limit(1);

  res.json({
    data: {
      friendship: {
        id: updated.id,
        status: updated.status,
        user: friend
          ? { id: friend.id, name: friend.name, avatarPath: friend.avatarPath, bio: friend.bio }
          : null,
      },
    },
  });
});

/** POST /api/friends/:requestId/reject — removes the pending request */
friendsRouter.post('/:requestId/reject', async (req, res) => {
  const me = req.userId!;
  const requestId = parse(requestIdParam, req.params.requestId);

  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId)).limit(1);
  if (!row || row.addresseeId !== me || row.status !== 'pending') {
    throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  }

  await db.delete(friendships).where(eq(friendships.id, requestId));
  res.json({ data: { ok: true } });
});

/** POST /api/friends/block/:userId */
friendsRouter.post('/block/:userId', async (req, res) => {
  const me = req.userId!;
  const target = parse(idParam, req.params.userId);

  if (target === me) {
    throw new ApiError(400, 'SELF_BLOCK', 'You cannot block yourself');
  }
  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, target)).limit(1);
  if (!targetUser) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

  // single row per pair: replace whatever exists with a directed block row
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, me), eq(friendships.addresseeId, target)),
        and(eq(friendships.requesterId, target), eq(friendships.addresseeId, me))
      )
    );

  const [row] = await db
    .insert(friendships)
    .values({ requesterId: me, addresseeId: target, status: 'blocked' })
    .returning();

  res.json({ data: { block: { id: row.id, blocked: true } } });
});

/** DELETE /api/friends/block/:userId — unblock */
friendsRouter.delete('/block/:userId', async (req, res) => {
  const me = req.userId!;
  const target = parse(idParam, req.params.userId);

  const [deleted] = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.requesterId, me),
        eq(friendships.addresseeId, target),
        eq(friendships.status, 'blocked')
      )
    )
    .returning();

  if (!deleted) throw new ApiError(404, 'BLOCK_NOT_FOUND', 'No block exists for this user');
  res.json({ data: { blocked: false } });
});

/** DELETE /api/friends/:userId — unfriend */
friendsRouter.delete('/:userId', async (req, res) => {
  const me = req.userId!;
  const target = parse(idParam, req.params.userId);

  const pair = await findPair(me, target);
  if (!pair || pair.status !== 'accepted') {
    throw new ApiError(404, 'NOT_FRIENDS', 'You are not friends with this user');
  }

  await db.delete(friendships).where(eq(friendships.id, pair.id));
  res.json({ data: { ok: true } });
});

/** GET /api/friends/:userId/relationship — computed relationship label */
friendsRouter.get('/:userId/relationship', async (req, res) => {
  const me = req.userId!;
  const target = parse(idParam, req.params.userId);

  if (me !== target) {
    const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, target)).limit(1);
    if (!targetUser) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const type = await relationshipBetween(me, target);
  res.json({ data: relationshipObject(type) });
});
