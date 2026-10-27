import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, rowsOf } from '../db/client';
import { places } from '../db/schema';
import { ApiError } from '../middleware/auth';
import { parse } from '../middleware/validate';
import { geoQuerySchema, latSchema, lngSchema, listQuerySchema } from '../lib/geo';
import { normalizePlaceName } from '../lib/normalize';
import { viewerCte, visibilityConditionWith } from '../lib/relationship';
import { experienceListBase } from '../lib/experience-sql';
import { toExperienceCard, type ExperienceCardRow } from '../lib/serialize';

export const placesRouter = Router();

const idParam = z.string().uuid();

const searchQuerySchema = listQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
  radius: z.coerce.number().min(10).max(50_000).default(5_000),
  category: z.string().trim().max(60).optional(),
});

const nearbyQuerySchema = geoQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createPlaceSchema = z.object({
  name: z.string().trim().min(1).max(140),
  category: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  lat: latSchema,
  lng: lngSchema,
});

/**
 * Duplicate detection: the same name, close enough to be the same place.
 *
 * Two places are the same place when their names are close and they are in the
 * same city. Distance alone was the wrong frame: Peshawar runs about 25 km from
 * Hayatabad out past the ring road, so a neighbourhood radius missed the same
 * venue recorded from the other side of town, while a radius wide enough to
 * cover the city reached into Nowshera and Charsadda.
 *
 * So the city is the range. When both the new place and a candidate name a city
 * and those names agree — fuzzily, because "peshawer" is a typo people make —
 * the candidate is considered anywhere within 50 km. That is the guard rail,
 * not the rule: it stops a mismatched city label from merging a place across
 * the country. Without a city on either side, fall back to 30 km, which is
 * still city-sized; it just cannot reach the far edge from every corner.
 *
 * The name test is strict so the city-wide range can be generous. Trigram
 * similarity has to clear what genuine near-matches clear — "Saidu Sharif"
 * against "Sadu Sharif" is 0.64, a typo — without dragging in pairs that are
 * plainly different places. Measured on the seeded data, "Peshawar Museum"
 * against "Peshawar Zoo" is 0.45, and "University of Peshawar" against
 * "Peshawar University of Engineering" is 0.57, so both stay apart. The pair
 * that merges is the one that should: "Khyber resturant" against
 * "Khyber Restaurant", 2.7 km apart at 0.75.
 */
const DUPLICATE_RADIUS_M = 30_000;
const DUPLICATE_CITY_RADIUS_M = 50_000;
const DUPLICATE_NAME_SIMILARITY = 0.6;
/** "peshawer" against "Peshawar" scores 0.50; different cities score near 0. */
const DUPLICATE_CITY_SIMILARITY = 0.4;

const updatePlaceSchema = z
  .object({
    name: z.string().trim().min(1).max(140).optional(),
    category: z.string().trim().max(60).nullable().optional(),
    address: z.string().trim().max(240).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
  // A move has to move the whole point; half a coordinate is not a location.
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'lat and lng must be sent together',
  });

interface PlaceRow {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  lat: number | string;
  lng: number | string;
  distance_m?: number | string | null;
  experience_count?: number;
  avg_rating?: number | string | null;
  cover_path?: string | null;
  /** Detail only — whether this viewer may PATCH the place. */
  can_edit?: boolean;
}

/**
 * `canEdit` is a capability, not a `createdBy` id: a place's author is not
 * something every reader needs to be told, and the client only needs to know
 * whether to offer the edit affordance. `created_by` is nullable
 * (`ON DELETE SET NULL`), so a place whose author deleted their account belongs
 * to nobody — COALESCE turns the resulting NULL into an honest `false`.
 */
