import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  app,
  auth,
  closeDb,
  createExperience,
  createPlace,
  registerUser,
  resetDb,
} from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function uploadPhoto(token: string): Promise<string> {
  const res = await request(app)
    .post('/api/uploads')
    .set({ Authorization: `Bearer ${token}` })
    .attach('file', PNG_1X1, { filename: 'photo.png', contentType: 'image/png' });
  if (res.status !== 201) {
    throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.id as string;
}

describe('experiences', () => {
  it('creates and fetches an experience (full round trip)', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, { name: 'Fort Gardens', lat: 34.02, lng: 71.58 });

    const created = await createExperience(u.accessToken, {
      placeId: place.id,
      rating: 4,
      reviewText: 'Lovely gardens, quiet in the morning.',
      visitedAt: '2026-08-15',
      visibility: 'community',
    });

    expect(created.rating).toBe(4);
    expect(created.review).toBe('Lovely gardens, quiet in the morning.');
    expect(created.visitedAt).toBe('2026-08-15');
    expect(created.visibility).toBe('community');
    expect(created.relationship).toEqual({ type: 'self', label: 'You' });
    expect(created.place.name).toBe('Fort Gardens');
    expect(created.reviewer.name).toBe(u.name);

    const fetched = await request(app).get(`/api/experiences/${created.id}`).set(auth(u));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(created.id);
    expect(fetched.body.data.photos).toEqual([]);
  });

  it('validates input fields', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, { name: 'Validation Spot', lat: 34.0, lng: 71.5 });

    const badRating = await request(app)
      .post('/api/experiences')
      .set(auth(u))
      .send({ placeId: place.id, rating: 6, reviewText: 'x', visitedAt: '2026-09-01', visibility: 'community' });
    expect(badRating.status).toBe(400);

    const futureVisit = await request(app)
      .post('/api/experiences')
      .set(auth(u))
      .send({ placeId: place.id, rating: 5, reviewText: 'x', visitedAt: '2099-01-01', visibility: 'community' });
    expect(futureVisit.status).toBe(400);
    expect(futureVisit.body.error.code).toBe('VISITED_AT_FUTURE');

    const badVisibility = await request(app)
      .post('/api/experiences')
      .set(auth(u))
      .send({ placeId: place.id, rating: 5, reviewText: 'x', visitedAt: '2026-09-01', visibility: 'everyone' });
    expect(badVisibility.status).toBe(400);

    const missingPlace = await request(app)
      .post('/api/experiences')
      .set(auth(u))
      .send({
        placeId: '00000000-0000-4000-8000-000000000000',
        rating: 5,
        reviewText: 'x',
        visitedAt: '2026-09-01',
        visibility: 'community',
      });
    expect(missingPlace.status).toBe(404);
  });

  it('owner can edit; others cannot', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const place = await createPlace(owner.accessToken, { name: 'Editable', lat: 34.0, lng: 71.5 });
    const exp = await createExperience(owner.accessToken, { placeId: place.id, visibility: 'community' });

    const edit = await request(app)
      .patch(`/api/experiences/${exp.id}`)
      .set(auth(owner))
      .send({ rating: 2, reviewText: 'Changed my mind — too crowded.', visibility: 'circle' });
    expect(edit.status).toBe(200);
    expect(edit.body.data.rating).toBe(2);
    expect(edit.body.data.review).toBe('Changed my mind — too crowded.');
    expect(edit.body.data.visibility).toBe('circle');

    const forbidden = await request(app)
      .patch(`/api/experiences/${exp.id}`)
      .set(auth(other))
      .send({ rating: 1 });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('NOT_OWNER');

    const forbiddenDelete = await request(app)
      .delete(`/api/experiences/${exp.id}`)
      .set(auth(other));
    expect(forbiddenDelete.status).toBe(403);
  });

  it('owner can delete; deleted content 404s', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, { name: 'Deletable', lat: 34.0, lng: 71.5 });
    const exp = await createExperience(u.accessToken, { placeId: place.id, visibility: 'community' });

    const del = await request(app).delete(`/api/experiences/${exp.id}`).set(auth(u));
    expect(del.status).toBe(200);

    const gone = await request(app).get(`/api/experiences/${exp.id}`).set(auth(u));
    expect(gone.status).toBe(404);
  });

  it('uploads photos, attaches, reorders and detaches', async () => {
    const u = await registerUser();
    const place = await createPlace(u.accessToken, { name: 'Photo Spot', lat: 34.0, lng: 71.5 });

    const p1 = await uploadPhoto(u.accessToken);
    const p2 = await uploadPhoto(u.accessToken);
    const p3 = await uploadPhoto(u.accessToken);

    const exp = await createExperience(u.accessToken, {
      placeId: place.id,
      visibility: 'community',
      photoIds: [p1, p2, p3],
    });
    expect(exp.photos).toHaveLength(3);
    expect((exp.photos as { id: string }[]).map((p) => p.id)).toEqual([p1, p2, p3]);

    // reorder + drop the middle photo
    const patch = await request(app)
      .patch(`/api/experiences/${exp.id}`)
      .set(auth(u))
      .send({ photoIds: [p3, p1] });
    expect(patch.status).toBe(200);
    expect((patch.body.data.photos as { id: string }[]).map((p) => p.id)).toEqual([p3, p1]);

    // detached photo is reusable on a new experience
    const exp2 = await createExperience(u.accessToken, {
      placeId: place.id,
      visibility: 'community',
      photoIds: [p2],
    });
    expect(exp2.photos).toHaveLength(1);
  });

  it('rejects photoIds not owned by the caller', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const photo = await uploadPhoto(a.accessToken);
    const place = await createPlace(b.accessToken, { name: 'Thief Spot', lat: 34.0, lng: 71.5 });

    const res = await request(app)
      .post('/api/experiences')
      .set(auth(b))
      .send({
        placeId: place.id,
        rating: 5,
        reviewText: 'trying to steal a photo',
        visitedAt: '2026-09-01',
        visibility: 'community',
        photoIds: [photo],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHOTOS');
  });

  it('photo upload validates type and ownership on delete', async () => {
    const a = await registerUser();
    const b = await registerUser();

    const textFile = await request(app)
      .post('/api/uploads')
      .set(auth(a))
      .attach('file', Buffer.from('not an image'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(textFile.status).toBe(415);

    const noFile = await request(app).post('/api/uploads').set(auth(a));
    expect(noFile.status).toBe(400);

    const photoId = await uploadPhoto(a.accessToken);
    const forbidden = await request(app).delete(`/api/uploads/${photoId}`).set(auth(b));
    expect(forbidden.status).toBe(403);

    const ok = await request(app).delete(`/api/uploads/${photoId}`).set(auth(a));
    expect(ok.status).toBe(200);
  });
});
