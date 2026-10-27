# Trust Circle API — Frontend Reference

Everything you need to integrate: copy-paste TypeScript types, real request/response examples
captured from the live server, and the exact error codes each endpoint can return.

- **Dev base URL**: `http://localhost:3000`
- **Health check**: `GET /health` → `200 { "status": "ok", "service": "trust-circle-api" }` (no auth)
- **CORS**: enabled for all origins (preflight `204`), so any dev server (`:5173`, `:3000`…) works as-is.
- **Image URLs** (`avatarPath`, `photos[].url`) are **relative** — prefix them with the base URL
  (or use an `<Image src={baseUrl + avatarPath}>` helper).

---

## Quick start

```bash
# 1. seed the dev DB (10 users, friendships, 16 places, 42 experiences, Unsplash photos)
npm run db:seed     # password for every account: password123

# 2. run the server
npm run dev
```

```ts
// 3. from your frontend: login and load the feed
const BASE = 'http://localhost:3000';

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'bilal@trust.dev', password: 'password123' }),
}).then((r) => r.json());

const { accessToken } = login.data; // store + attach as Bearer token

const feed = await fetch(
  `${BASE}/api/explore/nearby?lat=34.015&lng=71.58&radius=5000`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
).then((r) => r.json());
// feed.data[] → experience cards, feed.meta → { total, limit, offset, center, radiusM, layers }
```

---

## Table of contents

