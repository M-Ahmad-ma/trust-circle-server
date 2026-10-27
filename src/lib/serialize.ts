import { relationshipObject, type RelationshipType } from './relationship';

export interface ExperienceCardRow {
  id: string;
  rating: number;
  review_text: string;
  visited_at: string;
  created_at: Date | string;
  rel_type: RelationshipType;
  place_id: string;
  place_name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  lat: number | string;
  lng: number | string;
  distance_m?: number | string | null;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_avatar: string | null;
  photos?: { id: string; url: string; position: number }[] | null;
}

export function toExperienceCard(row: ExperienceCardRow) {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: row.id,
    rating: Number(row.rating),
    review: row.review_text,
    visitedAt: row.visited_at,
    createdAt,
    relationship: relationshipObject(row.rel_type),
    reviewer: {
      id: row.reviewer_id,
      name: row.reviewer_name,
      avatarPath: row.reviewer_avatar,
    },
    place: {
      id: row.place_id,
      name: row.place_name,
      category: row.category,
      address: row.address,
      city: row.city,
      lat: Number(row.lat),
      lng: Number(row.lng),
      ...(row.distance_m !== undefined && row.distance_m !== null
        ? { distanceM: Number(row.distance_m) }
        : {}),
    },
    photos: (row.photos ?? []).map((p) => ({ id: p.id, url: p.url, position: Number(p.position) })),
  };
}
