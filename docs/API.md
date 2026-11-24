# Qwesie TV — API Documentation

Base path: `/api/v1` (JSON). Responses generally use `{ success, data, message?, timestamp }` and errors `{ success: false, error, timestamp }`.

## Health / System
- `GET /api/v1/health` — service/health status
- `GET /api/v1/system/info` — public system info: `{ version, port, lanIpv4, connectedClients: { total, byType: { scorebug, graphics, console, other } } }`

## Matches
- `GET /api/v1/matches` — list matches (recent states)
- `POST /api/v1/matches` — create match **as SCHEDULED (draft)**. Accepts setup fields including `homeTeamId/awayTeamId`, `competitionId/tournamentId` (by id), legacy display fallbacks, `ruleset` (`FIVB_BO5` | `BO3` | `CUSTOM` with explicit rules), `venueType`, `court`, `match_no`, `scheduledAt` (full date-time), `referee1/referee2`, and rule values (`bestOfSets`, `setsToWin`, `regularSetPoints`, `finalSetPoints`, `minPointDifference` win-by, `timeoutsPerSet`, `substitutionsPerSet`).
- `GET /api/v1/matches/current` — current/default match state
- `GET /api/v1/matches/:id` — match state by id
- `GET /api/v1/matches/:id/readiness` — readiness checklist `{ matchId, ready, canGoLive, checklist[] }` (teams set, each roster >= 6, valid starting six for set 1 per team, max 1 libero per lineup)
- `POST /api/v1/matches/:id/go-live` — validate readiness and set match LIVE (scorer role)
- `GET /api/v1/matches/:id/analytics` — event-sourced match analytics
- `GET /api/v1/matches/:id/report` — detailed post-match report
- `GET /api/v1/matches/history/analytics` — historical aggregates (filters: `team`, `tournament`, `competition`, `dateFrom`, `dateTo`, `player`)
- Legacy/current helpers: `/matches/current/analytics`, `/matches/current/report`

### Roster & lineup (scorer role)
- `GET /api/v1/matches/:id/roster/:side` — get roster for side (`A|B|HOME|AWAY`)
- `PUT /api/v1/matches/:id/roster/:side` — replace whole roster in one call `{ players: [{ playerId?, jerseyNumber, name?, position?, isCaptain?, isLibero? }] }` (or array body). Players not in DB are created on-the-fly and attached to the team (quick add). Validates unique jersey per team (1-99), roster size 6-16, max 1 captain, max 2 liberos.
- `POST /api/v1/matches/:id/roster/:side/copy-from/:otherMatchId` — copy last/recorded roster from another match
- `PUT /api/v1/matches/:id/lineup/:side/:setNumber` — set starting six by rotation positions 1-6 `{ players: [{ rotationPos, playerId?, jerseyNumber? }], liberoId? }`, validated against roster (max 1 libero in lineup). Next-set default uses previous set's starting six when available; `getMatchState` exposes real `lineup`, `bench`, `rotationOrder`, and derived `serverPosition`.

### Match mutations (scoring & operations, scorer role)
- `POST /api/v1/matches/:id/point` (or `/point`) — score mutation `{ team, delta?, clientEventId? }` (requires LIVE)
- `POST /api/v1/matches/:id/action` (or `/action`) — record action `{ team, action, playerId?, clientEventId? }`
- `POST /api/v1/matches/:id/timeout` (or `/timeout`) — `{ team, clientEventId? }`
- `POST /api/v1/matches/:id/substitution` (or `/substitution`) — `{ team, out/in or playerOutId/playerInId, clientEventId? }`
- `POST /api/v1/matches/:id/end-set` (or `/end-set`) — complete current set (validated)
- `POST /api/v1/matches/:id/setup` (or `/setup`) — apply/persist setup (teams by id, competition/tournament by id, ruleset preset/CUSTOM, venueType, scheduledAt, referees persisted as officials, etc.)
- `POST /api/v1/matches/:id/info` (or `/info`) — update match info/metadata `{ match_no?, scheduledAt?/match_date?, referee1?, referee2? }` (officials persisted)
- `POST /api/v1/matches/:id/status` (or `/status`) — set lifecycle status `{ status }` (`LIVE` routes through go-live validation)
- `POST /api/v1/matches/:id/undo` (or `/undo`) — undo last reversible event

> Validation via Zod schemas (`shared/src/validation`, server `middleware/validate.ts`). Some legacy-compatible `/api/match...` routes are also mounted.

## Teams / Players (registry)
- `GET/POST/PUT/DELETE /api/v1/teams...` — team CRUD (scorer/admin as configured)
- `GET /api/v1/teams/:id/players` — list players
- `POST /api/v1/teams/:id/players/bulk` — bulk create from pasted rows (`"7, K. Mensah, OH"` per line, tab/comma/space tolerant). Body `{ text, dryRun? }`. Dry-run returns parsed rows and per-row errors `{ rows, validCount, errorCount }` without creating.
- `GET/POST/PUT/DELETE /api/v1/players...` — player CRUD

## Broadcast / graphics / breaks
- `GET /api/v1/broadcast/templates` — available graphic templates
- `GET /api/v1/broadcast/:matchId/graphic` — active graphic + break state
- `POST /api/v1/broadcast/:matchId/graphic` — activate/replace/update graphic `{ template, visible?, payload?, durationSeconds? }`
- `POST /api/v1/broadcast/:matchId/graphic/dismiss` — dismiss/return to scorebug/clear
- `POST /api/v1/broadcast/:matchId/break/start` — start break `{ type, durationSeconds? }`
- `POST /api/v1/broadcast/:matchId/break/end` — end break state
- `POST /api/v1/broadcast/:matchId/resume` — resume match

## Realtime (Socket.IO)
- **Connect:** same host as server (`/socket.io`)
- **Client → server:** `match:join` `{matchId, clientType?}` / `match:leave` `{matchId}` (room `match:<matchId>`). `clientType` may be `scorebug|graphics|console` for system stats.
- **Server → clients:** `match:snapshot`, `match:state` (authoritative, includes real `lineup/bench/rotationOrder/serverPosition`), output scene/scorebug events, `system:heartbeat`
- Clients should fetch initial state via REST and resync on reconnect.

## Auth & permissions
- JWT cookie/header auth; mutations require scorer/admin roles. Dev convenience identity is injected only outside production (`server/src/middleware/auth.ts`). Production deployments must provide real authentication and enforce secure CORS/secrets.
