-- Composite indexes for the two hot list/lookup queries:
--   * in-play court conflict:  status IN (...) AND court = ?
--   * active match resolution: status IN (...) ORDER BY startedAt/updatedAt
--   * next scheduled match:    status IN (...) ORDER BY scheduledAt
-- IF NOT EXISTS keeps this idempotent on databases created with `db push`.
CREATE INDEX IF NOT EXISTS "matches_status_court_idx" ON "matches"("status", "court");
CREATE INDEX IF NOT EXISTS "matches_status_scheduled_at_idx" ON "matches"("status", "scheduled_at");
