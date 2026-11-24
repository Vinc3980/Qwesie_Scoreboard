-- CreateTable
CREATE TABLE "court_on_air" (
    "id" TEXT NOT NULL,
    "court_key" TEXT NOT NULL,
    "court_label" TEXT NOT NULL,
    "match_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_on_air_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "court_on_air_court_key_key" ON "court_on_air"("court_key");

-- CreateIndex
CREATE INDEX "court_on_air_match_id_idx" ON "court_on_air"("match_id");

-- AddForeignKey
ALTER TABLE "court_on_air" ADD CONSTRAINT "court_on_air_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
