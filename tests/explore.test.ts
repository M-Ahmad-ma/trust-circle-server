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

/**
 * Geographic fixture — all north of center (34.015, 71.580):
 *   p1 ≈ 1.0 km, p2 ≈ 5.0 km, p3 ≈ 100 km (outside a 10 km radius)
 */
describe('explore/nearby', () => {
  async function setup() {
    const alice = await registerUser({ name: 'Alice' });
    const bob = await registerUser({ name: 'Bob' });
    const carol = await registerUser({ name: 'Carol' });
    const dave = await registerUser({ name: 'Dave' });

    await makeFriends(alice, bob);
    await makeFriends(bob, carol);

    const p1 = await createPlace(alice.accessToken, { name: 'Near Cafe', lat: 34.024, lng: 71.58 });
    const p2 = await createPlace(alice.accessToken, { name: 'Mid Museum', lat: 34.06, lng: 71.58 });
    const p3 = await createPlace(alice.accessToken, { name: 'Far Fort', lat: 34.915, lng: 71.58 });

    const circleExp = await createExperience(alice.accessToken, {
      placeId: p1.id,
      visibility: 'circle',
      reviewText: 'Circle review at the cafe.',
    });
    const extendedExp = await createExperience(alice.accessToken, {
      placeId: p1.id,
      visibility: 'extended',
      reviewText: 'Extended review at the cafe.',
    });
    await createExperience(alice.accessToken, {
      placeId: p2.id,
      visibility: 'community',
      reviewText: 'Community review at the museum.',
    });
    await createExperience(dave.accessToken, {
      placeId: p1.id,
      visibility: 'community',
      reviewText: 'Dave was here.',
    });
    await createExperience(bob.accessToken, {
      placeId: p1.id,
      visibility: 'community',
      reviewText: 'Bob local review.',
    });
    await createExperience(bob.accessToken, {
      placeId: p3.id,
      visibility: 'community',
      reviewText: 'Far away review.',
    });

    return { alice, bob, carol, dave, p1, p2, p3, circleExp, extendedExp };
  }

  function near(u: { accessToken: string }, extra: Record<string, string | number> = {}) {
    return request(app)
      .get('/api/explore/nearby')
      .query({ lat: 34.015, lng: 71.58, radius: 10000, ...extra })
      .set(auth(u));
  }

  it('direct friend sees circle+extended+community+own, nearest first', async () => {
    const s = await setup();
    const res = await near(s.bob);

    expect(res.status).toBe(200);
    const labels = res.body.data.map((e: { relationship: { label: string } }) => e.relationship.label);
    expect(labels).toContain('Your Circle'); // alice's circle exp (bob is direct)
    expect(labels).toContain('You'); // bob's own local experience
    expect(labels).toContain('Community'); // dave's experience

    // all experiences within the 10km radius
    const reviews = res.body.data.map((e: { review: string }) => e.review);
    expect(reviews).toContain('Circle review at the cafe.');
    expect(reviews).toContain('Extended review at the cafe.');
    expect(reviews).toContain('Community review at the museum.');
    expect(reviews).toContain('Dave was here.');
    expect(reviews).toContain('Bob local review.');
    // p3 (~100km) must be excluded
    expect(reviews).not.toContain('Far away review.');

    // distance ordering: cafe (≈1km) before museum (≈5km)
    const cafe = res.body.data.find((e: { review: string }) => e.review === 'Circle review at the cafe.');
    const museum = res.body.data.find(
      (e: { review: string }) => e.review === 'Community review at the museum.'
    );
    expect(cafe.place.distanceM).toBeLessThan(1500);
    expect(museum.place.distanceM).toBeGreaterThan(4000);
    expect(
      res.body.data.findIndex((e: { id: string }) => e.id === cafe.id)
    ).toBeLessThan(res.body.data.findIndex((e: { id: string }) => e.id === museum.id));
  });

  it('response matches the §21 experience shape', async () => {
    const s = await setup();
    const res = await near(s.bob, { layers: 'circle' });

    expect(res.body.data.length).toBeGreaterThan(0);
    const item = res.body.data.find(
      (e: { review: string }) => e.review === 'Circle review at the cafe.'
    );
    expect(item).toMatchObject({
      id: expect.any(String),
      rating: 5,
      review: 'Circle review at the cafe.',
      visitedAt: '2026-09-01',
      relationship: { type: 'direct_friend', label: 'Your Circle' },
      reviewer: { id: expect.any(String), name: 'Alice', avatarPath: null },
      place: {
        id: expect.any(String),
        name: 'Near Cafe',
        lat: expect.any(Number),
        lng: expect.any(Number),
        distanceM: expect.any(Number),
      },
      photos: [],
    });
    expect(res.body.meta).toMatchObject({
      total: expect.any(Number),
      limit: expect.any(Number),
      center: { lat: 34.015, lng: 71.58 },
      radiusM: 10000,
    });
  });

  it('friend-of-friend does not see circle layer', async () => {
    const s = await setup();
    const res = await near(s.carol);

    const reviews = res.body.data.map((e: { review: string }) => e.review);
    expect(reviews).not.toContain('Circle review at the cafe.');
    expect(reviews).toContain('Extended review at the cafe.');
    expect(reviews).toContain('Community review at the museum.');
    expect(reviews).toContain('Dave was here.');

    const extended = res.body.data.find(
      (e: { review: string }) => e.review === 'Extended review at the cafe.'
    );
    expect(extended.relationship).toEqual({ type: 'friend_of_friend', label: 'Extended Circle' });
  });

  it('stranger sees community experiences only, with labels', async () => {
    const s = await setup();
    const res = await near(s.dave);

    const labels = new Set(
      res.body.data.map((e: { relationship: { label: string } }) => e.relationship.label)
    );
    // stranger sees community content plus their own
    expect(labels).toEqual(new Set(['Community', 'You']));

    const reviews = res.body.data.map((e: { review: string }) => e.review);
    expect(reviews).not.toContain('Circle review at the cafe.');
    expect(reviews).not.toContain('Extended review at the cafe.');
    expect(reviews).toContain('Community review at the museum.');
    expect(reviews).toContain('Dave was here.');
  });

  it('layers filter restricts relationship types', async () => {
    const s = await setup();

    const communityOnly = await near(s.bob, { layers: 'community' });
    const labels = communityOnly.body.data.map(
      (e: { relationship: { type: string } }) => e.relationship.type
    );
    expect(labels.every((t: string) => t === 'none')).toBe(true);

    // "circle" layer = experiences whose relationship to the viewer is direct_friend.
    // Bob is Alice's friend, so all three of her in-radius experiences qualify.
    const circleOnly = await near(s.bob, { layers: 'circle' });
    expect(circleOnly.body.data).toHaveLength(3);
    expect(
      circleOnly.body.data.every(
        (e: { relationship: { type: string } }) => e.relationship.type === 'direct_friend'
      )
    ).toBe(true);
    expect(circleOnly.body.meta.total).toBe(3);
  });

  it('blocking removes the blocked author from discovery', async () => {
    const s = await setup();
    await request(app).post(`/api/friends/block/${s.alice.id}`).set(auth(s.bob));

    const res = await near(s.bob);
    const reviews = res.body.data.map((e: { review: string }) => e.review);
    expect(reviews).not.toContain('Circle review at the cafe.');
    expect(reviews).not.toContain('Extended review at the cafe.');
    expect(reviews).not.toContain('Community review at the museum.');
    expect(reviews).toContain('Dave was here.');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/explore/nearby').query({ lat: 34.015, lng: 71.58 });
    expect(res.status).toBe(401);
  });
});
