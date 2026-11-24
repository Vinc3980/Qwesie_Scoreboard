-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "TeamId" AS ENUM ('A', 'B');

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "legacy_id" INTEGER,
    "tournament" TEXT NOT NULL DEFAULT 'GREATER ACCRA VOLLEYBALL LEAGUE',
    "division" TEXT NOT NULL DEFAULT 'MEN''S DIVISION',
    "court" TEXT NOT NULL DEFAULT 'COURT 1',
    "match_no" TEXT NOT NULL DEFAULT '24',
    "match_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referee1" TEXT NOT NULL DEFAULT '',
    "referee2" TEXT NOT NULL DEFAULT '',
    "team_a" TEXT NOT NULL DEFAULT 'ELWAK WINGS',
    "team_b" TEXT NOT NULL DEFAULT 'GHANA NAVY',
    "current_set" INTEGER NOT NULL DEFAULT 1,
    "server" "TeamId" NOT NULL DEFAULT 'A',
    "timeouts_a" INTEGER NOT NULL DEFAULT 2,
    "timeouts_b" INTEGER NOT NULL DEFAULT 2,
    "status" "MatchStatus" NOT NULL DEFAULT 'LIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_scores" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "score_a" INTEGER NOT NULL DEFAULT 0,
    "score_b" INTEGER NOT NULL DEFAULT 0,
    "winner" "TeamId",

    CONSTRAINT "set_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_stats" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "team" "TeamId" NOT NULL,
    "kill" INTEGER NOT NULL DEFAULT 0,
    "error" INTEGER NOT NULL DEFAULT 0,
    "ace" INTEGER NOT NULL DEFAULT 0,
    "block" INTEGER NOT NULL DEFAULT 0,
    "dig" INTEGER NOT NULL DEFAULT 0,
    "assist" INTEGER NOT NULL DEFAULT 0,
    "sideout_attempts" INTEGER NOT NULL DEFAULT 0,
    "sideout_wins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "team_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "team" "TeamId" NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "matches_legacy_id_key" ON "matches"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "set_scores_match_id_number_key" ON "set_scores"("match_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "team_stats_match_id_team_key" ON "team_stats"("match_id", "team");

-- CreateIndex
CREATE INDEX "match_events_match_id_created_at_idx" ON "match_events"("match_id", "created_at");

-- AddForeignKey
ALTER TABLE "set_scores" ADD CONSTRAINT "set_scores_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_stats" ADD CONSTRAINT "team_stats_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
