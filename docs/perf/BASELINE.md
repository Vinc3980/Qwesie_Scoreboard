# Performance Baseline

**Date:** 2026-11-28  
**Branch/commit:** working tree (Render + Neon perf pass)  
**Environment:** local Windows dev workspace; no live Render+Neon deployment available in this session.

## How to reproduce measurements

1. **Server timing / p50 / p95**
   - Set `DIAGNOSTICS=true` (or `PERF_LOG=true` for request logs).
   - Start server and exercise flows (login, overview, live scoring, OBS output).
   - Read per-route p50/p95/p99: `GET /api/v1/health/metrics?allow=1` (or with `DIAGNOSTICS=true`).
   - Request logs include duration: `GET /api/v1/matches/:id 200 42.3ms`.
   - Every response includes `Server-Timing: app;dur=<ms>;desc="request"` and `X-Response-Time`.
2. **Health / DB ping**
   - `GET /api/v1/health` returns `status`, `databaseLatencyMs`, runtime region/instance.
3. **Score click → console update → OBS render**
   - Socket patch payloads include `perf.committedAt` and `perf.emittedAt`.
   - Console optimistic update sets local cache before server response (target <100ms).
   - OBS client records `window.__qwesieLastPatchLatencyMs` on patch receipt (receivedAt - committedAt).
4. **Lighthouse mobile**
   - Run on deployed Render URL (same region as Neon) after cold start and warm start:
   - `npx lighthouse https://<app>/login --preset=perf --form-factor=mobile --throttling-method=simulate --output=json --output-path=docs/perf/lighthouse-login-mobile.json`
   - Repeat for `/overview` and `/live`.

## Baseline (before this pass)

### Client bundle (reported / pre-change)

| Asset | Minified | Gzip | Notes |
|---|---:|---:|---|
| Main chunk | ~712 KB | n/a (reported) | Single large app chunk |
| recharts chunk | ~397 KB | n/a (reported) | Charts loaded eagerly in graph |
| Initial JS /login | unknown | unknown (target <250 KB) | Login/overlay routes eagerly imported into main bundle |
| Initial JS /live | unknown | unknown (target <250 KB) | Large console + shared chunks |

Source: task code review suspects (pre-change build). Exact pre-change gzip was not captured in-repo; capture by checking out previous commit and running `npm run -w client build`.

### Server/API p50/p95 (deployment measurement required)

| Endpoint | p50 | p95 | Notes |
|---|---:|---:|---|
| `GET /api/v1/health` | TBD | TBD | Includes DB `SELECT 1` ping |
| `GET /api/v1/matches` | TBD | TBD | List summary; previously N+1 risk |
| `GET /api/v1/matches/:id` | TBD | TBD | Full state build |
| `POST /api/v1/matches/:id/point` | TBD | TBD | Scoring hot path |
| `POST /api/v1/matches/:id/action` | TBD | TBD | Scoring hot path |
| `POST /api/v1/matches/:id/undo` | TBD | TBD | |
| `GET /api/v1/broadcast/:id/scene` | TBD | TBD | |
| `GET /api/v1/system/info` | TBD | TBD | |
| `GET /api/v1/matches/:id/analytics` | TBD | TBD | |
| `GET /api/v1/matches/:id/report` | TBD | TBD | |

**Status:** Not measured in this environment (no Render+Neon runtime). Use `/api/v1/health/metrics` after deployment with `DIAGNOSTICS=true`.

### Score click → console update → OBS render (deployment measurement required)

| Metric | Target | Baseline |
|---|---:|---|
| Score click → console update | <100 ms | TBD (instrumentation added; optimistic update + patch) |
| Score click → OBS render | <500 ms | TBD (patch has committedAt/emittedAt; OBS records receivedAt) |

### Lighthouse mobile (deployment measurement required)

| Route | Perf | Notes |
|---|---:|---|
| `/login` | TBD | Target >=80 |
| `/overview` | TBD | Target >=80 |
| `/live` | TBD | Not requested as target route but useful |

## Observed suspects confirmed by code review

- **Bundle:** large main chunk; recharts in graph; LoginPage/overlay routes eagerly imported.
- **Polling:** Overview 4 queries at 4-5s; Statistics 5-8s; Matches 5s; CurrentMatchContext 5s; MatchArchive 15s; SetupWizard readiness 3s - even when sockets healthy.
- **getMatchState:** heavy full-state build; scoring hot path already had cache/patch work but client did not handle `MATCH_STATE_PATCH`.
- **Prisma/Neon:** schema used `DATABASE_URL_UNPOOLED`; env supports DIRECT_URL. Need clear DIRECT_URL convention + pooled pgbouncer params.
- **Backups:** local pg_dump scheduler can wake Neon; defaults were unsafe for hosted DB in examples.
- **Cold start:** Neon autosuspend / Render spin-down; keep-warm exists but must be env-flagged.
- **Compression/cache:** compression and hashed asset cache headers present in server; verify after build.
