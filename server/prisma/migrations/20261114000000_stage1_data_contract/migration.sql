-- Stage 1: data contract, branding, auth, persisted broadcast output state

-- Enums
ALTER TYPE "MatchEventType" ADD VALUE IF NOT EXISTS 'UNDO';
ALTER TYPE "BroadcastGraphicType" ADD VALUE IF NOT EXISTS 'SCENE';
DO $$ BEGIN
  CREATE TYPE "BroadcastScene" AS ENUM ('PLAY','SET_BREAK','TIMEOUT','MATCH_STATS','LINEUPS','HEAD_TO_HEAD','PLAYER_SPOTLIGHT','FINAL','BREAK_SLATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Teams branding
ALTER TABLE "teams" ALTER COLUMN "short_name" SET NOT NULL;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "primary_color" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "secondary_color" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "text_color" TEXT;

-- Players
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "jersey_number" INTEGER;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
ALTER TABLE "players" ALTER COLUMN "position" TYPE TEXT;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "is_captain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "is_libero" BOOLEAN NOT NULL DEFAULT false;

-- Users
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

-- Matches
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;

-- Match events idempotency
ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "client_event_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "match_event_client_id_unique" ON "match_events"("match_id", "client_event_id");

-- Broadcast graphic/output state
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "scene" "BroadcastScene";
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "scorebug_visible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "scorebug_variant" TEXT;
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "scorebug_position" TEXT;
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "scorebug_scale" DOUBLE PRECISION;
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "lock_scene" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "broadcast_graphic_states" ADD COLUMN IF NOT EXISTS "timer_ends_at" TIMESTAMP(3);
