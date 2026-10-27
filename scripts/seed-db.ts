import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db, pool, rowsOf } from '../src/db/client';
import { env } from '../src/config/env';
import { runMigrations } from '../src/db/migrate';
import { hashPassword } from '../src/lib/password';
import { normalizePlaceName } from '../src/lib/normalize';
import { experiences, friendships, photos, users } from '../src/db/schema';
import { photoFilename, photoUrl, unsplashUrl, type PhotoKey } from './unsplash';
import { EXPERIENCES, FRIENDSHIPS, PASSWORD, PLACES, USERS, referencedPhotoKeys } from './seed-data';

/**
 * Seeds the dev database with a believable dataset: 10 users, a social graph that
 * exercises every relationship level, 16 places, ~45 experiences, and real Unsplash
 * photographs downloaded into UPLOAD_DIR (so they are served from /uploads/... like
 * any user upload, and the app's absoluteUrl() helper keeps working).
 */

// ---------- image fetching ----------

async function downloadImage(url: string, attempts = 3): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      return buf;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw new Error(`failed to download ${url}: ${(lastErr as Error).message}`);
}

/**
 * Ensures every referenced photo exists on disk, deleting stale seed-* files that the
 * dataset no longer references. Re-running is cheap: existing files are left alone.
 */
async function syncImages(uploadDir: string, keys: PhotoKey[]): Promise<void> {
  const wanted = new Set(keys.map(photoFilename));

  for (const f of fs.readdirSync(uploadDir)) {
    if (f.startsWith('seed-') && !wanted.has(f)) fs.unlinkSync(path.join(uploadDir, f));
  }

  let downloaded = 0;
  let reused = 0;
  for (const [i, key] of keys.entries()) {
    const dest = path.join(uploadDir, photoFilename(key));
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      reused++;
      continue;
    }
    const buf = await downloadImage(unsplashUrl(key));
    fs.writeFileSync(dest, buf);
    downloaded++;
    process.stdout.write(`\r  images ${i + 1}/${keys.length}  (+${downloaded}, ${reused} cached)   `);
  }
  process.stdout.write(`\r  images: ${downloaded} downloaded, ${reused} already on disk       \n`);
}

// ---------- seed ----------

