# Performance After

**Date:** 2026-11-28  
**Compared to:** `docs/perf/BASELINE.md`

## Summary

This pass adds measurement instrumentation, removes socket-era polling waste, makes score patches visible to clients, adds console optimistic updates, splits client bundles, and hardens Render+Neon hosting defaults. Deployment p50/p95 and Lighthouse numbers still need to be captured on a real Render+Neon instance (commands below).

## Measured improvements (local build)

### Client bundle (after)

Build command: `npm run -w client build` (Vite 6.4.6, production).

| Asset | Minified | Gzip | Notes |
|---|---:|---:|---|
| `index-*.js` (app entry) | 89.60 KB | 21.64 KB | Was part of ~712 KB main chunk |
| `vendor` (react/react-dom) | 143.06 KB | 45.83 KB | Manual chunk |
| `router` | 39.66 KB | 14.35 KB | Manual chunk |
| `query` (@tanstack) | 41.03 KB | 12.18 KB | Manual chunk |
| `transport` (axios/socket.io-client) | 101.05 KB | 34.74 KB | Manual chunk |
| `motion` (framer-motion) | 129.21 KB | 42.47 KB | Manual chunk |
| `icons` (lucide-react) | 36.91 KB | 7.51 KB | Manual chunk |
| `charts` (recharts/d3) | 406.81 KB | 111.19 KB | Loaded only by Statistics page |
| `LiveControlPage` | 69.46 KB | 19.49 KB | Lazy route chunk |
| `LoginPage` | 10.37 KB | 3.78 KB | Lazy route chunk |
| `OverviewPage` | 12.02 KB | 3.89 KB | Lazy route chunk |
| `StatisticsPage` | 23.19 KB | 6.55 KB | Lazy route chunk; pulls charts |
| CSS | 58.78 KB | 10.40 KB | |

### Initial JS estimate (gzip)

| Route | Chunks | Estimated gzip JS+CSS | Target | Status |
|---|---|---:|---:|---|
| `/login` | entry + vendor + router + query + transport + motion + LoginPage + CSS | ~185 KB | <250 KB | **Pass (build estimate)** |
| `/live` | login base + LiveControlPage + OutputsPanel + Button + templates | ~241 KB | <250 KB | **Pass (build estimate, borderline)** |

Notes: estimates sum route-relevant chunks from build output; real browser load depends on preloads/cache. Charts (111 KB gzip) are not on /login or /live.

## Deployment measurements required (capture on Render + Neon)

| Metric | Target | After | How to capture |
|---|---:|---|---|
| API p95 (same region) | <300 ms | TBD | `DIAGNOSTICS=true`, exercise flows, read `/api/v1/health/metrics` |
| Score click → console update | <100 ms | TBD | Optimistic update in console; measure with Performance marks / UI instrumentation |
| Score click → OBS render | <500 ms | TBD | `patch.perf.committedAt/emittedAt`, OBS `__qwesieLastPatchLatencyMs` |
| Lighthouse mobile /login | >=80 | TBD | `npx lighthouse .../login --form-factor=mobile` |
| Lighthouse mobile /overview | >=80 | TBD | `npx lighthouse .../overview --form-factor=mobile` |
| Lighthouse mobile /live | informational | TBD | `npx lighthouse .../live --form-factor=mobile` |

## Changes made

### Instrumentation
- `server/src/middleware/perf.ts`: Server-Timing + X-Response-Time on every response; request logging with duration for `/api` requests (and slow requests always warned).
- `server/src/utils/perfMetrics.ts`: in-process p50/p95/p99 per normalized route.
- `server/src/routes/health.routes.ts`: `/api/v1/health` includes DB ping + latency; `/api/v1/health/metrics` exposes route percentiles when diagnostics enabled.
- `server/src/config/database.ts`: Prisma query duration logging behind `DIAGNOSTICS=true`; `withDbRetry` for connection/cold-start retry.
- Socket payloads include `perf.committedAt`, `perf.emittedAt`; client records `receivedAt` / `__qwesieLastPatchLatencyMs`.

### Database / Neon
- `server/prisma/schema.prisma`: `directUrl = env("DIRECT_URL")` (direct non-pooled for migrations).
- `server/src/config/env.ts`: resolves `DIRECT_URL`/`DATABASE_URL_UNPOOLED` fallback; normalizes pooled Neon URL with `pgbouncer=true`, `connection_limit`, `pool_timeout`, `connect_timeout`.
- Single shared Prisma client in `server/src/config/database.ts`.
- `withDbRetry` retries once on connection/cold-start errors.
- `KEEPWARM_ENABLED` + `KEEPWARM_INTERVAL_MINUTES` optional `SELECT 1` keep-warm (event days only).

### Scoring hot path
- `MatchService.changeScore`/`recordAction`: write event + update set in request; emit compact `MATCH_STATE_PATCH` from in-memory cache; debounced authoritative refresh; broadcast/stats side effects queued off request path.
- `client/src/hooks/useMatch.ts`: handles `MATCH_STATE_PATCH`; optimistic point/action updates with rollback on error.
- `client/src/pages/LiveControlPage.tsx`: optimistic score update in scoring runOp with rollback; socket-healthy polling fallback.
- `client/src/hooks/useOutputStream.ts`: handles `MATCH_STATE_PATCH` for OBS/outputs; records patch latency.

### Hosting hygiene
- Backup scheduler disabled by default (`BACKUP_ENABLED=false`); logs Neon branching/PITR guidance. No pg_dump on Render/Neon by default.
- `render.yaml`: `DIRECT_URL`, `BACKUP_ENABLED=false`, `KEEPWARM_ENABLED=false`, health check `/api/v1/health`.
- Server: trust proxy, keep-alive 65s/headers 66s, compression, hashed asset immutable cache, uploads 7d stale-while-revalidate, graceful shutdown, Socket.IO websocket preferred with polling fallback.

### Client
- Vite `manualChunks`: vendor, charts, motion, router, query, transport, icons.
- Lazy-loaded Login/overlay/console pages; Login no longer eagerly imported.
- React Query defaults: `staleTime: 15s`, `gcTime: 5m`, `refetchOnWindowFocus: false`.
- Polling removed when socket healthy; 15-30s fallback when unhealthy (`usePollingFallback`).
- Images: `loading="lazy"`, `decoding="async"`, width/height where applicable.
- Long lists: simple windowing ("Show more") + `content-visibility: auto` for players/matches/archive.

## Tests

- `npm run -w server test`: **84 passed, 10 skipped** (15 files). Skipped are integration tests requiring DB.
- `npm run -w client build`: **passes**.

## Remaining risks / follow-ups

- Capture real Render+Neon p50/p95 and Lighthouse on deployed environment.
- `/live` initial gzip is close to 250 KB; further gains possible by lazy-loading OutputsPanel/templates/motion on demand.
- `listMatches` is lightweight summary; full `getMatchState` still builds large state for non-patch reads - acceptable with cache, but watch analytics/report endpoints.
- Add Redis adapter before horizontal scaling (Socket.IO single-instance assumption documented).
