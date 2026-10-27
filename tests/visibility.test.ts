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

/** The visibility × relationship matrix — the heart of Trust Circle. */
describe('visibility', () => {
  async function setup() {
    const alice = await registerUser({ name: 'Alice' });
    const bob = await registerUser({ name: 'Bob' });
    const carol = await registerUser({ name: 'Carol' });
    const dave = await registerUser({ name: 'Dave' });

    await makeFriends(alice, bob); // alice ↔ bob: direct
    await makeFriends(bob, carol); // bob ↔ carol; alice–carol: friend-of-friend

    const place = await createPlace(alice.accessToken, {
      name: 'Bala Hisar Fort',
      lat: 34.0151,
      lng: 71.5805,
      city: 'Peshawar',
    });

    const circleExp = await createExperience(alice.accessToken, {
      placeId: place.id,
      visibility: 'circle',
      reviewText: 'Circle only review.',
    });
    const extendedExp = await createExperience(alice.accessToken, {
      placeId: place.id,
      visibility: 'extended',
      reviewText: 'Extended only review.',
    });
    const communityExp = await createExperience(alice.accessToken, {
      placeId: place.id,
      visibility: 'community',
      reviewText: 'Community review.',
    });

    return { alice, bob, carol, dave, place, circleExp, extendedExp, communityExp };
  }

  it('author sees everything as self', async () => {
    const s = await setup();
    for (const exp of [s.circleExp, s.extendedExp, s.communityExp]) {
      const res = await request(app).get(`/api/experiences/${exp.id}`).set(auth(s.alice));
      expect(res.status).toBe(200);
      expect(res.body.data.relationship).toEqual({ type: 'self', label: 'You' });
    }
  });

  it('direct friend sees all levels (Your Circle)', async () => {
    const s = await setup();
    const circle = await request(app).get(`/api/experiences/${s.circleExp.id}`).set(auth(s.bob));
    expect(circle.status).toBe(200);
    expect(circle.body.data.relationship).toEqual({ type: 'direct_friend', label: 'Your Circle' });

    const extended = await request(app).get(`/api/experiences/${s.extendedExp.id}`).set(auth(s.bob));
    expect(extended.status).toBe(200);

    const community = await request(app).get(`/api/experiences/${s.communityExp.id}`).set(auth(s.bob));
    expect(community.status).toBe(200);
  });

  it('friend-of-friend sees extended + community only (Extended Circle)', async () => {
    const s = await setup();

    const circle = await request(app).get(`/api/experiences/${s.circleExp.id}`).set(auth(s.carol));
    expect(circle.status).toBe(403);
    expect(circle.body.error.code).toBe('NOT_VISIBLE');

    const extended = await request(app).get(`/api/experiences/${s.extendedExp.id}`).set(auth(s.carol));
    expect(extended.status).toBe(200);
    expect(extended.body.data.relationship).toEqual({
      type: 'friend_of_friend',
      label: 'Extended Circle',
    });

    const community = await request(app).get(`/api/experiences/${s.communityExp.id}`).set(auth(s.carol));
    expect(community.status).toBe(200);
    expect(community.body.data.relationship.label).toBe('Extended Circle');
  });

  it('stranger sees community only (Community)', async () => {
    const s = await setup();

    const circle = await request(app).get(`/api/experiences/${s.circleExp.id}`).set(auth(s.dave));
    expect(circle.status).toBe(403);

    const extended = await request(app).get(`/api/experiences/${s.extendedExp.id}`).set(auth(s.dave));
    expect(extended.status).toBe(403);

    const community = await request(app).get(`/api/experiences/${s.communityExp.id}`).set(auth(s.dave));
    expect(community.status).toBe(200);
    expect(community.body.data.relationship).toEqual({ type: 'none', label: 'Community' });
    expect(community.body.data.reviewer.name).toBe('Alice');
    expect(community.body.data.review).toBe('Community review.');
    expect(community.body.data.visitedAt).toBe('2026-09-01');
  });

  it('profile experience list is filtered per viewer', async () => {
    const s = await setup();

    const forBob = await request(app)
      .get(`/api/users/${s.alice.id}/experiences`)
      .set(auth(s.bob));
    expect(forBob.body.data).toHaveLength(3);

    const forCarol = await request(app)
      .get(`/api/users/${s.alice.id}/experiences`)
      .set(auth(s.carol));
    expect(forCarol.body.data).toHaveLength(2); // no circle
    expect(
      forCarol.body.data.map((e: { relationship: { type: string } }) => e.relationship.type)
    ).not.toContain('direct_friend');

    const forDave = await request(app)
      .get(`/api/users/${s.alice.id}/experiences`)
      .set(auth(s.dave));
    expect(forDave.body.data).toHaveLength(1);
    expect(forDave.body.data[0].relationship).toEqual({ type: 'none', label: 'Community' });

    // author sees own all
    const forSelf = await request(app)
      .get(`/api/users/${s.alice.id}/experiences`)
      .set(auth(s.alice));
    expect(forSelf.body.data).toHaveLength(3);
  });

  it('profile counts respect visibility', async () => {
    const s = await setup();

    const aliceAsBob = await request(app).get(`/api/users/${s.alice.id}`).set(auth(s.bob));
    expect(aliceAsBob.body.data.counts.experiences).toBe(3);

    const aliceAsDave = await request(app).get(`/api/users/${s.alice.id}`).set(auth(s.dave));
    expect(aliceAsDave.body.data.counts.experiences).toBe(1);
  });

  it('blocking hides community content too', async () => {
    const s = await setup();

    // bob blocks alice
    await request(app).post(`/api/friends/block/${s.alice.id}`).set(auth(s.bob));

    const community = await request(app)
      .get(`/api/experiences/${s.communityExp.id}`)
      .set(auth(s.bob));
    expect(community.status).toBe(403);

    const placeExperiences = await request(app)
      .get(`/api/places/${s.place.id}/experiences`)
      .set(auth(s.bob));
    expect(placeExperiences.body.data).toHaveLength(0);
  });

  it('place experience list respects visibility', async () => {
    const s = await setup();

    const forCarol = await request(app)
      .get(`/api/places/${s.place.id}/experiences`)
      .set(auth(s.carol));
    expect(forCarol.body.data).toHaveLength(2);

    const forDave = await request(app)
      .get(`/api/places/${s.place.id}/experiences`)
      .set(auth(s.dave));
    expect(forDave.body.data).toHaveLength(1);
  });
});
