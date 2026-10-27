import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, rowsOf } from '../db/client';
import { experiences, places } from '../db/schema';
import { env } from '../config/env';
import { ApiError } from '../middleware/auth';
import { parse } from '../middleware/validate';
import { relationshipCase, viewerCte, type RelationshipType } from '../lib/relationship';
import { toExperienceCard, type ExperienceCardRow } from '../lib/serialize';

export const experiencesRouter = Router();

const idParam = z.string().uuid();
const uuidSchema = z.string().uuid();

const createSchema = z.object({
  placeId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().min(1).max(2000),
  visitedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'visitedAt must be YYYY-MM-DD'),
  visibility: z.enum(['circle', 'extended', 'community']),
  photoIds: z.array(uuidSchema).max(10).optional(),
});

const updateSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    reviewText: z.string().trim().min(1).max(2000).optional(),
    visitedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    visibility: z.enum(['circle', 'extended', 'community']).optional(),
    photoIds: z.array(uuidSchema).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

interface DetailRow extends ExperienceCardRow {
  visibility: 'circle' | 'extended' | 'community';
  updated_at: Date | string;
  is_blocked: boolean;
}

function canView(relType: RelationshipType, visibility: string, isBlocked: boolean): boolean {
  if (relType === 'self') return true;
  if (isBlocked) return false;
  if (relType === 'direct_friend') return true;
  if (relType === 'friend_of_friend') return visibility !== 'circle';
  return visibility === 'community';
}

