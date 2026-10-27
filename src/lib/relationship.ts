import { sql } from 'drizzle-orm';

/**
 * SQL building blocks for the relationship-aware visibility system.
 *
 * Every read query over user-authored content must start with:
 *   WITH ${viewerCte(viewerId)}
 * and then use visibilityCondition() in WHERE and relationshipCase() for labels.
 *
 * Relationship levels (per viewer — never stored):
 *   self            → the viewer authored the content
 *   direct_friend   → accepted friendship (Your Circle)
 *   friend_of_friend→ a mutual accepted friendship (Extended Circle)
 *   none            → no connection (Community)
 *
 * Visibility rules:
 *   circle    → author or direct friends
 *   extended  → author, direct friends, or friends-of-friends
 *   community → everyone
 * Blocked pairs never see each other's content, at any level.
 */

export type RelationshipType = 'self' | 'direct_friend' | 'friend_of_friend' | 'none';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  self: 'You',
  direct_friend: 'Your Circle',
  friend_of_friend: 'Extended Circle',
  none: 'Community',
};

export const VISIBILITY_LEVELS = ['circle', 'extended', 'community'] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/** Map explore layers query param (circle,extended,community,self) to relationship types. */
export function layersToRelationshipTypes(layers: string[] | undefined): RelationshipType[] {
  if (!layers || layers.length === 0) return ['self', 'direct_friend', 'friend_of_friend', 'none'];
  const types = new Set<RelationshipType>();
  for (const layer of layers) {
    if (layer === 'self') types.add('self');
    else if (layer === 'circle') types.add('direct_friend');
    else if (layer === 'extended') types.add('friend_of_friend');
    else if (layer === 'community') types.add('none');
  }
  return types.size > 0 ? [...types] : ['self', 'direct_friend', 'friend_of_friend', 'none'];
}

export function relationshipObject(type: RelationshipType): { type: RelationshipType; label: string } {
  return { type, label: RELATIONSHIP_LABELS[type] };
}

/** CTEs every relationship/visibility query needs as its `WITH` prefix. */
export function viewerCte(viewerId: string) {
  return sql`
    viewer_direct AS (
      SELECT CASE WHEN requester_id = ${viewerId} THEN addressee_id ELSE requester_id END AS friend_id
      FROM friendships
      WHERE status = 'accepted'
        AND (requester_id = ${viewerId} OR addressee_id = ${viewerId})
    ),
    viewer_blocked AS (
      SELECT addressee_id AS user_id FROM friendships
        WHERE requester_id = ${viewerId} AND status = 'blocked'
      UNION
      SELECT requester_id AS user_id FROM friendships
        WHERE addressee_id = ${viewerId} AND status = 'blocked'
    )
  `;
}

/** CASE expression classifying `authorCol` relative to the viewer. Must be used with viewerCte(). */
export function relationshipCase(viewerId: string, authorCol: ReturnType<typeof sql>) {
  return sql`CASE
    WHEN ${authorCol} = ${viewerId} THEN 'self'
    WHEN EXISTS (SELECT 1 FROM viewer_direct vd WHERE vd.friend_id = ${authorCol}) THEN 'direct_friend'
    WHEN EXISTS (
      SELECT 1 FROM viewer_direct vd
      JOIN friendships f2 ON f2.status = 'accepted'
        AND ((f2.requester_id = vd.friend_id AND f2.addressee_id = ${authorCol})
          OR (f2.addressee_id = vd.friend_id AND f2.requester_id = ${authorCol}))
    ) THEN 'friend_of_friend'
    ELSE 'none'
  END`;
}

/** WHERE fragment: viewer may see `authorCol`'s content. Must be used with viewerCte(). */
export function visibilityCondition(viewerId: string, authorCol: ReturnType<typeof sql>) {
  return visibilityConditionWith(viewerId, authorCol, sql`e.visibility`);
}

/** Visibility condition where the visibility column is given explicitly (for aggregates etc.). */
export function visibilityConditionWith(
  viewerId: string,
  authorCol: ReturnType<typeof sql>,
  visibilityCol: ReturnType<typeof sql>
) {
  return sql`(
    NOT EXISTS (SELECT 1 FROM viewer_blocked vb WHERE vb.user_id = ${authorCol})
    AND (
      ${authorCol} = ${viewerId}
      OR ${visibilityCol} = 'community'
      OR (${visibilityCol} IN ('circle', 'extended')
          AND EXISTS (SELECT 1 FROM viewer_direct vd WHERE vd.friend_id = ${authorCol}))
      OR (${visibilityCol} = 'extended'
          AND EXISTS (
            SELECT 1 FROM viewer_direct vd
            JOIN friendships f2 ON f2.status = 'accepted'
              AND ((f2.requester_id = vd.friend_id AND f2.addressee_id = ${authorCol})
                OR (f2.addressee_id = vd.friend_id AND f2.requester_id = ${authorCol}))
          ))
    )
  )`;
}
