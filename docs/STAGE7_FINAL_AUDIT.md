# Qwesie TV — Stage 7 final audit (dependability & release readiness)

Date: 2026-11-15 (workspace state). This audit summarizes implemented dependability/packaging/security/doc work in Stage 7 and **remaining risks/gaps**.

## 1) Tests
**Implemented**
- Existing server unit tests passing: `server/tests/volleyballEngine.test.ts`, `statisticsEngine.test.ts`, `stage1.test.ts` (34 tests total at last run).
- Playwright screenshot/spec scaffolding added in earlier stages for scorebug and broadcast scenes; Stage 5 added `client/tests/live-control.spec.ts` (smoke + env-gated full-flow scaffold).

**Gaps / remaining**
- **Server integration tests against a real test Postgres** (all mutation routes, auth/roles, room isolation, auto-triggers) not fully implemented as an automated, isolated suite in this pass.
- **React Testing Library** coverage for `useOutputStream` and the rebuilt console not added.
- **Playwright e2e** for full match lifecycle, reconnect/network-drop, and **10 simultaneous overlay clients while scoring** not executed/fully automated here (requires running backend+DB, browsers, and orchestration); live-control full flow is env-gated (`BASE_MATCH_ID`).
- Recommendation: add CI pipeline with ephemeral Postgres, seeded fixtures, deterministic e2e, and load/concurrency scenarios.

## 2) Reliability
**Implemented**
- Authoritative match/scene/scorebug/broadcast state persisted in DB (Stages 1–4 foundations); outputs fetch/resync and apply revision-aware updates; overlays keep **last good frame** on disconnect (client-side).
- **Automatic DB backup scheduler** added (`server/src/utils/backup.ts`): `pg_dump` on start (configurable) and every `BACKUP_INTERVAL_MINUTES` when live/active matches detected; outputs to `BACKUP_DIR`. Best-effort with warnings if unavailable.
- Server serves API+sockets+static uploads from one process; graceful shutdown hooks present.

**Gaps / remaining**
- **Event-log rebuild on server restart:** not explicitly implemented as a separate replay/reconstruction routine in this pass. Current model relies on persisted projected state/records; validate recovery semantics for all edge cases (in-flight actions, timers/auto-trigger rescheduling after restart) under fault-injection tests.
- **Overlays through server restart:** clients retain last good frame while disconnected and should resync on reconnect, but end-to-end behavior across full server/process restart (including DNS/port availability and timer catch-up) should be validated in production-like tests.
- Backup scheduler depends on external `pg_dump` and DB availability; no integrity verification/retention policy enforcement built in.

## 3) Packaging & operations
**Implemented**
- **Single-port production serving:** server can serve built client (`client/dist`) + SPA fallback alongside `/api`, `/socket.io`, `/uploads` when `SERVE_CLIENT` (default in production) and build artifacts exist.
- **Root scripts:** `npm run build` (shared+server+client), `npm start` (server). **`start.bat`** added for Windows (`build` then `start`).
- **Startup log:** prints LAN URLs (Console, Live, Scorebug, Graphics template) and attempts QR code for console URL if optional `qrcode-terminal` is installed (falls back to printed URL).
- **Ignores:** `.gitignore`/`.dockerignore` include `node_modules`, `dist`/build outputs, `.env` patterns, `pgdata`, logs, test artifacts, etc.

**Gaps / remaining**
- QR generation is optional (no hard dependency added) to avoid install/type friction in this environment; install `qrcode-terminal` in deployment if QR output is required.
- Production reverse-proxy/TLS/WebSocket hardening and process supervision (PM2/NSSM/service) documented as guidance but not bundled as turnkey infra.
- Dev vs prod config ergonomics (single-command LAN dev, host binding notes) may need refinement per venue setup.

## 4) Security
**Implemented**
- **Committed secret removed:** `server/.env` deleted from workspace; `server/.env.example` provided with placeholders. `.env` ignored by `.gitignore`.
- **CORS:** driven by `CORS_ORIGIN` (comma-separated origins or explicit `*`); credentials disabled when wildcard.
- **Rate limiting:** simple in-memory limiter on mutating `/api` requests added (best-effort).
- **Auth/roles:** mutations guarded server-side (ADMIN/SCORER) per earlier stages; dev convenience identity only outside production.

**Gaps / remaining**
- Rate limiter is **in-memory/per-process** (not distributed), basic keying/windowing, and not tuned per-endpoint; for hardened deployments use a proven store-backed limiter and stricter policies.
- Security hardening checklist items not fully enforced here: HTTPS termination, secure cookie flags in all deployment modes, CSRF considerations for cookie auth, secret rotation, dependency auditing/SCA, least-privilege DB users, and audit-log coverage review.
- Ensure no other secrets exist in history/artifacts outside this workspace snapshot; rotate any previously committed credentials.

## 5) Documentation
**Implemented/updated**
- `docs/OBS_INTEGRATION.md` (Stage 3 scorebug/overlays; existing comprehensive guide retained/updated earlier).
- Added: `docs/MATCH_DAY_CHECKLIST.md`, `docs/TROUBLESHOOTING.md`, `docs/BACKUP_RESTORE.md`, `docs/STAGE7_FINAL_AUDIT.md`.

**Gaps / remaining**
- `docs/DEPLOYMENT.md` and other manuals may need alignment with new same-port/startup behavior, env options, and operational practices (backup scheduler, LAN URL/QR, rate limiting/CORS guidance).
- Runbooks should be validated in a real venue rehearsal (multi-machine, OBS, failover).

## 6) Priority next actions (recommended)
1. Stand up CI with **Postgres-backed integration tests** (auth/roles, all mutations, idempotency/undo, room isolation, auto-triggers/timers) and expand Playwright e2e (full lifecycle, reconnect/drop, 10+ overlay clients under scoring load).
2. Validate and, if needed, implement **restart recovery**: event-log/state rebuild guarantees and timer/auto-trigger rescheduling correctness after process restart.
3. Harden **security & ops**: production CORS/cookie/TLS config, store-backed rate limiting, dependency audits, secret management/rotation, monitored backups with restore drills.
4. Perform a full **match-day rehearsal** (scorer + broadcast engineer) using `MATCH_DAY_CHECKLIST.md` and update docs from findings.