async function main(): Promise<void> {
  await runMigrations(pool, (m) => console.log(`  ${m}`));

  console.log('resetting dev tables...');
  await pool.query('TRUNCATE users, friendships, refresh_tokens, places, experiences, photos CASCADE');

  const uploadDir = path.resolve(env.UPLOAD_DIR);
  fs.mkdirSync(uploadDir, { recursive: true });

  const photoKeys = referencedPhotoKeys();
  console.log(`\nsyncing ${photoKeys.length} Unsplash photos into ${uploadDir} ...`);
  await syncImages(uploadDir, photoKeys);
  const distinctFiles = fs.readdirSync(uploadDir).filter((f) => f.startsWith('seed-')).length;

  // --- users ---
  const passwordHash = hashPassword(PASSWORD);
  const insertedUsers = await db
    .insert(users)
    .values(
      USERS.map((u) => ({
        email: u.email,
        name: u.name,
        bio: u.bio,
        passwordHash,
        avatarPath: photoUrl(u.avatar),
      }))
    )
    .returning();

  const idByKey = new Map<string, string>();
  USERS.forEach((u, i) => idByKey.set(u.key, insertedUsers[i].id));

  // --- friendships ---
  await db.insert(friendships).values(
    FRIENDSHIPS.map((f) => ({
      requesterId: idByKey.get(f.from)!,
      addresseeId: idByKey.get(f.to)!,
      status: f.status,
    }))
  );

  // --- places ---
  const placeIds = new Map<string, string>();
  for (const p of PLACES) {
    const rows = rowsOf<{ id: string }>(
      await db.execute(sql`
        INSERT INTO places (name, normalized_name, category, address, city, location, created_by)
        VALUES (
          ${p.name}, ${normalizePlaceName(p.name)}, ${p.category}, ${p.address}, ${p.city},
          ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography, ${idByKey.get('ahmed')!}
        )
        RETURNING id
      `)
    );
    placeIds.set(p.key, rows[0].id);
  }

  // --- experiences ---
  const experienceIds: string[] = [];
  for (const e of EXPERIENCES) {
    const [row] = await db
      .insert(experiences)
      .values({
        userId: idByKey.get(e.author)!,
        placeId: placeIds.get(e.place)!,
        rating: e.rating,
        reviewText: e.review,
        visitedAt: e.visitedAt,
        visibility: e.visibility,
      })
      .returning();
    experienceIds.push(row.id);
  }

  // --- photos ---
  // Place cover photos are attached to the first experience at that place so they
  // show up on place pages and the map bottom-sheet; avatars live on users.avatarPath.
  const photoRows: { ownerId: string; experienceId: string; path: string; position: number }[] = [];
  const claimed = new Set<string>();

  for (const [i, exp] of EXPERIENCES.entries()) {
    if (!exp.photos) continue;
    exp.photos.forEach((key, position) => {
      claimed.add(key);
      photoRows.push({
        ownerId: idByKey.get(exp.author)!,
        experienceId: experienceIds[i],
        path: photoUrl(key),
        position,
      });
    });
  }
  for (const p of PLACES) {
    p.photos.forEach((key, position) => {
      if (claimed.has(key)) return;
      claimed.add(key);
      const firstExp = EXPERIENCES.findIndex((e) => e.place === p.key);
      if (firstExp < 0) return;
      photoRows.push({
        ownerId: idByKey.get('ahmed')!,
        experienceId: experienceIds[firstExp],
        path: photoUrl(key),
        position: 90 + position,
      });
    });
  }
  await db.insert(photos).values(photoRows);

  // --- summary ---
  const counts = rowsOf<{ n: string }>(await db.execute(sql`
    SELECT (SELECT count(*) FROM users)::text || ' users, ' ||
           (SELECT count(*) FROM friendships WHERE status = 'accepted')::text || ' friendships (' ||
           (SELECT count(*) FROM friendships WHERE status = 'pending')::text || ' pending), ' ||
           (SELECT count(*) FROM places)::text || ' places, ' ||
           (SELECT count(*) FROM experiences)::text || ' experiences, ' ||
           (SELECT count(*) FROM photos)::text || ' photos' AS n
  `));
  const nearby = rowsOf<{ r5: string; r50: string }>(await db.execute(sql`
    SELECT
      (SELECT count(*) FROM places WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(71.58, 34.015), 4326)::geography, 5000))::text AS r5,
      (SELECT count(*) FROM places WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(71.58, 34.015), 4326)::geography, 50000))::text AS r50
  `));

  console.log('\n=== SEED COMPLETE ===\n');
  console.log(`Users (password for all: ${PASSWORD}):`);
  for (const u of USERS) console.log(`  ${u.email.padEnd(22)} ${u.name}`);
  console.log('\nFriendships (accepted):');
  console.log('  ahmed ↔ sara, sara ↔ bilal   → ahmed ↔ bilal = friend_of_friend');
  console.log('  ahmed ↔ usman, ahmed ↔ zainab, sara ↔ kiran, zainab ↔ kiran, usman ↔ nadia');
  console.log('  hamza, ayesha, omar have no accepted links → Community');
  console.log('Pending requests: omar → hamza, ayesha → sara (for accept/decline demo)');
  console.log(`\n${counts[0].n}`);
  console.log(`Feed centre 34.015,71.58 → ${nearby[0].r5} places within 5 km, ${nearby[0].r50} within 50 km`);
  console.log(
    `${distinctFiles} distinct image files on disk in ${uploadDir} (${photoRows.length} photo rows — ` +
      `a few images are shared between experiences at the same kind of place)`
  );
  console.log('\nTry:');
  console.log('  curl -s -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \\');
  console.log('    -d \'{"email":"ahmed@trust.dev","password":"password123"}\' | jq -r .data.accessToken');
  console.log('  curl -s "localhost:3000/api/explore/nearby?lat=34.015&lng=71.58&radius=5000" -H "Authorization: Bearer $TOKEN" | jq \'.data[0]\'');
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });