ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "leaderboard_theme_id" TEXT;

CREATE TABLE IF NOT EXISTS "leaderboard_themes" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'leaderboard',
  "config" JSONB NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "competition_id" TEXT,
  "is_built_in" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leaderboard_themes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leaderboard_themes_competition_id_idx" ON "leaderboard_themes"("competition_id");
CREATE INDEX IF NOT EXISTS "leaderboard_themes_is_default_idx" ON "leaderboard_themes"("is_default");
CREATE INDEX IF NOT EXISTS "leaderboard_themes_kind_idx" ON "leaderboard_themes"("kind");
CREATE INDEX IF NOT EXISTS "competitions_leaderboard_theme_id_idx" ON "competitions"("leaderboard_theme_id");

DO $$
BEGIN
  ALTER TABLE "competitions" ADD CONSTRAINT "competitions_leaderboard_theme_id_fkey" FOREIGN KEY ("leaderboard_theme_id") REFERENCES "leaderboard_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "leaderboard_themes" ADD CONSTRAINT "leaderboard_themes_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
