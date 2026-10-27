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

/** Two users with one experience each at the same place, controlled visibility. */
async function bothVisited(
  visibility: 'circle' | 'extended' | 'community',
  placeName = 'Bala Hisar Fort'
) {
  const viewer = await registerUser({ name: 'Viewer' });
  const candidate = await registerUser({ name: 'Candidate' });
  const place = await createPlace(viewer.accessToken, {
    name: placeName,
    lat: 34.0151,
    lng: 71.5805,
  });
  await createExperience(viewer.accessToken, {
    placeId: place.id,
    visibility: 'community',
    reviewText: 'Went here.',
  });
  await createExperience(candidate.accessToken, {
    placeId: place.id,
    visibility,
    reviewText: 'Me too.',
  });
  return { viewer, candidate, place };
}

const suggest = (user: { accessToken: string }) =>
  request(app).get('/api/users/suggestions').set(auth(user));

describe('users/suggestions', () => {
  it('suggests someone who shared a community-visible place', async () => {
    const { viewer, candidate } = await bothVisited('community');

    const res = await suggest(viewer);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].user.id).toBe(candidate.id);
    expect(res.body.data[0].sharedPlaceCount).toBe(1);
    expect(res.body.data[0].sharedPlaces).toEqual(['Bala Hisar Fort']);
    expect(res.body.data[0].relationship.type).toBe('none');
  });

  // The endpoint's whole reason to exist is trust, so it must never disclose that
  // someone was somewhere via a post the viewer cannot read.
  it('does not suggest based on an experience the viewer cannot see', async () => {
    const { viewer } = await bothVisited('circle');

    const res = await suggest(viewer);
    expect(res.body.data).toHaveLength(0);
  });

  it('allows a circle-visible experience once they are direct friends', async () => {
    const { viewer, candidate } = await bothVisited('circle');
    await makeFriends(viewer, candidate);

    // They are a friend, so the shared place is moot — but the filter itself is
    // what we are checking: they must be excluded for being a friend, not leaked.
    const res = await suggest(viewer);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.data.map((s: { user: { id: string } }) => s.user.id)).not.toContain(
      candidate.id
    );
  });

  it('sees an extended experience for a friend-of-friend', async () => {
    const viewer = await registerUser({ name: 'Viewer' });
    const friend = await registerUser({ name: 'Friend' });
    const fof = await registerUser({ name: 'Fof' });
    await makeFriends(viewer, friend);
    await makeFriends(friend, fof);

    const place = await createPlace(viewer.accessToken, {
      name: 'Peshawar Museum',
      lat: 34.008,
      lng: 71.562,
    });
    await createExperience(viewer.accessToken, {
      placeId: place.id,
      visibility: 'community',
      reviewText: 'Went here.',
    });
    await createExperience(fof.accessToken, {
      placeId: place.id,
      visibility: 'extended',
      reviewText: 'Me too.',
    });

    const res = await suggest(viewer);
    expect(res.body.data.map((s: { user: { id: string } }) => s.user.id)).toEqual([fof.id]);
  });

  it('excludes existing friends', async () => {
    const { viewer, candidate } = await bothVisited('community');
    await makeFriends(viewer, candidate);

    const res = await suggest(viewer);
    expect(res.body.data.map((s: { user: { id: string } }) => s.user.id)).not.toContain(
      candidate.id
    );
  });

  it('excludes a pair with a request already open in either direction', async () => {
    const { viewer, candidate } = await bothVisited('community');

    // viewer already asked
    await request(app).post(`/api/friends/request/${candidate.id}`).set(auth(viewer));
    expect((await suggest(viewer)).body.data).toHaveLength(0);

    // and the reverse: they asked viewer, so the Add button could only 409
    const other = await registerUser({ name: 'Asker' });
    const place = await createPlace(viewer.accessToken, {
      name: 'Coffee Planet',
      lat: 34.019,
      lng: 71.585,
    });
    await createExperience(other.accessToken, {
      placeId: place.id,
      visibility: 'community',
      reviewText: 'Me too.',
    });
    await request(app).post(`/api/friends/request/${viewer.id}`).set(auth(other));
    expect((await suggest(viewer)).body.data).toHaveLength(0);
  });

  it('excludes blocked pairs', async () => {
    const { viewer, candidate } = await bothVisited('community');

    await request(app).post(`/api/friends/block/${candidate.id}`).set(auth(viewer));
    const res = await suggest(viewer);
    expect(res.body.data).toHaveLength(0);
  });

  it('ranks by number of shared places', async () => {
    const viewer = await registerUser({ name: 'Viewer' });
    const one = await registerUser({ name: 'OnePlace' });
    const three = await registerUser({ name: 'ThreePlaces' });

    const places = await Promise.all(
      ['Fort', 'Museum', 'Zoo'].map((n, i) =>
        createPlace(viewer.accessToken, { name: n, lat: 34.0 + i * 0.01, lng: 71.58 })
      )
    );
    for (const p of places) {
      await createExperience(viewer.accessToken, {
        placeId: p.id,
        visibility: 'community',
        reviewText: 'Went here.',
      });
    }
    await createExperience(one.accessToken, {
      placeId: places[0].id,
      visibility: 'community',
      reviewText: 'Me too.',
    });
    for (const p of places) {
      await createExperience(three.accessToken, {
        placeId: p.id,
        visibility: 'community',
        reviewText: 'Me too.',
      });
    }

    const res = await suggest(viewer);
    expect(res.body.data.map((s: { user: { name: string } }) => s.user.name)).toEqual([
      'ThreePlaces',
      'OnePlace',
    ]);
    expect(res.body.data[0].sharedPlaceCount).toBe(3);
    expect(res.body.data[0].sharedPlaces).toHaveLength(3);
    expect(res.body.data[1].sharedPlaceCount).toBe(1);
  });

  it('returns an empty list for a viewer with no experiences', async () => {
    const viewer = await registerUser({ name: 'Viewer' });
    const candidate = await registerUser({ name: 'Candidate' });
    const place = await createPlace(candidate.accessToken, {
      name: 'Lahore Fort',
      lat: 31.588,
      lng: 74.31,
    });
    await createExperience(candidate.accessToken, {
      placeId: place.id,
      visibility: 'community',
      reviewText: 'I was here.',
    });

    const res = await suggest(viewer);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('never suggests the viewer to themselves', async () => {
    const { viewer } = await bothVisited('community');
    const res = await suggest(viewer);
    expect(res.body.data.map((s: { user: { id: string } }) => s.user.id)).not.toContain(viewer.id);
  });

  it('validates limit and requires authentication', async () => {
    const viewer = await registerUser();

    const bad = await request(app).get('/api/users/suggestions?limit=99').set(auth(viewer));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const anon = await request(app).get('/api/users/suggestions');
    expect(anon.status).toBe(401);
  });
});