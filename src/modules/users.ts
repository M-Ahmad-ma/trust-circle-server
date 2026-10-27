import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, rowsOf } from '../db/client';
import { users } from '../db/schema';
import { ApiError } from '../middleware/auth';
import { parse } from '../middleware/validate';
import { listQuerySchema } from '../lib/geo';
import { experienceListBase } from '../lib/experience-sql';
import {
  relationshipCase,
  relationshipObject,
  viewerCte,
  visibilityCondition,
  visibilityConditionWith,
  type RelationshipType,
} from '../lib/relationship';
import { blockEdgeExists, relationshipBetween } from '../lib/social';
import { toExperienceCard, type ExperienceCardRow } from '../lib/serialize';
import { selfUser } from './auth';

export const usersRouter = Router();

const idParam = z.string().uuid();

const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    avatarPath: z
      .string()
      .regex(/^\/uploads\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|gif)$/, 'avatarPath must be a valid uploaded file path')
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(12),
});

usersRouter.get('/me', async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  res.json({ data: { user: selfUser(user) } });
});

usersRouter.patch('/me', async (req, res) => {
  const body = parse(updateMeSchema, req.body);
  const [user] = await db
    .update(users)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.avatarPath !== undefined ? { avatarPath: body.avatarPath } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, req.userId!))
    .returning();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  res.json({ data: { user: selfUser(user) } });
});

/** People search (name-based, light). */
usersRouter.get('/search', async (req, res) => {
  const viewerId = req.userId!;
  const q = parse(searchQuerySchema, req.query);

  const rows = rowsOf<{
    id: string;
    name: string;
    avatar_path: string | null;
    bio: string | null;
    rel_type: RelationshipType;
  }>(
    await db.execute(sql`
      SELECT u.id, u.name, u.avatar_path, u.bio,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM friendships f
            WHERE f.status = 'accepted'
              AND ((f.requester_id = ${viewerId} AND f.addressee_id = u.id)
                OR (f.addressee_id = ${viewerId} AND f.requester_id = u.id))
          ) THEN 'direct_friend'
          ELSE 'none'
        END AS rel_type
      FROM users u
      WHERE u.id <> ${viewerId}
        AND u.name ILIKE ${'%' + q.q + '%'}
        AND NOT EXISTS (
          SELECT 1 FROM friendships f
          WHERE f.status = 'blocked'
            AND ((f.requester_id = ${viewerId} AND f.addressee_id = u.id)
              OR (f.requester_id = u.id AND f.addressee_id = ${viewerId}))
        )
      ORDER BY u.name
      LIMIT ${q.limit}
    `)
  );

  res.json({
    data: rows.map((r) => ({
      user: { id: r.id, name: r.name, avatarPath: r.avatar_path, bio: r.bio },
      relationship: relationshipObject(r.rel_type),
    })),
  });
});

/**
 * GET /api/users/suggestions — people who have been to the same places you have,
 * ranked by how many. This is the discovery surface for a user with no friends yet:
 * it answers "who here is worth asking?" without needing a name to search for.
 *
 * The candidate's own experience must be VISIBLE to the viewer for the shared place
 * to count. Without that filter this endpoint would leak the fact that someone
 * visited a place — exactly what a `circle`/`extended` post exists to conceal, and
 * exactly what every other read path enforces. So the visibility condition is applied
 * to `e2` (the candidate), not just the viewer.
 *
 * Excluded: self, blocked pairs (either direction), existing friends, and any pair
 * with a request already open in EITHER direction. That last one matters more than it
 * looks: GET /users/search reports a pending pair as `none`, so a suggestion row for
 * someone you already asked would render an Add button that can only 409.
 *
 * Empty result is normal and not an error — a viewer with no experiences shares no
 * places, so there is nothing to suggest and nothing to rank.
 */
