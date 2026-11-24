-- Stage A: persist match setup fields
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "venue_type" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "ruleset" TEXT;
