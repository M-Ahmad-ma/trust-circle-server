import { sql } from 'drizzle-orm';
import { db, rowsOf } from '../db/client';
import { relationshipCase, viewerCte, type RelationshipType } from './relationship';

/** True if a block edge exists between two users (in either direction). */
export async function blockEdgeExists(a: string, b: string): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT 1 AS x FROM friendships
    WHERE status = 'blocked'
      AND ((requester_id = ${a} AND addressee_id = ${b})
        OR (requester_id = ${b} AND addressee_id = ${a}))
    LIMIT 1
  `);
  return rowsOf(res).length > 0;
}

/** Compute the relationship of `viewerId` to `otherId` (per-viewer, never stored). */
export async function relationshipBetween(viewerId: string, otherId: string): Promise<RelationshipType> {
  if (viewerId === otherId) return 'self';
  const res = await db.execute(sql`
    WITH ${viewerCte(viewerId)}
    SELECT ${relationshipCase(viewerId, sql`${otherId}`)} AS type
  `);
  const rows = rowsOf<{ type: RelationshipType }>(res);
  return rows[0]?.type ?? 'none';
}

/** Accepts if a block edge exists in either direction (alias kept for readability). */
export const blockedBetween = blockEdgeExists;
