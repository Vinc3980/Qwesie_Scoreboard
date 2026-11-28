-- League standings and fixtures
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "points_rule" JSONB;
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "standings_config" JSONB;

ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "group" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "round" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "forfeit_winner_side" "TeamSide";

CREATE INDEX IF NOT EXISTS "matches_competition_id_division_idx" ON "matches"("competition_id", "division");
CREATE INDEX IF NOT EXISTS "matches_competition_id_scheduled_at_idx" ON "matches"("competition_id", "scheduled_at");
