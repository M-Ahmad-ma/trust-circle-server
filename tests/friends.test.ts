import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, closeDb, makeFriends, registerUser, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

describe('friendships', () => {
  it('runs the full request → accept lifecycle', async () => {
    const a = await registerUser({ name: 'Ahmed' });
    const b = await registerUser({ name: 'Bilal' });

    const req = await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    expect(req.status).toBe(201);
    expect(req.body.data.request.status).toBe('pending');

    const incoming = await request(app).get('/api/friends/requests').set(auth(b));
    expect(incoming.status).toBe(200);
    expect(incoming.body.data.incoming).toHaveLength(1);
    expect(incoming.body.data.incoming[0].user.id).toBe(a.id);

    const accept = await request(app)
      .post(`/api/friends/${req.body.data.request.id}/accept`)
      .set(auth(b));
    expect(accept.status).toBe(200);
    expect(accept.body.data.friendship.status).toBe('accepted');
    expect(accept.body.data.friendship.user.id).toBe(a.id);

    const friendsA = await request(app).get('/api/friends').set(auth(a));
    const friendsB = await request(app).get('/api/friends').set(auth(b));
    expect(friendsA.body.data.map((f: { user: { id: string } }) => f.user.id)).toContain(b.id);
    expect(friendsB.body.data.map((f: { user: { id: string } }) => f.user.id)).toContain(a.id);

    const rel = await request(app).get(`/api/friends/${b.id}/relationship`).set(auth(a));
    expect(rel.body.data).toEqual({ type: 'direct_friend', label: 'Your Circle' });
  });

  it('rejects duplicate and self requests', async () => {
    const a = await registerUser();
    const b = await registerUser();

    await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    const dup = await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    expect(dup.status).toBe(409);

    const self = await request(app).post(`/api/friends/request/${a.id}`).set(auth(a));
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_REQUEST');
  });

  it('reports reverse pending requests as conflicts', async () => {
    const a = await registerUser();
    const b = await registerUser();

    await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    // b tries to request a back instead of accepting
    const reverse = await request(app).post(`/api/friends/request/${a.id}`).set(auth(b));
    expect(reverse.status).toBe(409);
    expect(reverse.body.error.code).toBe('REQUEST_ALREADY_RECEIVED');
    expect(reverse.body.error.details.requestId).toBeTruthy();
  });

  it('rejects requests without accepting them', async () => {
    const a = await registerUser();
    const b = await registerUser();

    const req = await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    const reject = await request(app)
      .post(`/api/friends/${req.body.data.request.id}/reject`)
      .set(auth(b));
    expect(reject.status).toBe(200);

    const friends = await request(app).get('/api/friends').set(auth(b));
    expect(friends.body.data).toHaveLength(0);

    const incoming = await request(app).get('/api/friends/requests').set(auth(b));
    expect(incoming.body.data.incoming).toHaveLength(0);
  });

  it('only the addressee can accept a request', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const c = await registerUser();

    const req = await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    const wrong = await request(app)
      .post(`/api/friends/${req.body.data.request.id}/accept`)
      .set(auth(c));
    expect(wrong.status).toBe(404);
  });

  it('unfriends an accepted connection', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await makeFriends(a, b);

    const del = await request(app).delete(`/api/friends/${b.id}`).set(auth(a));
    expect(del.status).toBe(200);

    const rel = await request(app).get(`/api/friends/${b.id}/relationship`).set(auth(a));
    expect(rel.body.data.type).toBe('none');
  });

  it('computes friend-of-friend (Extended Circle)', async () => {
    const a = await registerUser({ name: 'A' });
    const b = await registerUser({ name: 'B' });
    const c = await registerUser({ name: 'C' });
    await makeFriends(a, b);
    await makeFriends(b, c);

    const rel = await request(app).get(`/api/friends/${c.id}/relationship`).set(auth(a));
    expect(rel.body.data).toEqual({ type: 'friend_of_friend', label: 'Extended Circle' });
  });

  it('blocks hide the relationship and block new requests', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await makeFriends(a, b);

    const block = await request(app).post(`/api/friends/block/${a.id}`).set(auth(b));
    expect(block.status).toBe(200);

    // friendship is destroyed by the block
    const friends = await request(app).get('/api/friends').set(auth(b));
    expect(friends.body.data).toHaveLength(0);

    const rel = await request(app).get(`/api/friends/${a.id}/relationship`).set(auth(b));
    expect(rel.body.data.type).toBe('none');

    // blocked user cannot request again
    const req = await request(app).post(`/api/friends/request/${b.id}`).set(auth(a));
    expect(req.status).toBe(403);
    expect(req.body.error.code).toBe('BLOCKED');

    // profile hidden
    const profile = await request(app).get(`/api/users/${a.id}`).set(auth(b));
    expect(profile.status).toBe(404);

    // unblock restores visibility
    const unblock = await request(app).delete(`/api/friends/block/${a.id}`).set(auth(b));
    expect(unblock.status).toBe(200);
    const profile2 = await request(app).get(`/api/users/${a.id}`).set(auth(b));
    expect(profile2.status).toBe(200);
  });

  it('lists only blocks the viewer placed, and empties on unblock', async () => {
    const blocker = await registerUser({ name: 'Blocker' });
    const blocked = await registerUser({ name: 'Blocked' });
    const other = await registerUser({ name: 'Other' });

    expect((await request(app).post(`/api/friends/block/${blocked.id}`).set(auth(blocker))).status).toBe(200);

    const listed = await request(app).get('/api/friends/blocked').set(auth(blocker));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].user.id).toBe(blocked.id);
    expect(listed.body.data[0].blockedAt).toBeTruthy();

    // Directed: the blocked party does not see a block in their own list, and
    // an unrelated user sees nothing.
    const asBlocked = await request(app).get('/api/friends/blocked').set(auth(blocked));
    expect(asBlocked.body.data).toHaveLength(0);
    const asOther = await request(app).get('/api/friends/blocked').set(auth(other));
    expect(asOther.body.data).toHaveLength(0);

    expect(
      (await request(app).delete(`/api/friends/block/${blocked.id}`).set(auth(blocker))).status
    ).toBe(200);

    const emptied = await request(app).get('/api/friends/blocked').set(auth(blocker));
    expect(emptied.body.data).toHaveLength(0);

    // Unblocking twice is a 404 — the row is gone, not merely invisible.
    const again = await request(app).delete(`/api/friends/block/${blocked.id}`).set(auth(blocker));
    expect(again.status).toBe(404);
  });

  it('404s on unknown users and requests', async () => {
    const a = await registerUser();
    const missing = await request(app)
      .post('/api/friends/request/00000000-0000-4000-8000-000000000000')
      .set(auth(a));
    expect(missing.status).toBe(404);

    const accept = await request(app)
      .post('/api/friends/00000000-0000-4000-8000-000000000000/accept')
      .set(auth(a));
    expect(accept.status).toBe(404);
  });
});