function serializePlace(row: PlaceRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    address: row.address,
    city: row.city,
    lat: Number(row.lat),
    lng: Number(row.lng),
    ...(row.distance_m !== undefined && row.distance_m !== null ? { distanceM: Number(row.distance_m) } : {}),
    ...(row.experience_count !== undefined ? { experienceCount: Number(row.experience_count) } : {}),
    ...(row.avg_rating !== undefined && row.avg_rating !== null
      ? { avgRating: Number(row.avg_rating) }
      : { avgRating: null }),
    coverPhoto: row.cover_path ?? null,
    ...(row.can_edit !== undefined ? { canEdit: row.can_edit } : {}),
  };
}

function point(lng: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

/**
 * Cover image for a place: its own photo, added with the place or to it later.
 * That is the place's identity rather than anybody's experience of it, and it
 * is stable — it does not change every time somebody writes about the place.
 *
 * There is deliberately no fallback to experience photos. A reviewer's photo
 * belongs to their experience, not to the place; borrowing it made the cover
 * change with whoever posted last and handed the place a face its creator never
 * chose. A place with no photo of its own simply has no cover, and the UI
 * renders its monogram or category mark instead.
 *
 * Requires the place to be aliased `p`. Emits `pcov.path`.
 */
function coverPhotoLateral() {
  return sql`
    LEFT JOIN LATERAL (
      SELECT ph.path
      FROM photos ph
      WHERE ph.place_id = p.id
      ORDER BY ph.position ASC, ph.created_at ASC
      LIMIT 1
    ) pcov ON TRUE`;
}

/** Shared search implementation for /search and /nearby. */
async function searchPlaces(viewerId: string, opts: z.infer<typeof searchQuerySchema> & { lat?: number; lng?: number; radius: number }) {
  const { q, lat, lng, radius, category, limit, offset } = opts;
  const hasGeo = lat !== undefined && lng !== undefined;
  const normalizedQ = q ? normalizePlaceName(q) : null;

  const conditions = [sql`TRUE`];
  if (normalizedQ) {
    conditions.push(sql`(p.normalized_name ILIKE ${'%' + normalizedQ + '%'} OR similarity(p.normalized_name, ${normalizedQ}) > 0.15)`);
  }
  if (category) {
    conditions.push(sql`p.category = ${category}`);
  }
  if (hasGeo) {
    conditions.push(sql`ST_DWithin(p.location, ${point(lng!, lat!)}, ${radius})`);
  }

  const distanceSelect = hasGeo
    ? sql`, ST_Distance(p.location, ${point(lng!, lat!)}) AS distance_m`
    : sql``;
  const geoOrder = hasGeo ? sql`distance_m ASC,` : sql``;
  const nameOrder = normalizedQ ? sql`similarity(p.normalized_name, ${normalizedQ}) DESC,` : sql``;

  const rows = rowsOf<PlaceRow>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)}
      SELECT p.id, p.name, p.category, p.address, p.city,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        pcov.path AS cover_path
        ${distanceSelect},
        (
          SELECT count(*)::int FROM experiences e
          WHERE e.place_id = p.id
            AND ${visibilityConditionWith(viewerId, sql`e.user_id`, sql`e.visibility`)}
        ) AS experience_count,
        (
          SELECT round(avg(e.rating), 1) FROM experiences e
          WHERE e.place_id = p.id
            AND ${visibilityConditionWith(viewerId, sql`e.user_id`, sql`e.visibility`)}
        ) AS avg_rating
      FROM places p
      ${coverPhotoLateral()}
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY ${geoOrder} ${nameOrder} p.name
      LIMIT ${limit} OFFSET ${offset}
    `)
  );

  const totalRes = rowsOf<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM places p
      WHERE ${sql.join(conditions, sql` AND `)}
    `)
  );

  return { rows, total: totalRes[0]?.n ?? rows.length };
}

