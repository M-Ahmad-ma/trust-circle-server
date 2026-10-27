-- A photo can belong to a place directly, not only to an experience.
--
-- Places are shared records with no audience of their own, so a photo attached
-- to one is visible to whoever can see the place — unlike an experience photo,
-- which is gated by the experience's visibility. `experience_id` stays nullable
-- so a photo can still be an experience's, a place's, or neither.
ALTER TABLE photos ADD COLUMN place_id uuid REFERENCES places(id) ON DELETE CASCADE;

CREATE INDEX photos_place_idx ON photos (place_id, position);
