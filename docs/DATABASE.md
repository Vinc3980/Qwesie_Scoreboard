# Qwesie TV — Database Documentation

## 1. Engine and tooling
- **Database:** PostgreSQL
- **ORM:** Prisma (`server/prisma/schema.prisma`)
- **Migrations:** `server/prisma/migrations/` (initial migration present; schema evolved in later stages—see notes)
- **Seed:** `server/prisma/seed.ts` (safe/dev-oriented initialization)

## 2. Core domain models (Stage 2 schema)
Defined in `server/prisma/schema.prisma` (with timestamps/indexes/constraints/relations; enums for statuses/sides/event types/rules where applicable):

- **Identity/access:** `User`, `Role`
- **Competition structure:** `Competition`, `Tournament`, `Venue`
- **Participants:** `Team`, `Player`
- **Match core:** `Match`, `MatchSet`, `MatchRoster`, `StartingLineup`, `MatchOfficial`
- **Events/audit:** `MatchEvent` (sequenced, typed, payload, correction/reversal/audit linkage), `AuditLog`
- **Operations:** `Timeout`, `Substitution`
- **Statistics:** `PlayerMatchStatistics`, `TeamMatchStatistics`
- **Broadcast:** `BroadcastConfiguration`, `BroadcastGraphicState`

> Refer to `server/prisma/schema.prisma` for authoritative fields, enums, relations, unique constraints, and indexes.

## 3. Relationships (summary)
- Match belongs to competition/tournament/venue context and home/away teams; has sets, rosters, lineups, officials, events, timeouts, substitutions, stats, and broadcast config/state.
- Sets/events/timeouts/substitutions are match-scoped (and set-scoped where relevant) with sequence/timestamps for traceability.
- Player/team statistics link to match (and player/team entities) to support per-match and historical aggregation.
- Events support correction/reversal metadata to enable auditable, recomputable statistics.

## 4. Match lifecycle and rules (persisted/derived)
- Configurable rules stored on match (best-of sets, points, win-by margin, rally scoring, timeouts/substitutions limits).
- Status/lifecycle transitions (scheduled/ready/live/paused/suspended/between sets/completed etc.) tracked with timestamps and events.
- Set scores, winners, serving side, and completion derived/enforced by service/engine logic and persisted.

## 5. Operational notes
- **Generate client:** `npm run prisma:generate`
- **Migrate:** `npm run prisma:migrate` (or `db:push` for dev sync where appropriate)
- **Seed:** `npm run prisma:seed`
- **Local DB scripts (Windows):** `scripts/db-init.ps1`, `db-start.ps1`, `db-stop.ps1`, `setup-db-and-migrate.ps1` (review configured PostgreSQL paths/ports, defaults target port `5433`).
- **Integrity:** completed matches retained; events sequenced/auditable; analytics recomputed from event stream to reduce double-counting on corrections (see services/engines and test report).
- **Known alignment note:** schema evolved significantly after the initial migration; environments should apply/reset migrations appropriate to the current schema before production use. Active graphic/break runtime state is currently in-memory (not fully persisted to broadcast state tables).