async function fetchDetail(viewerId: string, experienceId: string): Promise<DetailRow | undefined> {
  const rows = rowsOf<DetailRow>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)}
      SELECT e.id, e.rating, e.review_text,
        to_char(e.visited_at, 'YYYY-MM-DD') AS visited_at,
        e.visibility, e.created_at, e.updated_at,
        ${relationshipCase(viewerId, sql`e.user_id`)} AS rel_type,
        EXISTS (SELECT 1 FROM viewer_blocked vb WHERE vb.user_id = e.user_id) AS is_blocked,
        p.id AS place_id, p.name AS place_name, p.category, p.address, p.city,
        ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
        u.id AS reviewer_id, u.name AS reviewer_name, u.avatar_path AS reviewer_avatar,
        COALESCE(
          json_agg(
            json_build_object('id', ph.id, 'url', ph.path, 'position', ph.position) ORDER BY ph.position
          ) FILTER (WHERE ph.id IS NOT NULL),
          '[]'::json
        ) AS photos
      FROM experiences e
      JOIN places p ON p.id = e.place_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN photos ph ON ph.experience_id = e.id
      WHERE e.id = ${experienceId}
      GROUP BY e.id, p.id, u.id
    `)
  );
  return rows[0];
}

function toDetail(row: DetailRow) {
  const card = toExperienceCard(row);
  return {
    ...card,
    visibility: row.visibility,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function assertPhotosOwned(userId: string, photoIds: string[], experienceId?: string): Promise<void> {
  if (photoIds.length === 0) return;
  const rows = rowsOf<{ id: string; experience_id: string | null }>(
    await db.execute(sql`
      SELECT id, experience_id FROM photos
      WHERE id IN (${sql.join(photoIds.map((id) => sql`${id}`), sql`, `)})
        AND owner_id = ${userId}
    `)
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = photoIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError(400, 'INVALID_PHOTOS', 'Some photoIds are invalid or not owned by you', { photoIds: missing });
  }
  const wrongExperience = rows.filter(
    (r) => r.experience_id !== null && r.experience_id !== experienceId
  );
  if (wrongExperience.length > 0) {
    throw new ApiError(400, 'PHOTOS_ATTACHED', 'Some photos are attached to another experience', {
      photoIds: wrongExperience.map((r) => r.id),
    });
  }
}

async function setExperiencePhotos(experienceId: string, photoIds: string[]): Promise<void> {
  // detach photos no longer in the list (they stay owned & reusable)
  if (photoIds.length > 0) {
    await db.execute(sql`
      UPDATE photos SET experience_id = NULL
      WHERE experience_id = ${experienceId}
        AND id NOT IN (${sql.join(photoIds.map((id) => sql`${id}`), sql`, `)})
    `);
  } else {
    await db.execute(sql`UPDATE photos SET experience_id = NULL WHERE experience_id = ${experienceId}`);
  }
  // attach + order
  for (const [index, photoId] of photoIds.entries()) {
    await db.execute(sql`
      UPDATE photos SET experience_id = ${experienceId}, position = ${index}
      WHERE id = ${photoId}
    `);
  }
}

function assertVisitedAt(visitedAt: string): void {
  const date = new Date(visitedAt + 'T00:00:00Z');
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'INVALID_VISITED_AT', 'visitedAt must be a valid date');
  }
  if (date.getTime() > todayUtc.getTime()) {
    throw new ApiError(400, 'VISITED_AT_FUTURE', 'visitedAt cannot be in the future');
  }
}

/** POST /api/experiences */
experiencesRouter.post('/', async (req, res) => {
  const viewerId = req.userId!;
  const body = parse(createSchema, req.body);
  assertVisitedAt(body.visitedAt);

  const [placeRow] = await db.select({ id: places.id }).from(places).where(eq(places.id, body.placeId)).limit(1);
  if (!placeRow) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found');

  const photoIds = body.photoIds ?? [];
  await assertPhotosOwned(viewerId, photoIds);

  const [created] = await db
    .insert(experiences)
    .values({
      userId: viewerId,
      placeId: body.placeId,
      rating: body.rating,
      reviewText: body.reviewText,
      visitedAt: body.visitedAt,
      visibility: body.visibility,
    })
    .returning();

  if (photoIds.length > 0) {
    await setExperiencePhotos(created.id, photoIds);
  }

  const detail = await fetchDetail(viewerId, created.id);
  res.status(201).json({ data: detail ? toDetail(detail) : { id: created.id } });
});

/** GET /api/experiences/:id — 404 if missing, 403 if not visible to viewer */
experiencesRouter.get('/:id', async (req, res) => {
  const viewerId = req.userId!;
  const experienceId = parse(idParam, req.params.id);

  const detail = await fetchDetail(viewerId, experienceId);
  if (!detail) throw new ApiError(404, 'EXPERIENCE_NOT_FOUND', 'Experience not found');

  if (!canView(detail.rel_type, detail.visibility, detail.is_blocked)) {
    throw new ApiError(403, 'NOT_VISIBLE', 'You do not have permission to view this experience');
  }

  res.json({ data: toDetail(detail) });
});

/** PATCH /api/experiences/:id — owner only */
experiencesRouter.patch('/:id', async (req, res) => {
  const viewerId = req.userId!;
  const experienceId = parse(idParam, req.params.id);
  const body = parse(updateSchema, req.body);

  const [existing] = await db
    .select({ id: experiences.id, userId: experiences.userId })
    .from(experiences)
    .where(eq(experiences.id, experienceId))
    .limit(1);
  if (!existing) throw new ApiError(404, 'EXPERIENCE_NOT_FOUND', 'Experience not found');
  if (existing.userId !== viewerId) {
    throw new ApiError(403, 'NOT_OWNER', 'You can only edit your own experiences');
  }

  if (body.visitedAt !== undefined) assertVisitedAt(body.visitedAt);
  if (body.photoIds !== undefined) await assertPhotosOwned(viewerId, body.photoIds, experienceId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.rating !== undefined) updates.rating = body.rating;
  if (body.reviewText !== undefined) updates.reviewText = body.reviewText;
  if (body.visitedAt !== undefined) updates.visitedAt = body.visitedAt;
  if (body.visibility !== undefined) updates.visibility = body.visibility;

  await db.update(experiences).set(updates).where(eq(experiences.id, experienceId));

  if (body.photoIds !== undefined) {
    await setExperiencePhotos(experienceId, body.photoIds);
  }

  const detail = await fetchDetail(viewerId, experienceId);
  res.json({ data: detail ? toDetail(detail) : null });
});

/** DELETE /api/experiences/:id — owner only; removes photos from disk too */
experiencesRouter.delete('/:id', async (req, res) => {
  const viewerId = req.userId!;
  const experienceId = parse(idParam, req.params.id);

  const [existing] = await db
    .select({ id: experiences.id, userId: experiences.userId })
    .from(experiences)
    .where(eq(experiences.id, experienceId))
    .limit(1);
  if (!existing) throw new ApiError(404, 'EXPERIENCE_NOT_FOUND', 'Experience not found');
  if (existing.userId !== viewerId) {
    throw new ApiError(403, 'NOT_OWNER', 'You can only delete your own experiences');
  }

  const photoRows = rowsOf<{ path: string }>(
    await db.execute(sql`SELECT path FROM photos WHERE experience_id = ${experienceId}`)
  );

  await db.delete(experiences).where(eq(experiences.id, experienceId));

  for (const row of photoRows) {
    try {
      fs.unlinkSync(path.join(path.resolve(env.UPLOAD_DIR), path.basename(row.path)));
    } catch {
      // file may already be gone — ignore
    }
  }

  res.json({ data: { ok: true } });
});
