# Stage G — Prove it works (report)

**Date:** 2026-11-15  
**Scope:** server integration tests (test Postgres), Playwright end-to-end flow, restart recovery, overlay load check, docs updates, and honest status.

> **Honesty note:** This environment did not have a running/configured test PostgreSQL database, running backend+frontend stack, browser automation runtime with connected services, or OBS/multi-client production setup. **No Stage G database integration, Playwright end-to-end, or load-check runs are claimed as executed or passed here.** Existing unit tests and TypeScript compilation were re-verified after Stage G code changes.

## 1) Files changed / added (Stage G)

### Implemented (runtime behavior)
- `server/src/services/broadcast.service.ts` — **restart recovery for timed broadcast scenes**: tracks/schedules in-memory auto-return timers for timed scenes (`SET_BREAK`, `TIMEOUT`), clears/reschedules on scene changes, returns to `PLAY` when persisted timers expire, and adds `recoverBroadcastTimers()` to re-apply/reschedule persisted `BroadcastGraphicState` (`timerEndsAt`, `scene`, lock handling) on startup. Exposes timer-aware `setOutputScene`/`applyResume` behavior.
- `server/src/index.ts` — invokes `recoverBroadcastTimers()` after server listen (best-effort) to restore break/auto-trigger timer behavior after restart.

### Implemented (tests/scripts, gated/not auto-proven)
- `server/tests/integration.stageG.test.ts` — **DB-gated integration tests** (`RUN_DB_INTEGRATION=1` + `DATABASE_URL` pointing to an isolated test Postgres). Covers: auth/user+role/JWT basis, roster/lineup setup, go-live, scoring/action/timeout/substitution mutations, undo, idempotency via `clientEventId`, materialized state re-read, court active-match resolution (case-insensitive), and **restart recovery** checks for timed scenes (expired → `PLAY`, future timer retained/rescheduled). Skipped by default; **not executed against a real DB in this environment**.
- `client/tests/stage-g-e2e.spec.ts` — **env-gated Playwright spec** (`RUN_STAGE_G_E2E=1`, credentials, live system) outlining/checkpointing the full flow: login → create teams → paste rosters → starting six → go live → score 3-0 with player stats and substitution → verify scorebug/set-break/FINAL on second page, plus network drop simulation and manual server-restart checkpoint. **Not executed in this environment**.
- `scripts/load-overlay-clients.mjs` — **manual load-check script** to connect N (default 10) Socket.IO overlay-style clients to a match and report connection/update stability while scoring. **Not executed in this environment**.

### Documentation updated
- `docs/OBS_INTEGRATION.md` — added server restart recovery note (implemented, requires live validation) and Stage G load/proof-check instructions with explicit "not executed/claimed unless run" caveats.
- `docs/MATCH_DAY_CHECKLIST.md` — added rehearsal items for restart-mid-match recovery and optional 10-client overlay load sanity check.
- `docs/MATCH_OPERATOR_MANUAL.md` — added restart recovery and offline/queue notes.
- `docs/BROADCAST_OPERATOR_MANUAL.md` — added restart recovery and pre-event proof guidance.
- `docs/STAGE_G_REPORT.md` — this report.

## 2) Restart recovery (implemented) — what it does and limits
- **Match scoring state:** materialized in the database from committed events (event log/audit trail) and reconstructed on read via `MatchService.getMatchState` / persisted tables. A restart does not discard committed match state.
- **Broadcast break/auto-trigger timers:** previously in-memory only for countdown expiry; now persisted `timerEndsAt` + `scene` are reconciled on startup by `recoverBroadcastTimers()` (and on timed scene set): expired timed `SET_BREAK`/`TIMEOUT` scenes return to `PLAY`, future timers are rescheduled in-process.
- **Limits / not fully proven:** behavior under real multi-process deployment, exact edge cases (lock interactions, concurrent scene changes during restart window, all auto-trigger paths), and end-to-end reconnect UX were **not runtime-validated** here. Treat as implemented-but-requires-staging-proof.

## 3) How to run / test

### Compile and existing unit tests (verified here)
```powershell
# from F:\qwesie_tv_scoreboard
npx tsc -p shared/tsconfig.json
npx tsc -p server/tsconfig.json --noEmit
npx tsc -p client/tsconfig.json --noEmit
cd server; npx vitest run
```
**Result (this environment, after Stage G edits):** shared/server/client `tsc` passed; server vitest **5 passed, 1 skipped (DB-gated), 50 tests passed, 7 skipped**.

### Stage G server integration tests (NOT run here)
Requires an isolated disposable **test PostgreSQL** database.
```powershell
$env:RUN_DB_INTEGRATION="1"
$env:DATABASE_URL="postgresql://user:pass@host:5432/qwesie_test"
# ensure schema is migrated for the test DB
npm run prisma:migrate
cd server
npx vitest run tests/integration.stageG.test.ts
```

### Stage G Playwright end-to-end (NOT run here)
Requires running backend+DB+frontend, valid credentials, and Playwright browsers.
```powershell
# example
$env:RUN_STAGE_G_E2E="1"
$env:BASE_URL="http://localhost:5000"
$env:ADMIN_USER="admin"
$env:ADMIN_PASS="..."
cd client
npx playwright test tests/stage-g-e2e.spec.ts
# existing baseline: npx playwright test tests/live-control.spec.ts (env-gated for full flow via BASE_MATCH_ID)
```
Must be executed against a real system to prove: login→create teams→paste rosters→starting six→go live→score 3-0 with player stats and substitution→verify scorebug/set-break/FINAL on second page, **server restart mid-match**, and **network drop**.

### Overlay load check (NOT run here)
```powershell
# server running, match LIVE/in progress, score while test runs
node scripts/load-overlay-clients.mjs --url http://<host>:5000 --match <matchId> --clients 10 --duration 30
```
Requires dependencies installed (`socket.io-client` available, e.g. via client workspace).

## 4) Anything still unfinished / not proven (explicit)
- **Not executed:** DB-backed integration suite against a real test Postgres (auth/roster/lineup/go-live/all mutations/undo/idempotency/room isolation as runtime socket behavior/auto-triggers/court URLs end-to-end) — tests added but **skipped/unrun** here.
- **Not executed:** Playwright full end-to-end flow, including 3-0 with player stats + substitution, scorebug/set-break/FINAL verification on second page, **server restart mid-match**, and **network drop** scenarios — env-gated spec added, **unrun** here.
- **Not executed:** 10-overlay-client load check while scoring — script added, **unrun** here.
- **Not fully proven:** restart recovery in a live multi-client/runtime environment (in-memory timer reschedule + DB/materialized state rebuild-on-read are implemented; staging validation required).
- **Room isolation:** `match:*` / `court:*` room design exists in `socketManager`; runtime isolation under concurrent matches/courts not load/integration-tested in this environment.
- **Auto-triggers:** timer/scene auto-trigger logic exercised by code paths and partially by gated recovery checks; full event-driven runtime validation (including all triggers during live scoring) not executed here.
- **Environment blockers:** no committed `server/.env` test DB, no reachable PostgreSQL in this environment, and no browser/OBS/runtime stack available for e2e/load proof.

**Conclusion:** Stage G implementation artifacts (recovery code, gated integration tests, gated e2e spec, load script, and updated docs/report) are in place; **operational success must not be claimed until the above are executed and pass in a properly configured DB-backed staging environment.**
