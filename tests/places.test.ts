import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  app,
  auth,
  closeDb,
  createExperience,
  createPlace,
  makeFriends,
  registerUser,
  resetDb,
} from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('places', () => {
  it('creates a place with coordinates', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, {
      name: 'Bala Hisar Fort',
      lat: 34.0151,
      lng: 71.5805,
      category: 'landmark',
      address: 'Bala Hisar, Peshawar',
      city: 'Peshawar',
    });
    expect(place.id).toBeTruthy();
    expect(place.lat).toBeCloseTo(34.0151, 4);
    expect(place.lng).toBeCloseTo(71.5805, 4);

    const res = await request(app).get(`/api/places/${place.id}`).set(auth(u));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Bala Hisar Fort');
    expect(res.body.data.experienceCount).toBe(0);
    expect(res.body.data.avgRating).toBeNull();
  });

  it('dedups fuzzy name variants within the city-wide radius', async () => {
    const u = await registerUser();

    const first = await request(app)
      .post('/api/places')
      .set(auth(u))
      .send({ name: 'Bala Hisar Fort', lat: 34.0151, lng: 71.5805 });
    expect(first.status).toBe(201);
    expect(first.body.meta.created).toBe(true);

    for (const name of ['bala hisar', 'Balahisar Fort!', 'Bala  Hisar Fort']) {
      const dup = await request(app)
        .post('/api/places')
        .set(auth(u))
        .send({ name, lat: 34.0152, lng: 71.5806 });
      expect(dup.status).toBe(200);
      expect(dup.body.meta.created).toBe(false);
      expect(dup.body.data.id).toBe(first.body.data.id);
    }
  });

  it('dedups the same name a few km apart — one mistyped copy', async () => {
    const u = await registerUser();

    // The real case from the seeded data: the same venue recorded twice, 2.7 km
    // apart, one of them misspelled. A street-level radius missed this.
    const first = await createPlace(u.accessToken, {
      name: 'Khyber resturant',
      lat: 34.0151,
      lng: 71.5805,
    });
    const dup = await createPlace(u.accessToken, {
      name: 'Khyber Restaurant',
      lat: 34.04,
      lng: 71.61,
    });

    expect(dup.id).toBe(first.id);
  });

  it('keeps differently-named places apart even inside the radius', async () => {
    const u = await registerUser();

    // 4.7 km apart and sharing two words, but different places — the name rule
    // has to be strict enough to keep them apart at a city-wide radius.
    const museum = await createPlace(u.accessToken, {
      name: 'Peshawar Museum',
      lat: 34.0151,
      lng: 71.5805,
    });
    const zoo = await createPlace(u.accessToken, {
      name: 'Peshawar Zoo',
      lat: 34.05,
      lng: 71.62,
    });

    expect(zoo.id).not.toBe(museum.id);
  });

  it('does not dedup the same name far away', async () => {
    const u = await registerUser();

    const first = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.0151,
      lng: 71.5805,
    });
    const second = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 35.0151,
      lng: 72.5805, // ~110km away — far outside both duplicate radii
    });
    expect(second.id).not.toBe(first.id);
  });

  it('dedups the same name anywhere in the city when both name the city', async () => {
    const u = await registerUser();

    // ~40 km apart — beyond the 30 km no-city radius, but inside the 50 km
    // city range. The same venue recorded from the far side of town is the
    // same venue.
    const first = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.0151,
      lng: 71.5805,
      city: 'Peshawar',
    });
    const far = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.3751,
      lng: 71.5805,
      city: 'Peshawar',
    });

    expect(far.id).toBe(first.id);
  });

  it('absorbs a misspelled city inside the city range', async () => {
    const u = await registerUser();

    // The real case: "peshawer" and "Peshawar" are the same city, and the
    // trigram test on the city names has to see through the typo.
    const first = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.0151,
      lng: 71.5805,
      city: 'Peshawar',
    });
    const far = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.3751,
      lng: 71.5805,
      city: 'peshawer',
    });

    expect(far.id).toBe(first.id);
  });

  it('keeps the same name apart in different cities', async () => {
    const u = await registerUser();

    const first = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.0151,
      lng: 71.5805,
      city: 'Peshawar',
    });
    const other = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.3751,
      lng: 71.5805,
      city: 'Nowshera',
    });

    expect(other.id).not.toBe(first.id);
  });

  it('does not apply the city range when the new place names no city', async () => {
    const u = await registerUser();

    const first = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.0151,
      lng: 71.5805,
      city: 'Peshawar',
    });
    const far = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.3751,
      lng: 71.5805,
    });

    expect(far.id).not.toBe(first.id);
  });

  it('falls back to a city-sized radius when no city is named', async () => {
    const u = await registerUser();

    const first = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.0151,
      lng: 71.5805,
    });
    const near = await createPlace(u.accessToken, {
      name: 'Coffee Planet',
      lat: 34.1951, // ~20 km — inside the 30 km fallback
      lng: 71.5805,
    });

    expect(near.id).toBe(first.id);
  });

  it('searches by name (fuzzy)', async () => {
    const u = await registerUser();
    await createPlace(u.accessToken, { name: 'Khyber Restaurant', lat: 34.0, lng: 71.5 });
    await createPlace(u.accessToken, { name: 'Coffee Planet', lat: 34.01, lng: 71.51 });

    const res = await request(app)
      .get('/api/places/search')
      .query({ q: 'khyber' })
      .set(auth(u));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Khyber Restaurant');

    const empty = await request(app)
      .get('/api/places/search')
      .query({ q: 'nonexistent-place-xyz' })
      .set(auth(u));
    expect(empty.body.data).toHaveLength(0);
  });

  it('nearby returns places ordered by distance within radius', async () => {
    const u = await registerUser();
    // ~1km and ~5km north of center
    await createPlace(u.accessToken, { name: 'Near Spot', lat: 34.024, lng: 71.58 });
    await createPlace(u.accessToken, { name: 'Mid Spot', lat: 34.06, lng: 71.58 });
    // ~100km away
    await createPlace(u.accessToken, { name: 'Far Spot', lat: 34.915, lng: 71.58 });

    const res = await request(app)
      .get('/api/places/nearby')
      .query({ lat: 34.015, lng: 71.58, radius: 10000 })
      .set(auth(u));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('Near Spot');
    expect(res.body.data[1].name).toBe('Mid Spot');
    expect(res.body.data[0].distanceM).toBeLessThan(1500);
    expect(res.body.data[1].distanceM).toBeGreaterThan(4000);
    expect(res.body.meta.total).toBe(2);
  });

  it('place aggregates are visibility-aware', async () => {
    const alice = await registerUser({ name: 'Alice' });
    const bob = await registerUser({ name: 'Bob' });
    await makeFriends(alice, bob);

    const place = await createPlace(alice.accessToken, {
      name: 'Test Museum',
      lat: 34.0,
      lng: 71.5,
    });
    await createExperience(alice.accessToken, { placeId: place.id, rating: 5, visibility: 'circle' });
    await createExperience(alice.accessToken, { placeId: place.id, rating: 4, visibility: 'community' });

    const asAlice = await request(app).get(`/api/places/${place.id}`).set(auth(alice));
    expect(asAlice.body.data.experienceCount).toBe(2);
    expect(asAlice.body.data.avgRating).toBe(4.5);

    const asBob = await request(app).get(`/api/places/${place.id}`).set(auth(bob));
    expect(asBob.body.data.experienceCount).toBe(2);

    const stranger = await registerUser();
    const asStranger = await request(app).get(`/api/places/${place.id}`).set(auth(stranger));
    expect(asStranger.body.data.experienceCount).toBe(1);
    expect(asStranger.body.data.avgRating).toBe(4);
  });

  it('validates coordinates and 404s unknown places', async () => {
    const u = await registerUser();

    const bad = await request(app)
      .post('/api/places')
      .set(auth(u))
      .send({ name: 'Nowhere', lat: 999, lng: 0 });
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get('/api/places/00000000-0000-4000-8000-000000000000')
      .set(auth(u));
    expect(missing.status).toBe(404);
  });

  it('corrects a place, including its coordinates', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, {
      name: 'Rough Pin Cafe',
      lat: 34.015,
      lng: 71.58,
      category: 'cafe',
    });

    const moved = await request(app)
      .patch(`/api/places/${place.id}`)
      .set(auth(u))
      .send({ name: 'Rough Pin Café', lat: 34.0225, lng: 71.5901, city: 'Peshawar' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.name).toBe('Rough Pin Café');
    expect(moved.body.data.lat).toBeCloseTo(34.0225, 4);
    expect(moved.body.data.lng).toBeCloseTo(71.5901, 4);

    // Persisted, not just echoed back.
    const refetched = await request(app).get(`/api/places/${place.id}`).set(auth(u));
    expect(refetched.body.data.name).toBe('Rough Pin Café');
    expect(refetched.body.data.lat).toBeCloseTo(34.0225, 4);

    // Omitted fields are untouched; explicit null clears.
    const partial = await request(app)
      .patch(`/api/places/${place.id}`)
      .set(auth(u))
      .send({ address: '12 University Road', category: null });
    expect(partial.status).toBe(200);
    expect(partial.body.data.address).toBe('12 University Road');
    expect(partial.body.data.category).toBeNull();
    // `name` was not in the payload, so it must survive.
    expect(partial.body.data.name).toBe('Rough Pin Café');
  });

  it('lets only the creator edit, and reports canEdit per viewer', async () => {
    const author = await registerUser();
    const stranger = await registerUser();
    const place = await createPlace(author.accessToken, { name: 'Shared Hall', lat: 34, lng: 71.5 });

    // The creator sees the affordance...
    const asAuthor = await request(app).get(`/api/places/${place.id}`).set(auth(author));
    expect(asAuthor.body.data.canEdit).toBe(true);

    // ...and nobody else does.
    const asStranger = await request(app).get(`/api/places/${place.id}`).set(auth(stranger));
    expect(asStranger.body.data.canEdit).toBe(false);

    // The capability flag is not merely cosmetic — the server enforces it.
    const denied = await request(app)
      .patch(`/api/places/${place.id}`)
      .set(auth(stranger))
      .send({ category: 'landmark' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_PLACE_OWNER');

    const unchanged = await request(app).get(`/api/places/${place.id}`).set(auth(author));
    expect(unchanged.body.data.category).toBeNull();

    const allowed = await request(app)
      .patch(`/api/places/${place.id}`)
      .set(auth(author))
      .send({ category: 'landmark' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.category).toBe('landmark');
    expect(allowed.body.data.canEdit).toBe(true);
  });

  it('does not leak canEdit on list endpoints', async () => {
    const u = await registerUser();
    await createPlace(u.accessToken, { name: 'Quiet Corner', lat: 34, lng: 71.5 });

    // Search and nearby return places too; the capability belongs to the detail
    // view, where the edit affordance actually lives.
    const search = await request(app)
      .get('/api/places/search')
      .query({ q: 'quiet' })
      .set(auth(u));
    expect(search.body.data[0]).not.toHaveProperty('canEdit');

    const nearby = await request(app)
      .get('/api/places/nearby')
      .query({ lat: 34, lng: 71.5 })
      .set(auth(u));
    expect(nearby.body.data[0]).not.toHaveProperty('canEdit');
  });

  it('rejects a half-moved point, an empty patch and a bad name', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, { name: 'Half Move', lat: 34, lng: 71.5 });

    const half = await request(app)
      .patch(`/api/places/${place.id}`)
      .set(auth(u))
      .send({ lat: 34.5 });
    expect(half.status).toBe(400);

    const empty = await request(app).patch(`/api/places/${place.id}`).set(auth(u)).send({});
    expect(empty.status).toBe(400);

    const nameless = await request(app)
      .patch(`/api/places/${place.id}`)
      .set(auth(u))
      .send({ name: '!!!' });
    expect(nameless.status).toBe(400);
    expect(nameless.body.error.code).toBe('INVALID_NAME');

    const missing = await request(app)
      .patch('/api/places/00000000-0000-4000-8000-000000000000')
      .set(auth(u))
      .send({ name: 'Nowhere' });
    expect(missing.status).toBe(404);
  });

  it("uses the place's own photo as the cover — never an experience photo", async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, { name: 'Cover Cafe', lat: 34, lng: 71.5 });

    // No photo yet, and no experience either.
    const bare = await request(app).get(`/api/places/${place.id}`).set(auth(u));
    expect(bare.status).toBe(200);
    expect(bare.body.data.coverPhoto).toBeNull();

    // A reviewer's photo belongs to their experience, not to the place. It
    // must not be borrowed as the place's face.
    const reviewed = await createPlace(u.accessToken, {
      name: 'No Cover Cafe',
      lat: 34.01,
      lng: 71.51,
    });
    const memory = await request(app)
      .post('/api/uploads')
      .set(auth(u))
      .attach('file', PNG_1X1, { filename: 'memory.png', contentType: 'image/png' });
    expect(memory.status).toBe(201);
    await createExperience(u.accessToken, {
      placeId: reviewed.id,
      visibility: 'community',
      photoIds: [memory.body.data.id],
    });

    const afterReview = await request(app).get(`/api/places/${reviewed.id}`).set(auth(u));
    expect(afterReview.body.data.coverPhoto).toBeNull();

    // The creator's own photo is the cover.
    const upload = await request(app)
      .post('/api/uploads')
      .set(auth(u))
      .field('placeId', place.id)
      .attach('file', PNG_1X1, { filename: 'cover.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);

    const withCover = await request(app).get(`/api/places/${place.id}`).set(auth(u));
    expect(withCover.body.data.coverPhoto).toBe(upload.body.data.url);
  });

  it('rejects a photo for a place that does not exist', async () => {
    const u = await registerUser();

    const res = await request(app)
      .post('/api/uploads')
      .set(auth(u))
      .field('placeId', '00000000-0000-4000-8000-000000000000')
      .attach('file', PNG_1X1, { filename: 'cover.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PLACE_NOT_FOUND');
  });
});
