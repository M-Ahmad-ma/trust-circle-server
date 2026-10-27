import { z } from 'zod';

export const latSchema = z.coerce.number().min(-90).max(90);
export const lngSchema = z.coerce.number().min(-180).max(180);

export const geoQuerySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  radius: z.coerce.number().min(10).max(50_000).default(5_000),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GeoQuery = z.infer<typeof geoQuerySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

export function paginationMeta(q: ListQuery, total: number) {
  return { total, limit: q.limit, offset: q.offset };
}