1. [Authentication & token refresh](#1-authentication--token-refresh)
2. [Response conventions](#2-response-conventions)
3. [Shared TypeScript types](#3-shared-typescript-types)
4. [Endpoints](#4-endpoints)
   - [Auth](#auth) · [Users](#users) · [Friends](#friends) · [Places](#places) ·
     [Experiences](#experiences) · [Uploads](#uploads) · [Explore](#explore)
5. [Error code catalog](#5-error-code-catalog)
6. [Recipes](#6-recipes)
7. [Test accounts](#7-test-accounts-seeded)

---

## 1. Authentication & token refresh

| Token | Form | TTL | Notes |
|---|---|---|---|
| `accessToken` | JWT (`HS256`) | **15 min** | Send as `Authorization: Bearer <token>` on every request except auth endpoints. |
| `refreshToken` | opaque string | **30 days** | Single-use: each refresh returns a **new** one and revokes the old. Sending a used/expired token → `401 INVALID_REFRESH_TOKEN`. |

**Rules for your client:**

- Send the header only as `Bearer <accessToken>` — anything else → `401 UNAUTHORIZED`.
- On `401` with code `INVALID_TOKEN` → call `POST /api/auth/refresh` once, retry the original
  request with the new access token. If refresh itself returns `401` → clear session, show login.
- Always **replace** both tokens with the pair returned by refresh (rotation). Replaying an old
  refresh token logs the session out.
- Store tokens where your threat model allows (memory + `localStorage` for dev; httpOnly cookie
  would require server changes — currently tokens are returned in the JSON body).

### Full client with auto-refresh (copy-paste)

```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');

function saveTokens(a: string, r: string) {
  accessToken = a;
  refreshToken = r;
  localStorage.setItem('accessToken', a);
  localStorage.setItem('refreshToken', r);
}

export function clearTokens() {
  accessToken = refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const { accessToken: a, refreshToken: r } = (await res.json()).data;
  saveTokens(a, r);
  return true;
}

/** Fetch wrapper: attaches the bearer token and retries once after a refresh. */
export async function api(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  // JSON content-type only for string bodies — FormData must set its own boundary
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !retried) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'INVALID_TOKEN' && (await refreshSession())) {
      return api(path, init, true);
    }
  }
  return res;
}
```

---

## 2. Response conventions

### Envelope

```jsonc
// success (list endpoints add "meta")
{ "data": [ /* … */ ], "meta": { "total": 42, "limit": 20, "offset": 0 } }

// error — always this shape, never a bare message
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "email", "message": "Invalid email" }]   // optional, only some codes
  }
}
```

`details` is field-level for `VALIDATION_ERROR` (`path` = dot-joined body/query path), and
code-specific otherwise (e.g. `INVALID_PHOTOS` → `{ photoIds: [...] }`,
`REQUEST_ALREADY_RECEIVED` → `{ requestId }`).

### Dates

Two timestamp formats exist — **both parse with `new Date(x)`** in browsers:

| Format | Where it appears |
|---|---|
| ISO-8601 `2026-09-25T10:01:36.836Z` | `user.createdAt` (all auth/profile responses) |
| Postgres `2026-09-25 10:01:36.940612+00` | `createdAt`/`updatedAt` on experiences, `friendsSince`, `request.createdAt` |

```ts
const parseDate = (s: string) => new Date(s); // works for both formats
```

`visitedAt` is always a pure date string: `"2026-09-18"` (`YYYY-MM-DD`).

### Pagination

Query: `?limit=20&offset=0`

| Endpoint group | Default limit | Max | `meta` |
|---|---|---|---|
| places search/nearby, place/user experience lists | 20 | 100 | `{ limit, offset }` (+ `total` on place search) |
| explore | 30 | 100 | `{ total, limit, offset, center, radiusM, layers }` |
| user search | 20 | **50**, **no offset** (single page) | none |

Infinite scroll = keep `offset += limit` while `data.length === meta.limit`
(or `offset < meta.total` where `total` exists).

### Enums

```ts
type RelationshipType = 'self' | 'direct_friend' | 'friend_of_friend' | 'none';
// labels are stable — render these directly:
// self → "You" · direct_friend → "Your Circle" · friend_of_friend → "Extended Circle" · none → "Community"

type Visibility = 'circle' | 'extended' | 'community';
// circle    → author + direct friends
// extended  → + friends-of-friends
// community → everyone

// explore "layers" query param (comma-separated): self | circle | extended | community
// → filters results by relationship type. Unknown values are ignored;
//   if nothing valid remains, the call behaves as if no layers param was sent.
```

Visibility is enforced server-side — you will simply never *receive* items you can't see
(one exception: `GET /api/experiences/:id` returns `403 NOT_VISIBLE` instead of `404` when
the experience exists but is hidden from you; profiles of blocked users return `404`).

---

## 3. Shared TypeScript types

Drop this block into your frontend (`api/types.ts`):

```ts
/** Error body — every non-2xx response has this. */
export interface ApiError {
  error: {
    code: string;           // e.g. 'INVALID_TOKEN', 'ALREADY_FRIENDS' — switch on this
    message: string;        // human-readable, safe to show in dev/toasts
    details?: unknown;      // shape depends on code (see error catalog)
  };
}

/** Full user — only ever the logged-in user (has email). */
export interface AuthUser {
  id: string;               // uuid
  email: string;
  name: string;
  avatarPath: string | null; // '/uploads/<file>' — prefix with base URL
  bio: string | null;
  createdAt: string;         // ISO-8601
}

/** Compact user — other people, in lists/search/friends. No email. */
export interface SlimUser {
  id: string;
  name: string;
  avatarPath: string | null;
  bio: string | null;
}

export interface Relationship {
  type: 'self' | 'direct_friend' | 'friend_of_friend' | 'none';
  label: 'You' | 'Your Circle' | 'Extended Circle' | 'Community';
}

export interface Photo {
  id: string;
  url: string;              // '/uploads/<file>'
  position: number;
}

export interface Place {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  distanceM?: number;       // present only when the request had lat/lng
  experienceCount?: number; // detail + search only (viewer-aware)
  avgRating: number | null; // detail + search only; 1 decimal, e.g. 4.3
  coverPhoto: string | null; // detail + search only (the place's own photo); see §4 Places
}

/** The card returned everywhere experiences are listed. */
export interface ExperienceCard {
  id: string;
  rating: number;           // 1–5
  review: string;
  visitedAt: string;        // 'YYYY-MM-DD'
  createdAt: string;        // timestamp (ISO or Postgres format — see Dates)
  relationship: Relationship;
  reviewer: { id: string; name: string; avatarPath: string | null };
  place: {
    id: string;
    name: string;
    category: string | null;
    address: string | null;
    city: string | null;
    lat: number;
    lng: number;
    distanceM?: number;
  };
  photos: Photo[];
}

/** GET/PATCH /api/experiences/:id and POST response. */
export interface ExperienceDetail extends ExperienceCard {
  visibility: 'circle' | 'extended' | 'community';
  updatedAt: string;
}

export interface FriendEntry {
  user: SlimUser;
  friendsSince: string;
}

export interface FriendRequest {
  requestId: string;
  user: SlimUser;
  createdAt: string;
}

/** GET /users/suggestions — see §4 for the visibility + exclusion rules. */
export interface UserSuggestion {
  user: SlimUser;
  relationship: Relationship; // always 'none' here
  sharedPlaceCount: number;
  sharedPlaces: string[];     // up to 3 names, alphabetical
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
```

---

## 4. Endpoints

Legend: 🔓 = no auth header · 🔒 = `Authorization: Bearer` required.
All request bodies are `Content-Type: application/json` unless noted.
Path params marked `(uuid)` — invalid uuids return `400 VALIDATION_ERROR`.

---

### Auth 🔓

#### `POST /api/auth/register`

```ts
// 201
{
  "data": {
    "user": { "id": "4176b6ff-…", "email": "bilal@trust.dev", "name": "Bilal Ahmed",
              "avatarPath": null, "bio": null, "createdAt": "2026-09-25T10:01:36.836Z" },
    "accessToken": "eyJhbGciOiJIUzI1NiIs…",
    "refreshToken": "hMM5XjXlR5fMLjH3jNr01SFHSs0vjotFRXEZREs91z8ooSGKv4PP40"
  }
}
```

| Body | Rules |
|---|---|
| `email` | valid email, ≤254 — trimmed + lowercased server-side |
| `password` | 8–128 chars |
| `name` | trimmed, 1–80 |

Errors: `400 VALIDATION_ERROR` · `409 EMAIL_TAKEN`.

#### `POST /api/auth/login`

Body `{ email, password }` (password ≥1). **200** → same `AuthSession` shape as register.
Errors: `401 INVALID_CREDENTIALS` (same message for unknown email or wrong password) · `400 VALIDATION_ERROR`.

#### `POST /api/auth/refresh`

```ts
// req                          // 200 (no user object in this response)
{ "refreshToken": "hMM5…" }  →  { "data": { "accessToken": "eyJ…", "refreshToken": "n3w…" } }
```

Errors: `401 INVALID_REFRESH_TOKEN` (unknown, expired, **or already used** — rotation) → log out.

#### `POST /api/auth/logout`

Body `{ "refreshToken": "…" }` → `200 { "data": { "ok": true } }`.
Idempotent: revokes the token if present, never fails for an unknown token.

---

### Users 🔒

#### `GET /api/users/me` → `200`

```json
{ "data": { "user": { "id": "763af22a-…", "email": "ahmed@trust.dev", "name": "Ahmed Khan",
  "avatarPath": null, "bio": "Born in Peshawar. Sunset chaser.", "createdAt": "2026-09-25T10:01:36.836Z" } } }
```

#### `PATCH /api/users/me` → `200 { data: { user: AuthUser } }`

Body: at least one of `name?` (1–80), `bio?` (≤500, `null` clears), `avatarPath?`
(`null` clears; string must match `/uploads/<name>.(jpg|jpeg|png|webp|gif)` — use the id from
[POST /api/uploads](#post-apiuploads)).

Errors: `400 VALIDATION_ERROR` (incl. empty body → "At least one field is required").

#### `GET /api/users/search?q=ahmed&limit=20` → `200`

```json
{ "data": [ { "user": { "id": "8b054d6f-…", "name": "Sara Ali", "avatarPath": null, "bio": "Food…" },
  "relationship": { "type": "direct_friend", "label": "Your Circle" } } ] }
```

| Query | Rules |
|---|---|
| `q` | required, 1–80, case-insensitive name match |
| `limit` | 1–50, default 20 — **no offset, single page** |

Excludes yourself and anyone blocked (either direction). Relationship is only `direct_friend` or `none`.

Note it does **not** exclude pairs with a pending request — those come back as `none`, so
the Add button 409s with `REQUEST_ALREADY_SENT` / `REQUEST_ALREADY_RECEIVED`. Prefer
[suggestions](#get-apiuserssuggestionslimit12) for discovery; handle those codes.

#### `GET /api/users/suggestions?limit=12` → `200`

People who have been to places you have also been to, ranked by how many. This is the
discovery surface for a user with no friends yet — it needs no name to search for.

```json
{ "data": [ {
  "user": { "id": "8b054d6f-…", "name": "Bilal Ahmed", "avatarPath": "/uploads/seed-av-bilal.jpg", "bio": "Museums over malls." },
  "relationship": { "type": "none", "label": "Community" },
  "sharedPlaceCount": 2,
  "sharedPlaces": [ "Bala Hisar Fort", "Peshawar Museum" ]
} ] }
```

| Query | Rules |
|---|---|
| `limit` | 1–25, default **12** |

`sharedPlaces` holds up to 3 place names, alphabetical — enough to render your own
"also at …" line; `sharedPlaceCount` is the true total used for ranking.

**Visibility is applied to the candidate's experience, not just yours.** A shared place
only counts if their experience there is one *you* are allowed to read. This is the whole
point: without it the endpoint would leak that someone visited a place, which is exactly
what a `circle`/`extended` post exists to conceal. So a `circle`-only shared visit is
never suggested, and `relationship` is always `none`.

Excluded: yourself, blocked pairs (either direction), existing friends, and **any pair
with a request already open in either direction** — a suggestion row for someone you
already asked would render an Add button that can only 409.

Ordering: `sharedPlaceCount DESC, name ASC`. **`[]` is a normal, non-error response** —
a viewer with no experiences shares no places, so there is nothing to rank. Show an
empty state that still offers name search; do not treat it as a failure.

Errors: `401 UNAUTHORIZED` · `400 VALIDATION_ERROR`.

#### `GET /api/users/:id` → `200`

```json
{ "data": {
  "user": { "id": "763af22a-…", "name": "Ahmed Khan", "avatarPath": null,
            "bio": "Born in Peshawar. Sunset chaser.", "createdAt": "2026-09-25T10:01:36.836Z" },
  "relationship": { "type": "friend_of_friend", "label": "Extended Circle" },
  "counts": { "experiences": 3, "friends": 1 }
} }
```

- Viewing **your own** id returns the full `AuthUser` (includes `email`) and `relationship: self`.
- Other users never include `email`.
- `counts.experiences` is viewer-aware (only experiences you're allowed to see);
  `counts.friends` is the total accepted count.

Errors: `404 USER_NOT_FOUND` (missing **or blocked either direction**).

#### `GET /api/users/:id/experiences?limit=20&offset=0` → `200`

```json
{ "data": [ /* ExperienceCard[] */ ], "meta": { "limit": 20, "offset": 0 } }  // no total
```

Sorted newest-first, visibility-filtered. Errors: `404 USER_NOT_FOUND`.

---

### Friends 🔒

#### `GET /api/friends` → `200`

```json
{ "data": [ { "user": { "id": "8b054d6f-…", "name": "Sara Ali", "avatarPath": null, "bio": "Food…" },
  "friendsSince": "2026-09-25 10:01:36.851864+00" } ] }
```

#### `GET /api/friends/requests` → `200`

```json
{ "data": {
  "incoming": [ { "requestId": "85fd7ddd-…", "user": { … }, "createdAt": "…" } ],
  "outgoing": []
} }
```

Incoming sorted newest-first; outgoing likewise.

#### `POST /api/friends/request/:userId` → `201`

```json
{ "data": { "request": { "id": "85fd7ddd-…", "status": "pending", "direction": "outgoing" } } }
```

| Error | Code | What to do in UI |
|---|---|---|
| `400` | `SELF_REQUEST` | don't offer "add friend" on your own profile |
| `404` | `USER_NOT_FOUND` | user gone/blocked |
| `409` | `ALREADY_FRIENDS` | show "Friends" state |
| `409` | `REQUEST_ALREADY_SENT` | show "Request sent" state |
| `409` | `REQUEST_ALREADY_RECEIVED` | **`details.requestId`** → show "Accept / Decline" buttons |
| `403` | `BLOCKED` / `YOU_BLOCKED_THEM` | show blocked state |

#### `POST /api/friends/:requestId/accept` → `200`

```json
{ "data": { "friendship": { "id": "…", "status": "accepted",
  "user": { "id": "8b054d6f-…", "name": "Sara Ali", "avatarPath": null, "bio": "Food…" } } } }
```

Errors: `404 REQUEST_NOT_FOUND` — also returned when you're not the addressee or it isn't pending.

#### `POST /api/friends/:requestId/reject` → `200 { "data": { "ok": true } }`

Removes the pending request (same `404 REQUEST_NOT_FOUND` rule as accept).

#### `DELETE /api/friends/:userId` → `200 { "data": { "ok": true } }`

Errors: `404 NOT_FRIENDS`.

#### `POST /api/friends/block/:userId` → `200`

```json
{ "data": { "block": { "id": "…", "blocked": true } } }
```

Replaces any existing friendship/request with a directed block. Errors: `400 SELF_BLOCK` · `404 USER_NOT_FOUND`.

#### `DELETE /api/friends/block/:userId` → `200 { "data": { "blocked": false } }`

Errors: `404 BLOCK_NOT_FOUND`.

#### `GET /api/friends/:userId/relationship` → `200`

```json
{ "data": { "type": "friend_of_friend", "label": "Extended Circle" } }
```

Handy for rendering a profile header before/without loading their experiences.

---

### Places 🔒

#### `GET /api/places/search`

```http
GET /api/places/search?q=bala&lat=34.015&lng=71.58&radius=5000&category=landmark&limit=20&offset=0
```

| Query | Rules |
|---|---|
| `q` | 1–120 — fuzzy name match (trigram + substring), optional |
| `lat`,`lng` | optional **pair** (both or neither), geo radius filter + `distanceM` |
| `radius` | 10–50000 m, default **5000** (only applies with lat/lng) |
| `category` | exact match, ≤60 (e.g. `landmark`, `restaurant`, `cafe`, `museum`, `park`) |
| `limit`/`offset` | 1–100 / ≥0, default 20/0 |

```json
{ "data": [ { "id": "5e6dab8b-…", "name": "Bala Hisar Fort", "category": "landmark",
  "address": "Bala Hisar, Peshawar", "city": "Peshawar", "lat": 34.0151, "lng": 71.5805,
  "distanceM": 47.49760892, "experienceCount": 4, "avgRating": 4.3,
  "coverPhoto": null } ],
  "meta": { "total": 1, "limit": 20, "offset": 0 } }
```

Ordering: distance (if geo) → name similarity (if `q`) → name.
`experienceCount`/`avgRating` are **viewer-aware** — they only count experiences
**visible to the viewer**.

Errors: `400 INVALID_GEO` (only one of lat/lng) · `400 VALIDATION_ERROR`.

#### `coverPhoto` — the place cover image

`coverPhoto` is the place's **own** photo: the one attached to the place itself with
`POST /uploads` and a `placeId`. The creator's first uploaded photo becomes the cover
when the place is created. It is the same for every viewer.

Review photos are deliberately **not** used. A photo attached to an experience belongs
to that reviewer's memory of the place; borrowing it made the cover change with whoever
posted last and handed the place a face its creator never chose.

`null` is a normal result, not an error: the place has no photo of its own yet. The app
renders it without a hero, and gives its map pin a monogram instead.

Returned by `GET /places/search`, `GET /places/nearby`, `GET /places/:id` and the dedup
branch of `POST /places`. `null` on `POST /places` when a place is newly inserted — no
photo has been uploaded yet. Not carried on the `place` nested inside an `ExperienceCard`
(that projection stays small; its own `photos[]` is the source).

Prefix the base URL as usual — the path is relative.

#### `GET /api/places/nearby` — same as search, but `lat`+`lng` **required** (`VALIDATION_ERROR` if missing), `q`/`category` optional.

#### `GET /api/places/:id` → `200 { "data": Place }`

Place + viewer-aware `experienceCount`/`avgRating`, plus the place's own `coverPhoto`
(`avgRating: null` when nothing visible). Errors: `404 PLACE_NOT_FOUND`.

#### `GET /api/places/:id/experiences?limit&offset` → `200`

`{ "data": ExperienceCard[], "meta": { "limit", "offset" } }` — newest-first, visibility-filtered.
Errors: `404 PLACE_NOT_FOUND`.

#### `POST /api/places` — dedup-aware create

```ts
// body
{ "name": "Balahisar Fort!", "lat": 34.0152, "lng": 71.5806,
  "category": "landmark" | null, "address": "…" | null, "city": "…" | null }
```

`name` 1–140 (must contain a letter/number), `lat` −90…90, `lng` −180…180 (required).

**The important part** — check `meta.created`:

| Response | Meaning |
|---|---|
| `201` `meta.created: true` | new place inserted; `data.id` is the new id, `coverPhoto` is `null` (no place photo yet) |
| `200` `meta.created: false` | matched an existing place — `data` is *that* place, including its `coverPhoto`. Use its `id` instead of creating a duplicate. |

A match needs name similarity `> 0.6` on the normalised name, **and** either:

- the new place's `city` matches the candidate's (case-insensitive trigram similarity
  `> 0.4`, so `peshawer` matches `Peshawar`) and the two points are within **50 km**; or
- no city match, but the two points are within **30 km**.

The city is the range, not the street: the same venue recorded from the other side of
Peshawar is still the same venue. The 50 km cap stops a wrong city label from merging a
place across the country.

```json
{ "data": { "id": "5e6dab8b-…", "name": "Bala Hisar Fort", … }, "meta": { "created": false } }
```

Errors: `400 INVALID_NAME` · `400 VALIDATION_ERROR`.

---

### Experiences 🔒

#### `POST /api/experiences` → `201 { "data": ExperienceDetail }`

```ts
{
  placeId: string;            // uuid
  rating: number;             // integer 1–5 — must be a JSON number, not "5"
  reviewText: string;         // required, trimmed, 1–2000
  visitedAt: string;          // 'YYYY-MM-DD', today or earlier (UTC)
  visibility: 'circle' | 'extended' | 'community';
  photoIds?: string[];        // 0–10 ids from POST /api/uploads (attach happens now)
}
```

Errors:

| Status | Code | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | shape/types (e.g. `rating` as string) |
| `400` | `VISITED_AT_FUTURE` / `INVALID_VISITED_AT` | future or unparseable date |
| `400` | `INVALID_PHOTOS` | `details.photoIds` — not yours or unknown |
| `400` | `PHOTOS_ATTACHED` | photo already attached to a different experience |
| `404` | `PLACE_NOT_FOUND` | bad `placeId` |

#### `GET /api/experiences/:id` → `200 { "data": ExperienceDetail }`

```jsonc
{
  "data": {
    "id": "eaa01a3b-…", "rating": 4,
    "review": "Historic fort with great city views. Gets crowded on weekends.",
    "visitedAt": "2026-08-22", "createdAt": "2026-09-25 10:01:36.940612+00",
    "relationship": { "type": "self", "label": "You" },
    "reviewer": { "id": "763af22a-…", "name": "Ahmed Khan", "avatarPath": null },
    "place": { "id": "5e6dab8b-…", "name": "Bala Hisar Fort", "category": "landmark",
               "address": "Bala Hisar, Peshawar", "city": "Peshawar", "lat": 34.0151, "lng": 71.5805 },
    "photos": [],
    "visibility": "community",
    "updatedAt": "2026-09-25 10:01:36.940612+00"
  }
}
```

| Status | Code | Meaning |
|---|---|---|
| `404` | `EXPERIENCE_NOT_FOUND` | doesn't exist |
| `403` | `NOT_VISIBLE` | exists but hidden by visibility/blocks — **distinguish this from 404 in UI** |

#### `PATCH /api/experiences/:id` → `200 { "data": ExperienceDetail }`

Body: **at least one** of `rating?`, `reviewText?`, `visitedAt?`, `visibility?`, `photoIds?`
(same rules as create). Passing `photoIds` is the full desired order — omitted ids get detached
(their upload rows survive and can be reused).

Errors: `403 NOT_OWNER` (not yours) · `404 EXPERIENCE_NOT_FOUND` · same `400`s as create.

#### `DELETE /api/experiences/:id` → `200 { "data": { "ok": true } }`

Owner only (`403 NOT_OWNER`); attached photo **files are deleted from disk**.

---

### Uploads 🔒

Two-step flow: **upload first**, then reference the returned `id` in `photoIds`.

#### `POST /api/uploads` — `multipart/form-data`, field name **`file`**

```ts
const form = new FormData();
form.append('file', fileInput.files[0]);           // image/jpeg | png | webp | gif, ≤ 5 MB
const res = await api('/api/uploads', { method: 'POST', body: form }); // no Content-Type header!
const { id, url } = (await res.json()).data;
// → 201
// { "data": { "id": "65212156-…", "url": "/uploads/910b50e5-….png", "position": 0 } }
```

Errors: `400 NO_FILE` (wrong/missing field) · `400 UPLOAD_ERROR` (size >5 MB or bad multipart) ·
`415 UNSUPPORTED_TYPE` (not jpeg/png/webp/gif).

Don't set `Content-Type: multipart/form-data` manually — the browser must add the boundary
(the [fetch wrapper](#full-client-with-auto-refresh-copy-paste) does this correctly via `Headers`).

Use `url` for immediate preview (`baseUrl + url`); use `id` as `photoIds[0]` when creating the
experience. Unused uploads stay owned by you (list/reuse later); `DELETE /api/uploads/:photoId`
removes row + file (`404 PHOTO_NOT_FOUND` · `403 NOT_OWNER`).

---

### Explore 🔒

#### `GET /api/explore/nearby` — the core feed

```http
GET /api/explore/nearby?lat=34.015&lng=71.580&radius=5000&layers=circle,extended&limit=30&offset=0
```

| Query | Rules |
|---|---|
| `lat`,`lng` | **required** |
| `radius` | 10–50000 m, default 5000 |
| `layers` | optional, comma-separated `self,circle,extended,community` — filter by relationship. Default: all |
| `limit`/`offset` | 1–100 / ≥0, default **30**/0 |

```jsonc
{
  "data": [ /* ExperienceCard[] — place includes distanceM, sorted nearest first */ ],
  "meta": {
    "total": 5, "limit": 2, "offset": 0,
    "center": { "lat": 34.015, "lng": 71.58 },
    "radiusM": 5000,
    "layers": [ "Your Circle", "Extended Circle" ]   // labels actually applied
  }
}
```

Real first item:

```json
{
  "id": "09f1049e-…", "rating": 5,
  "review": "Beautiful place with an amazing view. Go early to beat the heat.",
  "visitedAt": "2026-09-12", "createdAt": "2026-09-25 10:01:36.947708+00",
  "relationship": { "type": "direct_friend", "label": "Your Circle" },
  "reviewer": { "id": "8b054d6f-…", "name": "Sara Ali", "avatarPath": null },
  "place": { "id": "5e6dab8b-…", "name": "Bala Hisar Fort", "category": "landmark",
             "address": "Bala Hisar, Peshawar", "city": "Peshawar",
             "lat": 34.0151, "lng": 71.5805, "distanceM": 47.49760892 },
  "photos": []
}
```

Pipeline (what the server does with your request):
PostGIS radius → experiences at those places → **visibility filter** (you only ever receive
visible items) → **relationship annotation** → `layers` filter → order by distance, then newest.

---

## 5. Error code catalog

Switch on `error.code` — messages are for humans/logs, codes are for logic.

| Status | Code | Raised by | Frontend action |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | everywhere | map `details[].path` → field errors |
| 400 | `UPLOAD_ERROR` | uploads | show size/format message |
| 400 | `NO_FILE` | uploads | bug — wrong FormData field name |
| 400 | `INVALID_GEO` | places search | send lat **and** lng or neither |
| 400 | `INVALID_NAME` | place create | name needs a letter/number |
| 400 | `VISITED_AT_FUTURE` / `INVALID_VISITED_AT` | experience create/patch | clamp date picker to today |
| 400 | `INVALID_PHOTOS` / `PHOTOS_ATTACHED` | experience create/patch | re-upload or fix `photoIds` |
| 400 | `SELF_REQUEST` / `SELF_BLOCK` | friends | hide action on own profile |
| 401 | `UNAUTHORIZED` | middleware | missing/bad `Authorization` header — attach token |
| 401 | `INVALID_TOKEN` | middleware | access token expired → **refresh + retry once** |
| 401 | `INVALID_REFRESH_TOKEN` | refresh | session dead → clear tokens, show login |
| 401 | `INVALID_CREDENTIALS` | login | show "invalid email or password" |
| 403 | `NOT_VISIBLE` | experience detail | content hidden from this viewer — treat as locked/absent |
| 403 | `NOT_OWNER` | experience, uploads | hide edit/delete controls (or render read-only) |
| 403 | `BLOCKED` / `YOU_BLOCKED_THEM` | friend request | show blocked state |
| 404 | `NOT_FOUND` | unknown route | bug or stale URL |
| 404 | `USER_NOT_FOUND` | users, friends | profile gone **or blocked** (both look like 404 by design) |
| 404 | `PLACE_NOT_FOUND` | places | place gone |
| 404 | `EXPERIENCE_NOT_FOUND` | experiences | deleted |
| 404 | `REQUEST_NOT_FOUND` | friend accept/reject | already handled elsewhere — refresh list |
| 404 | `NOT_FRIENDS` | unfriend | refresh friends list |
| 404 | `BLOCK_NOT_FOUND` | unblock | already unblocked — refresh |
| 404 | `PHOTO_NOT_FOUND` | uploads delete | already gone |
| 409 | `EMAIL_TAKEN` | register | "account already exists — log in?" |
| 409 | `ALREADY_FRIENDS` | friend request | switch card to Friends state |
| 409 | `REQUEST_ALREADY_SENT` | friend request | switch to "pending (yours)" |
| 409 | `REQUEST_ALREADY_RECEIVED` | friend request | use `details.requestId` → show Accept/Decline |
| 415 | `UNSUPPORTED_TYPE` | uploads | only jpeg/png/webp/gif |
| 500 | `INTERNAL_ERROR` | anywhere | generic retry/toast + log |

---

## 6. Recipes

### Paginated feed (infinite scroll)

```ts
async function loadExplore(page: number, layers?: string[]) {
  const params = new URLSearchParams({
    lat: '34.015', lng: '71.58', radius: '5000',
    limit: '30', offset: String(page * 30),
    ...(layers ? { layers: layers.join(',') } : {}),
  });
  const res = await api(`/api/explore/nearby?${params}`);
  if (!res.ok) throw new Error((await res.json()).error.code);
  const body = await res.json();
  return {
    items: body.data as ExperienceCard[],
    hasMore: body.meta.offset + body.meta.limit < body.meta.total,
  };
}
```

### Attach photos when posting an experience

```ts
async function postExperience(input: {
  placeId: string; rating: number; reviewText: string; visitedAt: string;
  visibility: 'circle' | 'extended' | 'community'; files: File[];
}) {
  // 1. upload first
  const photoIds: string[] = [];
  for (const file of input.files) {
    const form = new FormData();
    form.append('file', file);
    const res = await api('/api/uploads', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error.code); // UNSUPPORTED_TYPE, UPLOAD_ERROR…
    photoIds.push((await res.json()).data.id);
  }

  // 2. create with the ids
  const res = await api('/api/experiences', {
    method: 'POST',
    body: JSON.stringify({ ...input, photoIds, files: undefined }),
  });
  if (!res.ok) throw new Error((await res.json()).error.code);
  return (await res.json()).data as ExperienceDetail;
}
```

### Create-place dedup (don't assume 201)

```ts
const res = await api('/api/places', { method: 'POST', body: JSON.stringify(placeDraft) });
const body = await res.json();
const place: Place = body.data;
if (!body.meta.created) {
  toast(`Matched existing place: ${place.name}`); // reuse place.id — no duplicate was made
}
return place;
```

### Relationship badge

```tsx
const badgeColor: Record<Relationship['type'], string> = {
  self: 'bg-zinc-200 text-zinc-900',
  direct_friend: 'bg-emerald-100 text-emerald-800',      // "Your Circle"
  friend_of_friend: 'bg-amber-100 text-amber-800',       // "Extended Circle"
  none: 'bg-sky-100 text-sky-800',                       // "Community"
};
// <span className={badgeColor[card.relationship.type]}>{card.relationship.label}</span>
// Note: label comes pre-localized from the server — render it directly.
```

### Friend request state machine (client-side)

```ts
async function requestState(targetId: string): Promise<
  'none' | 'friends' | 'outgoing' | 'incoming'
> {
  const rel = await (await api(`/api/friends/${targetId}/relationship`)).json();
  if (rel.data.type === 'direct_friend') return 'friends';
  const { incoming, outgoing } = (await (await api('/api/friends/requests')).json()).data;
  if (incoming.some((r: FriendRequest) => r.user.id === targetId)) return 'incoming';
  if (outgoing.some((r: FriendRequest) => r.user.id === targetId)) return 'outgoing';
  return 'none';
}
```

Note on blocks: `relationship` returns `none` for blocked pairs too — the reliable signals are
`404` from `GET /api/users/:id` (profile hidden) and `403 BLOCKED`/`YOU_BLOCKED_THEM` if you
attempt `POST /api/friends/request/:userId`.

---

## 7. Test accounts (seeded)

Run `npm run db:seed` to (re)create. Password for **all**: `password123`.

```
ahmed@trust.dev   ↔ sara@trust.dev     (direct friends)
sara@trust.dev    ↔ bilal@trust.dev    (direct friends)
→ ahmed ↔ bilal = friend_of_friend (Extended Circle)
hamza@trust.dev, ayesha@trust.dev, omar@trust.dev   (no accepted links → Community)
```

Seven more accounts exist so the feed is not a two-user demo:

```
zainab@trust.dev  usman@trust.dev  kiran@trust.dev  nadia@trust.dev  omar@trust.dev
hey@gmail.com     something@gmail.com          <- the app's own signups
```

Second cluster (all accepted): `ahmed ↔ usman`, `ahmed ↔ zainab`, `sara ↔ kiran`,
`zainab ↔ kiran`, `usman ↔ nadia`. These produce more `friend_of_friend` pairs, e.g.
`ahmed ↔ kiran` via zainab.

Four **pending** requests are seeded so accept/decline can be demoed from one device:
`omar → hamza`, `ayesha → sara`, `hey → hamza`, `something → bilal`. A pending request is
not a relationship, so hamza, ayesha and omar stay Community-only.

`hey@gmail.com` and `something@gmail.com` are the accounts signed up through the app.
They are in the seed because `db:seed` truncates `users` — anything hand-created would not
survive a re-seed. Log in as `hey@gmail.com` / `password123` to see a populated Circle
screen and [suggestions](#get-apiuserssuggestionslimit12) on a brand-new account.

- Ahmed has **circle + extended + community** experiences at Bala Hisar Fort (34.0151, 71.5805) —
  perfect for checking `403 NOT_VISIBLE` vs `200`. As `bilal` you see 4 of the 5 experiences
  there (his `circle` one is hidden); as `ayesha` you see 3 (community only).
- Feed center: `lat=34.015&lng=71.58` → **9 places within 5 km**, **11 within 50 km**.
  Nearest: Bala Hisar Fort 47 m, Namak Food Street 609 m, Coffee Planet 640 m.
  Nowshera Fort is ~40 km (in at 50 km); Saidu Sharif, Mansehra Lake, Faisal Mosque,
  Nathia Gali and Lahore Fort are all beyond the 50 km radius cap.
- Every seeded user has a real portrait at `/uploads/seed-av-*.jpg`.
- Experience photos are Unsplash images downloaded into `UPLOAD_DIR` and served from
  `/uploads/seed-*.jpg`. They are ordinary upload paths — the frontend treats them like
  any other image URL and should prefix the base URL as usual.

> The photos come from [Unsplash](https://unsplash.com) and are for local development only.
> `scripts/unsplash.ts` holds the curated photo ids; `npm run db:seed` re-downloads any that
> are missing and deletes stale `seed-*` files, so re-running is cheap and offline-safe.

---

## Development (backend)

```bash
npm run dev          # tsx watch on :3000
npm run db:migrate   # apply migrations
npm run db:reset     # drop + recreate + migrate (dev DB)
npm run db:seed      # reset dev data (see above)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest (integration tests against trustcircle_test)
```

Database: Postgres 16 + PostGIS in Docker (`trust-circle-postgres`, port 5433).
See `.env.example` for all configuration (`PORT`, `ACCESS_TOKEN_TTL`, `MAX_UPLOAD_MB`, …).
