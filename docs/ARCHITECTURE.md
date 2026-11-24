# Qwesie TV — Architecture Documentation

## 1. System overview
Qwesie TV is a TypeScript monorepo for professional volleyball live scoring, broadcast graphics, and match statistics.

- **Client (`client/`)**: React + Vite + TypeScript SPA (Tailwind, shadcn-style UI primitives, Framer Motion, Recharts, React Router, TanStack Query, Socket.IO client). Provides operator control centre, analytics/archive/reporting views, and OBS/browser-source broadcast outputs.
- **Server (`server/`)**: Node.js + Express + TypeScript API, Socket.IO real-time hub, Prisma/PostgreSQL persistence, Zod validation, centralized error handling/logging.
- **Shared (`shared/`)**: shared types/constants/validation (match state, API envelopes, socket events, volleyball rules/schemas).
- **Database**: PostgreSQL (Prisma schema/migrations/seed). Local Windows helper scripts and `pgdata/` supported for dev.

## 2. High-level architecture
```text
[Operator Browser / Control Centre] ----HTTP /api/v1----> [Express Controllers] -> [Services/Engines] -> [Prisma] -> [PostgreSQL]
            |                                                  |
            +-------------------Socket.IO----------------------+ (match rooms, state/graphic broadcasts)

[OBS / Browser Sources / Read-only Displays] --HTTP (pages/assets)--> [Vite dev / static client]
            |                                       
            +--HTTP fetch initial state---> /api/v1
            +--Socket.IO subscribe--------> match:<matchId> (MATCH_STATE, broadcast:graphic:state)
```

## 3. Frontend structure
- **Routing/layout**: `client/src/App.tsx`, `client/src/layouts/RootLayout.tsx` (dashboard chrome hidden for `/overlay` and `/broadcast` outputs).
- **State/data**: TanStack Query for server state; Socket.IO client (`client/src/services/socket.ts`) for realtime updates; API client (`client/src/services/api.ts`) with normalized errors.
- **Key modules**:
  - Control: `MatchesPage`, `LiveControlPage`, `OverviewPage`.
  - Analytics/archive/reports: `StatisticsPage`, `MatchArchivePage`, `ReportsPage`.
  - Broadcast: `BroadcastStudioPage` (operator), `ScorebugPage` (compact overlay), `BroadcastGraphicsPage` (dynamic/dedicated full-screen templates), `features/broadcast/templates.tsx`.
  - Registries (UI): `TeamsPage`, `PlayersPage`, `CompetitionsPage` (see gaps in final report).

## 4. Backend structure
- **Entry/config**: `server/src/index.ts`, `server/src/config/{env,database}.ts`.
- **API**: versioned REST under `/api/v1` (`server/src/routes/*`, controllers in `server/src/controllers/*`), legacy-compatible match routes retained.
- **Domain/services**: `server/src/services/match.service.ts` (match lifecycle, scoring/actions, state/report/history aggregation), `server/src/services/broadcast.service.ts` (active graphic + break state source of truth).
- **Engines**: `server/src/engine/volleyballEngine.ts` (scoring/rules/playability), `server/src/engine/statisticsEngine.ts` (event-sourced analytics, formulas, correction-aware recomputation).
- **Realtime**: `server/src/sockets/socketManager.ts` (rooms `match:<id>`, broadcasts match and graphic state).
- **Middleware/utils**: auth-ready context (`middleware/auth.ts`), Zod validation, centralized error handling, logging.

## 5. Data and event flow
1. Operator action (score/action/sub/timeout/set/status/break/graphic) -> REST mutation.
2. Service validates and persists/derives authoritative state (transactional where applicable) and emits domain events.
3. Updated match state broadcast to match room and listeners; broadcast/graphic state broadcast on changes.
4. Control UIs and OBS outputs fetch initial state and resync on (re)connect; outputs apply stale/offline safeguards.

## 6. Broadcast and output model
- **Scorebug**: transparent, compact, OBS-ready (`/broadcast/:matchId/scorebug`).
- **Graphics**: reusable backend-driven output (`/broadcast/:matchId/graphics`) plus dedicated template routes for OBS scenes.
- **Breaks/resumption**: break state + suggested full-screen stats; resume dismisses full-screen, ends break, sets match LIVE, and synchronizes displays.
- **Source of truth**: match persistence in PostgreSQL; active graphic/break presentation state currently in-memory service state (synced via Socket.IO).

## 7. Key design decisions
- Event-sourced/statistics recomputation to avoid double-counting on corrections/reversals.
- Shared contracts in `shared/` for client/server consistency.
- Separation of operator UI from output routes (overlay/broadcast routes rendered without dashboard chrome).
- Windows-friendly local dev scripts and `.env`-driven configuration.