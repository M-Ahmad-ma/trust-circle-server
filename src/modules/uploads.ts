import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../db/client';
import { photos, places } from '../db/schema';
import { ApiError } from '../middleware/auth';
import { parse } from '../middleware/validate';

export const uploadsRouter = Router();

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!MIME_TO_EXT[file.mimetype]) {
      cb(new ApiError(415, 'UNSUPPORTED_TYPE', 'Only jpeg, png, webp and gif images are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('file');

const photoIdParam = z.string().uuid();

/** POST /api/uploads — multipart upload (field name: "file") */
uploadsRouter.post('/', upload, async (req, res) => {
  const viewerId = req.userId!;
  if (!req.file) {
    throw new ApiError(400, 'NO_FILE', 'A file field "file" is required');
  }

  // Optional: attach the photo to a place instead of leaving it unattached.
  // A photo with neither an experience nor a place is owned and reusable, which
  // is what makes a failed publish recoverable.
  //
  // A text part lands in `req.body` whatever order the parts arrive in — busboy
  // emits it as a field and multer waits for the whole body before handing over
  // — so this does not depend on the client putting `placeId` first.
  const placeIdRaw = typeof req.body?.placeId === 'string' ? req.body.placeId.trim() : '';
  let placeId: string | null = null;
  if (placeIdRaw) {
    placeId = parse(photoIdParam, placeIdRaw);
    const [placeRow] = await db
      .select({ id: places.id })
      .from(places)
      .where(eq(places.id, placeId))
      .limit(1);
    if (!placeRow) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found');
  }

  const ext = MIME_TO_EXT[req.file.mimetype];
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);

  const url = `/uploads/${filename}`;
  const [row] = await db
    .insert(photos)
    .values({ ownerId: viewerId, path: url, placeId })
    .returning();

  res.status(201).json({ data: { id: row.id, url: row.path, position: row.position } });
});

/** DELETE /api/uploads/:photoId — owner only; removes file from disk */
uploadsRouter.delete('/:photoId', async (req, res) => {
  const viewerId = req.userId!;
  const photoId = parse(photoIdParam, req.params.photoId);

  const [row] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  if (!row) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'Photo not found');
  if (row.ownerId !== viewerId) {
    throw new ApiError(403, 'NOT_OWNER', 'You can only delete your own photos');
  }

  await db.delete(photos).where(eq(photos.id, photoId));
  try {
    fs.unlinkSync(path.join(path.resolve(env.UPLOAD_DIR), path.basename(row.path)));
  } catch {
    // already gone
  }

  res.json({ data: { ok: true } });
});
