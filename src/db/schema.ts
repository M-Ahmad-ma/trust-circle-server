import { pgTable, uuid, text, timestamp, date, smallint, integer, pgEnum, index } from 'drizzle-orm/pg-core';

export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted', 'blocked']);
export const experienceVisibilityEnum = pgEnum('experience_visibility', ['circle', 'extended', 'community']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  avatarPath: text('avatar_path'),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    hashIdx: index('refresh_tokens_hash_idx').on(t.tokenHash),
  })
);

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    requesterIdx: index('friendships_requester_idx').on(t.requesterId, t.status),
    addresseeIdx: index('friendships_addressee_idx').on(t.addresseeId, t.status),
  })
);

// NOTE: location is PostGIS geography(Point,4326) — always projected explicitly
// (ST_X/ST_Y/ST_AsGeoJSON) in queries; never selected raw.
export const places = pgTable('places', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  category: text('category'),
  address: text('address'),
  city: text('city'),
  location: text('location').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const experiences = pgTable(
  'experiences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    reviewText: text('review_text').notNull(),
    visitedAt: date('visited_at').notNull(),
    visibility: experienceVisibilityEnum('visibility').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    placeIdx: index('experiences_place_idx').on(t.placeId),
    userIdx: index('experiences_user_idx').on(t.userId),
    createdIdx: index('experiences_created_idx').on(t.createdAt),
  })
);

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    experienceId: uuid('experience_id').references(() => experiences.id, { onDelete: 'cascade' }),
    /**
     * Set when the photo was added to the place itself rather than to an
     * experience about it. A place photo is the place's own cover; unlike an
     * experience photo it is not gated by any experience's visibility, because
     * the place has none.
     */
    placeId: uuid('place_id').references(() => places.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('photos_owner_idx').on(t.ownerId),
    experienceIdx: index('photos_experience_idx').on(t.experienceId),
    placeIdx: index('photos_place_idx').on(t.placeId),
  })
);

export type User = typeof users.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Place = typeof places.$inferSelect;
export type Experience = typeof experiences.$inferSelect;
export type Photo = typeof photos.$inferSelect;
