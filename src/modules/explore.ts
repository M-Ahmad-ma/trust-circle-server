import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, rowsOf } from '../db/client';
import { parse } from '../middleware/validate';
import { geoQuerySchema } from '../lib/geo';
import {
  layersToRelationshipTypes,
  relationshipCase,
  relationshipObject,
  viewerCte,
  visibilityCondition,
  type RelationshipType,
} from '../lib/relationship';
import { toExperienceCard, type ExperienceCardRow } from '../lib/serialize';

export const exploreRouter = Router();

const exploreQuerySchema = geoQuerySchema.extend({
  /** comma-separated: self,circle,extended,community — default: all */
  layers: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseLayers(raw: string | undefined) {
  const layers = raw
    ?.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return layersToRelationshipTypes(layers);
}

/** GET /api/explore/nearby?lat&lng&radius&layers — the core discovery pipeline:
 *  geo → experiences → visibility filter → relationship annotation */
exploreRouter.get('/nearby', async (req, res) => {
  const viewerId = req.userId!;
  const q = parse(exploreQuerySchema, req.query);
  const types = parseLayers(q.layers);

  const typeFilter = sql`rel_type IN (${sql.join(
    types.map((t) => sql`${t}`),
    sql`, `
  )})`;

  const rows = rowsOf<ExperienceCardRow>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)},
      nearby AS (
        SELECT p.id, p.name, p.category, p.address, p.city, p.location,
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography) AS distance_m
        FROM places p
        WHERE ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography, ${q.radius})
      )
      SELECT * FROM (
        SELECT e.id, e.rating, e.review_text,
          to_char(e.visited_at, 'YYYY-MM-DD') AS visited_at,
          e.created_at,
          ${relationshipCase(viewerId, sql`e.user_id`)} AS rel_type,
          n.id AS place_id, n.name AS place_name, n.category, n.address, n.city,
          ST_X(n.location::geometry) AS lng,
          ST_Y(n.location::geometry) AS lat,
          n.distance_m,
          u.id AS reviewer_id, u.name AS reviewer_name, u.avatar_path AS reviewer_avatar,
          COALESCE(
            json_agg(
              json_build_object('id', ph.id, 'url', ph.path, 'position', ph.position) ORDER BY ph.position
            ) FILTER (WHERE ph.id IS NOT NULL),
            '[]'::json
          ) AS photos
        FROM nearby n
        JOIN experiences e ON e.place_id = n.id
        JOIN users u ON u.id = e.user_id
        LEFT JOIN photos ph ON ph.experience_id = e.id
        WHERE ${visibilityCondition(viewerId, sql`e.user_id`)}
        GROUP BY e.id, u.id, n.id, n.name, n.category, n.address, n.city, n.location, n.distance_m
      ) r
      WHERE ${typeFilter}
      ORDER BY r.distance_m ASC, r.created_at DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
    `)
  );

  const totalRes = rowsOf<{ n: number }>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)},
      nearby AS (
        SELECT p.id, p.location
        FROM places p
        WHERE ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography, ${q.radius})
      )
      SELECT count(*)::int AS n FROM (
        SELECT ${relationshipCase(viewerId, sql`e.user_id`)} AS rel_type
        FROM nearby n
        JOIN experiences e ON e.place_id = n.id
        WHERE ${visibilityCondition(viewerId, sql`e.user_id`)}
      ) r
      WHERE ${typeFilter}
    `)
  );

  res.json({
    data: rows.map(toExperienceCard),
    meta: {
      total: totalRes[0]?.n ?? rows.length,
      limit: q.limit,
      offset: q.offset,
      center: { lat: q.lat, lng: q.lng },
      radiusM: q.radius,
      layers: types.map((t: RelationshipType) => relationshipObject(t).label),
    },
  });
});