/** GET /api/places/search */
placesRouter.get('/search', async (req, res) => {
  const viewerId = req.userId!;
  const q = parse(searchQuerySchema, req.query);
  if ((q.lat === undefined) !== (q.lng === undefined)) {
    throw new ApiError(400, 'INVALID_GEO', 'lat and lng must be provided together');
  }
  const { rows, total } = await searchPlaces(viewerId, { ...q, radius: q.radius });
  res.json({ data: rows.map(serializePlace), meta: { total, limit: q.limit, offset: q.offset } });
});

/** GET /api/places/nearby — geo required */
placesRouter.get('/nearby', async (req, res) => {
  const viewerId = req.userId!;
  const q = parse(nearbyQuerySchema, req.query);
  const { rows, total } = await searchPlaces(viewerId, q);
  res.json({ data: rows.map(serializePlace), meta: { total, limit: q.limit, offset: q.offset } });
});

/** GET /api/places/:id — detail with viewer-aware aggregates */
placesRouter.get('/:id', async (req, res) => {
  const viewerId = req.userId!;
  const placeId = parse(idParam, req.params.id);

  const rows = rowsOf<PlaceRow>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)}
      SELECT p.id, p.name, p.category, p.address, p.city,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        pcov.path AS cover_path,
        (
          SELECT count(*)::int FROM experiences e
          WHERE e.place_id = p.id
            AND ${visibilityConditionWith(viewerId, sql`e.user_id`, sql`e.visibility`)}
        ) AS experience_count,
        (
          SELECT round(avg(e.rating), 1) FROM experiences e
          WHERE e.place_id = p.id
            AND ${visibilityConditionWith(viewerId, sql`e.user_id`, sql`e.visibility`)}
        ) AS avg_rating,
        COALESCE(p.created_by = ${viewerId}, false) AS can_edit
      FROM places p
      ${coverPhotoLateral()}
      WHERE p.id = ${placeId}
    `)
  );

  if (rows.length === 0) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found');
  res.json({ data: serializePlace(rows[0]) });
});

/** GET /api/places/:id/experiences — relationship-annotated list */
placesRouter.get('/:id/experiences', async (req, res) => {
  const viewerId = req.userId!;
  const placeId = parse(idParam, req.params.id);
  const listQuery = parse(listQuerySchema, req.query);

  const [placeRow] = await db.select({ id: places.id }).from(places).where(eq(places.id, placeId)).limit(1);
  if (!placeRow) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found');

  const rows = rowsOf<ExperienceCardRow>(
    await db.execute(sql`
      ${experienceListBase(viewerId)}
      AND e.place_id = ${placeId}
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

/** POST /api/places — dedup-aware create (returns existing place on match) */
placesRouter.post('/', async (req, res) => {
  const viewerId = req.userId!;
  const body = parse(createPlaceSchema, req.body);
  const normalized = normalizePlaceName(body.name);
  // Compared case- and whitespace-insensitively; the trigram test below absorbs
  // spelling drift such as "peshawer".
  const city = (body.city ?? '').trim().toLowerCase();

  if (!normalized) {
    throw new ApiError(400, 'INVALID_NAME', 'Place name must contain letters or numbers');
  }

  const newPoint = point(body.lng, body.lat);

  const duplicates = rowsOf<PlaceRow & { sim: number }>(
    await db.execute(sql`
      SELECT p.id, p.name, p.category, p.address, p.city,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        pcov.path AS cover_path,
        similarity(p.normalized_name, ${normalized}) AS sim
      FROM places p
      ${coverPhotoLateral()}
      WHERE similarity(p.normalized_name, ${normalized}) > ${DUPLICATE_NAME_SIMILARITY}
        AND (
          ST_DWithin(p.location, ${newPoint}, ${DUPLICATE_RADIUS_M})
          OR (
            ${city} <> ''
            AND similarity(lower(btrim(coalesce(p.city, ''))), ${city}) > ${DUPLICATE_CITY_SIMILARITY}
            AND ST_DWithin(p.location, ${newPoint}, ${DUPLICATE_CITY_RADIUS_M})
          )
        )
      ORDER BY sim DESC
      LIMIT 1
    `)
  );

  if (duplicates.length > 0) {
    res.status(200).json({ data: serializePlace(duplicates[0]), meta: { created: false } });
    return;
  }

  const inserted = rowsOf<PlaceRow>(
    await db.execute(sql`
      INSERT INTO places (name, normalized_name, category, address, city, location, created_by)
      VALUES (
        ${body.name}, ${normalized},
        ${body.category ?? null}, ${body.address ?? null}, ${body.city ?? null},
        ${point(body.lng, body.lat)}, ${viewerId}
      )
      RETURNING id, name, category, address, city,
        ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
    `)
  );

  res.status(201).json({ data: serializePlace(inserted[0]), meta: { created: true } });
});

