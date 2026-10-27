import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../middleware/auth';
import { parse } from '../middleware/validate';
import { env } from '../config/env';

export const geocodingRouter = Router();

/**
 * Forward geocoding for the add-a-place flow.
 *
 * A place that does not exist yet cannot be found in our own database, so the
 * client has nowhere to search but a real gazetteer. Nominatim (OpenStreetMap)
 * is the pragmatic choice for this stack: no API key, and the same project that
 * serves the map tiles the app already loads.
 *
 * Proxied server-side rather than called from the app for two reasons: Nominatim
 * requires a User-Agent identifying the application, and it caps callers at one
 * request per second. Both are easier to honour in one place than in every
 * client that might ever search.
 *
 * This is the right shape for development. A production deployment should
 * swap `GEOCODING_BASE_URL` for a contracted provider rather than lean on the
 * shared instance — the free endpoint has no SLA and will rate-limit a real
 * user base regardless of how politely this module behaves.
 */

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  /**
   * Required, and deliberately not optional. An unbounded Nominatim query ranks
   * by global importance, which for the kinds of names in this app is actively
   * dangerous: "Bala Hisar" returns a shop in Haryana, India, and a user who
   * trusted it would create their local fort in the wrong country. Scoping to
   * the map the user is actually looking at makes a miss return nothing — the
   * honest answer — instead of somewhere else entirely.
   */
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * Half-width of the search box in degrees. 0.08° is roughly 9 km, which covers
 * a city centre and stays small enough that a wrong-country hit is impossible.
 * Nominatim rejects a degenerate (zero-area) viewbox with a 400, so this must
 * never be zero.
 */
const VIEWBOX_HALF_DEG = 0.08;

interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
}

/**
 * Nominatim's usage policy caps callers at 1 req/s. A single in-memory slot is
 * enough: this server is one process, and the alternative — no limit — is how a
 * search box held down gets the whole app blocked.
 */
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const waitMs = lastRequestAt + MIN_INTERVAL_MS - now;
  lastRequestAt = now + Math.max(0, waitMs);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

/** GET /api/geocode?q=&limit=&lat=&lng= — free-text place search */
geocodingRouter.get('/', async (req, res) => {
  const q = parse(querySchema, req.query);

  await waitForRateLimit();

  const url = new URL(`${env.GEOCODING_BASE_URL}/search`);
  url.searchParams.set('q', q.q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(q.limit));
  url.searchParams.set('addressdetails', '1');
  // west, north, east, south — Nominatim's order, not latitude-first.
  url.searchParams.set(
    'viewbox',
    `${q.lng - VIEWBOX_HALF_DEG},${q.lat + VIEWBOX_HALF_DEG},${q.lng + VIEWBOX_HALF_DEG},${q.lat - VIEWBOX_HALF_DEG}`
  );
  // Hard-filter rather than bias. See the note on `lat`/`lng` above.
  url.searchParams.set('bounded', '1');
  if (q.lat !== undefined && q.lng !== undefined) {
    // west, north, east, south — Nominatim's order, not latitude-first.
    url.searchParams.set(
      'viewbox',
      `${q.lng - VIEWBOX_HALF_DEG},${q.lat + VIEWBOX_HALF_DEG},${q.lng + VIEWBOX_HALF_DEG},${q.lat - VIEWBOX_HALF_DEG}`
    );
    // Hard-filter rather than bias. See the note on `lat`/`lng` above.
    url.searchParams.set('bounded', '1');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        // Required by the usage policy; without it requests are refused.
        'User-Agent': env.GEOCODING_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(env.GEOCODING_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiError(
      503,
      'GEOCODER_UNAVAILABLE',
      'Place search is temporarily unavailable',
      { reason: error instanceof Error ? error.message : String(error) }
    );
  }

  if (!response.ok) {
    throw new ApiError(
      503,
      'GEOCODER_UNAVAILABLE',
      'Place search is temporarily unavailable',
      { status: response.status }
    );
  }

  let places: NominatimPlace[];
  try {
    places = (await response.json()) as NominatimPlace[];
  } catch {
    throw new ApiError(503, 'GEOCODER_UNAVAILABLE', 'Place search returned an unreadable response');
  }

  res.json({
    data: places.map((place) => ({
      id: String(place.place_id),
      name: place.name || place.display_name.split(',')[0],
      displayName: place.display_name,
      lat: Number(place.lat),
      lng: Number(place.lon),
      category: place.type ?? place.category ?? null,
      // Nominatim repeats the queried name inside display_name, which makes for
      // a noisy heading; the locality/town is the useful second line.
      city:
        place.address?.city ??
        place.address?.town ??
        place.address?.village ??
        place.address?.suburb ??
        null,
    })),
  });
});