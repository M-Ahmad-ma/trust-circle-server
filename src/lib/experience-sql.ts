import { sql } from 'drizzle-orm';
import { relationshipCase, viewerCte, visibilityCondition } from './relationship';

/**
 * Shared SELECT fragment for relationship-annotated experience cards.
 * Joins expected: experiences e, places p, users u, photos ph (LEFT).
 * Caller must provide `WITH ${viewerCte(viewerId)}` and GROUP BY e.id, p.id, u.id.
 */
export function experienceCardSelect(viewerId: string) {
  return sql`
    e.id,
    e.rating,
    e.review_text,
    to_char(e.visited_at, 'YYYY-MM-DD') AS visited_at,
    e.created_at,
    ${relationshipCase(viewerId, sql`e.user_id`)} AS rel_type,
    p.id AS place_id,
    p.name AS place_name,
    p.category,
    p.address,
    p.city,
    ST_X(p.location::geometry) AS lng,
    ST_Y(p.location::geometry) AS lat,
    u.id AS reviewer_id,
    u.name AS reviewer_name,
    u.avatar_path AS reviewer_avatar,
    COALESCE(
      json_agg(
        json_build_object('id', ph.id, 'url', ph.path, 'position', ph.position) ORDER BY ph.position
      ) FILTER (WHERE ph.id IS NOT NULL),
      '[]'::json
    ) AS photos
  `;
}

/** WHERE + JOIN skeleton shared by user/place experience lists. */
export function experienceListBase(viewerId: string) {
  return sql`
    WITH ${viewerCte(viewerId)}
    SELECT ${experienceCardSelect(viewerId)}
    FROM experiences e
    JOIN places p ON p.id = e.place_id
    JOIN users u ON u.id = e.user_id
    LEFT JOIN photos ph ON ph.experience_id = e.id
    WHERE ${visibilityCondition(viewerId, sql`e.user_id`)}
  `;
}