/**
 * PATCH /api/places/:id — creator-only correction of a place's facts.
 *
 * Restricted to `created_by`. A place is shared and anyone may add one (the POST
 * above is open), but rewriting a venue someone else entered is not a
 * correction — on a graph whose whole premise is trust, letting any stranger
 * rename a place is vandalism. The creator is the only person with standing to
 * say what a place is called. A place whose creator deleted their account has a
 * NULL `created_by` and is therefore editable by nobody, which is the safe
 * reading: it is left wrong rather than handed to whoever asks.
 *
 * Experiences are never touched — this changes where a place is and what it is
 * called, not what anyone said about it.
 */
placesRouter.patch('/:id', async (req, res) => {
  const viewerId = req.userId!;
  const placeId = parse(idParam, req.params.id);
  const body = parse(updatePlaceSchema, req.body);

  const normalized = body.name === undefined ? undefined : normalizePlaceName(body.name);
  if (body.name !== undefined && !normalized) {
    throw new ApiError(400, 'INVALID_NAME', 'Place name must contain letters or numbers');
  }

  // Ownership is checked before anything is written, and existence is folded into
  // the same lookup: a non-creator and a missing place must not be distinguishable
  // by response alone beyond what the status says.
  const [existing] = await db
    .select({ createdBy: places.createdBy })
    .from(places)
    .where(eq(places.id, placeId))
    .limit(1);
  if (!existing) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found');
  if (existing.createdBy !== viewerId) {
    throw new ApiError(403, 'NOT_PLACE_OWNER', 'Only the person who added this place can edit it');
  }

  await db.execute(sql`
    UPDATE places SET
      name = COALESCE(${body.name ?? null}, name),
      normalized_name = COALESCE(${normalized ?? null}, normalized_name),
      category = ${body.category === undefined ? null : body.category},
      address = ${body.address === undefined ? null : body.address},
      city = ${body.city === undefined ? null : body.city},
      location = COALESCE(
        ${body.lat === undefined || body.lng === undefined
      ? null
      : point(body.lng, body.lat)},
        location
      )
    WHERE id = ${placeId}
  `);

  // Re-read through the same viewer-aware projection as GET so the response
  // carries the same cover and counts the caller would have got by refetching.
  const rows = rowsOf<PlaceRow>(
    await db.execute(sql`
      WITH ${viewerCte(viewerId)}
      SELECT p.id, p.name, p.category, p.address, p.city,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        pcov.path AS cover_path,
        (
          SELECT count(*)::int FROM experiences e
          WHERE e.place_id = p.id
            AND ${visibilityConditionWith(viewerId, sql`e.user_id`, sql`e.visibility`)}
        ) AS experience_count,
        (
          SELECT round(avg(e.rating), 1) FROM experiences e
          WHERE e.place_id = p.id
            AND ${visibilityConditionWith(viewerId, sql`e.user_id`, sql`e.visibility`)}
        ) AS avg_rating,
        COALESCE(p.created_by = ${viewerId}, false) AS can_edit
      FROM places p
      ${coverPhotoLateral()}
      WHERE p.id = ${placeId}
    `)
  );

  res.json({ data: serializePlace(rows[0]) });
});
