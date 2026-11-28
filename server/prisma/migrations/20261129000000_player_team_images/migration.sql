-- Player/Team image keys and team staff fields.
-- Store object keys (not full URLs) in DB; resolve public URLs at read time.
ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "logo_key" TEXT,
  ADD COLUMN IF NOT EXISTS "logo_thumb_key" TEXT,
  ADD COLUMN IF NOT EXISTS "coach_name" TEXT,
  ADD COLUMN IF NOT EXISTS "coach_photo_key" TEXT,
  ADD COLUMN IF NOT EXISTS "coach_photo_thumb_key" TEXT,
  ADD COLUMN IF NOT EXISTS "assistant_coach_name" TEXT,
  ADD COLUMN IF NOT EXISTS "manager_name" TEXT,
  ADD COLUMN IF NOT EXISTS "team_photo_key" TEXT,
  ADD COLUMN IF NOT EXISTS "team_photo_thumb_key" TEXT;

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "height_cm" INTEGER,
  ADD COLUMN IF NOT EXISTS "photo_key" TEXT,
  ADD COLUMN IF NOT EXISTS "thumb_key" TEXT;

-- Backfill keys from legacy local upload URLs where possible.
-- Keeps legacy photo_url/logo_url as fallback for external/unknown URLs.
UPDATE "teams"
SET "logo_key" = regexp_replace("logo_url", '^/uploads/', '')
WHERE "logo_key" IS NULL
  AND "logo_url" ~ '^/uploads/.+';

UPDATE "players"
SET "photo_key" = regexp_replace("photo_url", '^/uploads/', '')
WHERE "photo_key" IS NULL
  AND "photo_url" ~ '^/uploads/.+';