usersRouter.get('/suggestions', async (req, res) => {
  const viewerId = req.userId!;
  const q = parse(suggestionsQuerySchema, req.query);

  const rows = rowsOf<{
    id: string;
    name: string;
    avatar_path: string | null;
    bio: string | null;
    rel_type: RelationshipType;
    shared_count: number;
    shared_names: string[];
  }>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)},
      viewer_shared AS (
        SELECT e2.user_id AS user_id, e2.place_id
        FROM experiences e2
        JOIN experiences e1 ON e1.place_id = e2.place_id AND e1.user_id = ${viewerId}
        WHERE e2.user_id <> ${viewerId}
          AND ${visibilityConditionWith(viewerId, sql`e2.user_id`, sql`e2.visibility`)}
        GROUP BY e2.user_id, e2.place_id
      )
      SELECT u.id, u.name, u.avatar_path, u.bio,
        ${relationshipCase(viewerId, sql`u.id`)} AS rel_type,
        (SELECT count(*)::int FROM viewer_shared vs WHERE vs.user_id = u.id) AS shared_count,
        COALESCE((
          SELECT array_agg(p.name ORDER BY p.name)
          FROM (
            SELECT place_id FROM viewer_shared
            WHERE user_id = u.id
            ORDER BY place_id
            LIMIT 3
          ) t
          JOIN places p ON p.id = t.place_id
        ), '{}') AS shared_names
      FROM users u
      WHERE u.id <> ${viewerId}
        AND EXISTS (SELECT 1 FROM viewer_shared vs WHERE vs.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM viewer_blocked vb WHERE vb.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM viewer_direct vd WHERE vd.friend_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM friendships f
          WHERE f.status = 'pending'
            AND ((f.requester_id = ${viewerId} AND f.addressee_id = u.id)
              OR (f.addressee_id = ${viewerId} AND f.requester_id = u.id))
        )
      ORDER BY shared_count DESC, u.name ASC
      LIMIT ${q.limit}
    `)
  );

  res.json({
    data: rows.map((r) => ({
      user: { id: r.id, name: r.name, avatarPath: r.avatar_path, bio: r.bio },
      relationship: relationshipObject(r.rel_type),
      sharedPlaceCount: Number(r.shared_count),
      sharedPlaces: r.shared_names ?? [],
    })),
  });
});

/** Public profile with relationship + counts (viewer-aware). */
usersRouter.get('/:id', async (req, res) => {
  const viewerId = req.userId!;
  const targetId = parse(idParam, req.params.id);

  if (targetId === viewerId) {
    const [me] = await db.select().from(users).where(eq(users.id, viewerId)).limit(1);
    if (!me) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    const counts = await profileCounts(viewerId, targetId);
    res.json({
      data: { user: selfUser(me), relationship: relationshipObject('self'), counts },
    });
    return;
  }

  if (await blockEdgeExists(viewerId, targetId)) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

  const [relType, counts] = await Promise.all([
    relationshipBetween(viewerId, targetId),
    profileCounts(viewerId, targetId),
  ]);

  res.json({
    data: {
      user: {
        id: target.id,
        name: target.name,
        avatarPath: target.avatarPath,
        bio: target.bio,
        createdAt: target.createdAt.toISOString(),
      },
      relationship: relationshipObject(relType),
      counts,
    },
  });
});

/** Relationship-aware experience list for a user's profile. */
usersRouter.get('/:id/experiences', async (req, res) => {
  const viewerId = req.userId!;
  const targetId = parse(idParam, req.params.id);
  const listQuery = parse(listQuerySchema, req.query);

  if (viewerId !== targetId && (await blockEdgeExists(viewerId, targetId))) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

  const rows = rowsOf<ExperienceCardRow>(
    await db.execute(sql`
      ${experienceListBase(viewerId)}
      AND e.user_id = ${targetId}
      GROUP BY e.id, p.id, u.id
      ORDER BY e.created_at DESC
      LIMIT ${listQuery.limit} OFFSET ${listQuery.offset}
    `)
  );

  res.json({
    data: rows.map(toExperienceCard),
    meta: { limit: listQuery.limit, offset: listQuery.offset },
  });
});

async function profileCounts(
  viewerId: string,
  targetId: string
): Promise<{ experiences: number; friends: number }> {
  const expRes = rowsOf<{ n: number }>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)}
      SELECT count(*)::int AS n
      FROM experiences e
      WHERE e.user_id = ${targetId}
        AND ${visibilityCondition(viewerId, sql`e.user_id`)}
    `)
  );
  const friendRes = rowsOf<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n
      FROM friendships f
      WHERE f.status = 'accepted'
        AND (f.requester_id = ${targetId} OR f.addressee_id = ${targetId})
    `)
  );
  return { experiences: expRes[0]?.n ?? 0, friends: friendRes[0]?.n ?? 0 };
}
