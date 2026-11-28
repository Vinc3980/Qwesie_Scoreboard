# Deploy Qwesie TV on Render + Neon

This guide targets a single Render Web Service running the Express + Socket.IO server and serving the built React client, backed by Neon serverless Postgres.

## Architecture

- **Render Web Service (Docker)**: one long-running Node process. Do not scale horizontally without adding a Socket.IO Redis adapter and shared match-state cache.
- **Neon Postgres**: pooled connection for app runtime, direct connection for Prisma migrations.
- **Backups**: use Neon branching / point-in-time restore (PITR). Local `pg_dump` scheduler is disabled by default and should remain off on hosted Render.

## Environment variables

| Variable | Required | Recommended value | Purpose |
|---|---:|---|---|
| `NODE_ENV` | yes | `production` | Production mode; enables strict JWT secret check. |
| `PORT` | Render sets | Render-provided | Server listens on `PORT`. |
| `SERVE_CLIENT` | yes | `true` | Serve built client from same web service. |
| `JWT_SECRET` | yes | Render `generateValue` / strong secret | >=32 chars; server refuses weak default in production. |
| `DATABASE_URL` | yes | Neon **pooled** connection string | Runtime Prisma connection. Use host with `-pooler`. Example: `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`. |
| `DIRECT_URL` | recommended | Neon **direct** connection string | Prisma Migrate / session-level work. Same DB/user, host without `-pooler`. |
| `DATABASE_URL_UNPOOLED` | optional | same as `DIRECT_URL` | Legacy alias accepted by env/config. |
| `DB_CONNECTION_LIMIT` | optional | `5` | App pool size per instance. Keep small with Neon PgBouncer. |
| `DB_POOL_TIMEOUT_SECONDS` | optional | `10` | Pool wait timeout. |
| `DIAGNOSTICS` | optional | `false` (enable during perf capture) | Prisma query durations + `/api/v1/health/metrics`. |
| `PERF_LOG` | optional | `false` | Extra perf logging. API requests already log duration. |
| `KEEPWARM_ENABLED` | optional | `false`, `true` on event days | Pings `SELECT 1` every 4 minutes to reduce Neon autosuspend cold starts. |
| `KEEPWARM_INTERVAL_MINUTES` | optional | `4` | Keep-warm interval. |
| `TRUST_PROXY` | optional | `1` | Render terminates TLS at proxy. |
| `BACKUP_ENABLED` | yes for hosted | `false` | Disables local pg_dump scheduler. |
| `BACKUP_ON_START` | optional | `false` | Only relevant if local backups explicitly enabled. |
| `CORS_ORIGIN` | optional | your public origin | Comma-separated origins; Render public URL is auto-allowed. |
| `APP_BASE_URL` | optional | `https://<service>.onrender.com` | Used for reset links / public URL hints. |

## Neon connection guidance

- **Runtime (`DATABASE_URL`)**: use Neon pooled endpoint (`-pooler`). The server auto-adds `pgbouncer=true`, `connection_limit`, `pool_timeout`, and `connect_timeout` for `-pooler` hosts when missing.
- **Migrations (`DIRECT_URL`)**: use Neon direct endpoint (no `-pooler`). Prisma schema uses `directUrl = env("DIRECT_URL")`.
- **Same region**: place Render service and Neon database in the same region to reduce latency. Cross-region DB calls dominate p95.
- **Autosuspend**: Neon can suspend idle compute. For match/event days, set `KEEPWARM_ENABLED=true`. Turn it off afterward to avoid unnecessary compute.

## Render settings

- **Health check path:** `/api/v1/health`
- **Build command (Docker blueprint):** handled by `Dockerfile` (`docker build`).
- **Start command (Docker):** container CMD / `node server/dist/index.js` as defined in Docker image.
- **Non-Docker alternative:**
  - Build: `npm ci && npm run build`
  - Start: `npm run start`
  - Pre-deploy/migrate: `npm run prisma:generate --workspace=server && npx prisma migrate deploy --schema server/prisma/schema.prisma`
- **Instance type:** start with smallest always-on instance for live events; free instances spin down and cause cold starts.

## Backups

Do **not** rely on local `pg_dump` on Render.

Use Neon instead:
- **Point-in-time restore (PITR):** restore database state to a timestamp before an incident.
- **Branching:** create a branch before risky migrations or for staging/debug snapshots.
- **Manual export:** if needed, run `pg_dump` from a trusted admin machine with the direct Neon URL, not from the Render web instance.

The app logs: "Local backup scheduler disabled (BACKUP_ENABLED=false). Use Neon branching / point-in-time restore for hosted databases." 

## Socket.IO / real-time

- Single instance only by default.
- Websocket preferred, polling fallback enabled.
- Server keep-alive tuned above Render idle timeout.
- Graceful shutdown closes Socket.IO and HTTP server.

## Observability / perf capture

- Set `DIAGNOSTICS=true` during measurement windows.
- `GET /api/v1/health` - app/db status and DB ping latency.
- `GET /api/v1/health/metrics?allow=1` - p50/p95/p99 per normalized route.
- Response headers include `Server-Timing` and `X-Response-Time`.
- Socket score patches include `perf.committedAt` and `perf.emittedAt`.

## Deployment checklist

- [ ] Neon pooled `DATABASE_URL` configured.
- [ ] Neon direct `DIRECT_URL` configured.
- [ ] Render and Neon in same region.
- [ ] `JWT_SECRET` strong/generated.
- [ ] `BACKUP_ENABLED=false`.
- [ ] `TRUST_PROXY=1`.
- [ ] Health check `/api/v1/health` green.
- [ ] Run Prisma migrations on deploy.
- [ ] For event day, optionally set `KEEPWARM_ENABLED=true`.
- [ ] Capture baseline/after metrics in `docs/perf/BASELINE.md` and `docs/perf/AFTER.md`.
