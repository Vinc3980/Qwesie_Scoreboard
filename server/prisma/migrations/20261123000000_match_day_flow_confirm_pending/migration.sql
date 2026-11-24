-- Match-day flow: confirm-set-end and pending-end state
ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "confirm_set_end" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "match_sets"
  ADD COLUMN IF NOT EXISTS "pending_end" BOOLEAN NOT NULL DEFAULT false;
