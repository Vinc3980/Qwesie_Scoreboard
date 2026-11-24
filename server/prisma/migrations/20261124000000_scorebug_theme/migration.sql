-- Scorebug Theme Designer: theme table, match override, competition default

CREATE TABLE "scorebug_themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "competition_id" TEXT,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scorebug_themes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "competitions" ADD COLUMN "scorebug_theme_id" TEXT;
ALTER TABLE "matches" ADD COLUMN "scorebug_theme_id" TEXT;

CREATE INDEX "scorebug_themes_competition_id_idx" ON "scorebug_themes"("competition_id");
CREATE INDEX "scorebug_themes_is_default_idx" ON "scorebug_themes"("is_default");
CREATE INDEX "scorebug_themes_is_built_in_idx" ON "scorebug_themes"("is_built_in");
CREATE INDEX "competitions_scorebug_theme_id_idx" ON "competitions"("scorebug_theme_id");
CREATE INDEX "matches_scorebug_theme_id_idx" ON "matches"("scorebug_theme_id");

ALTER TABLE "scorebug_themes" ADD CONSTRAINT "scorebug_themes_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_scorebug_theme_id_fkey" FOREIGN KEY ("scorebug_theme_id") REFERENCES "scorebug_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_scorebug_theme_id_fkey" FOREIGN KEY ("scorebug_theme_id") REFERENCES "scorebug_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
