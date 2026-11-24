# Qwesie TV — Deployment Guide

## 1. Prerequisites
- Node.js 20+ / npm
- PostgreSQL 16+ (reachable by server)
- (Optional) Docker & Docker Compose for containerized deployment
- Reverse proxy (Nginx/Caddy/Traefik) for HTTPS and WebSocket forwarding in production

## 2. Environment variables

### Server (`server/.env` or process env) — see `server/.env.example`
| Variable | Description | Example |
|---|---|---|
| `PORT` | HTTP/Socket.IO port | `5000` |
| `NODE_ENV` | `development` / `production` / `test` | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@db:5432/qwesie_tv?schema=public` |
| `CORS_ORIGIN` | Allowed client origin(s), comma-separated or `*` (trusted LAN only) | `http://192.168.1.20:5000` |
| `JWT_SECRET` | Secret for auth tokens (set strong value in prod) | (32+ chars) |
| `JWT_COOKIE_NAME` | Auth cookie name | `qwesie_token` |
| `UPLOADS_DIR` | Local uploads directory | `uploads` |
| `SERVE_CLIENT` / `CLIENT_DIST_DIR` | Serve built client and optional dist path override | `true` / (auto) |
| `BACKUP_ON_START` / `BACKUP_INTERVAL_MINUTES` / `BACKUP_DIR` / `PG_DUMP_PATH` | Automatic `pg_dump` backups (best-effort) | `true` / `5` / `backups` / `pg_dump` |

### Client
- Dev uses Vite proxy for `/api` and `/socket.io` to backend.
- Production: serve built `client/dist` from a host that can reach backend, or configure reverse proxy to route `/api` and `/socket.io` to the server. For multi-machine/OBS reliability, serve a production build with correct backend reachability.

## 3. Build & run (bare metal, single-port)
```powershell
npm install
# configure server/.env (copy from server/.env.example) with DATABASE_URL, JWT_SECRET, CORS_ORIGIN, etc.
npm run prisma:generate
npm run prisma:migrate   # apply migrations
npm run prisma:seed      # optional
npm run build            # shared + server + client
npm start                # serves API + Socket.IO + built client from PORT (default 5000)
```
- Windows convenience: `start.bat` runs build then start.
- On startup the server logs LAN URLs (Console/Live/Scorebug/Graphics). If optional `qrcode-terminal` is installed, a QR for the console URL is printed; otherwise the URL is logged.
- Production serving of the built UI is enabled by default (`NODE_ENV=production` or `SERVE_CLIENT=true`). `CLIENT_DIST_DIR` can override the client build path.
- Dev workflow remains available via `npm run dev` (Vite proxy + server watch). For multi-machine/OBS, prefer the built single-port mode on a LAN-reachable host.

## 4. Docker (reference)
- `Dockerfile` builds shared/server/client and runs the server (serving API/Socket.IO; static client can be served separately or added per your setup).
- `docker-compose.yml` provides app + PostgreSQL services for a production-like stack.
- Before first run: set secure secrets, review ports/CORS, and run migrations (`prisma migrate deploy`) against the database.

## 5. Reverse proxy, HTTPS, WebSockets
- Terminate **HTTPS** at the proxy; forward to app over trusted network.
- Proxy `/api` (HTTP) and `/socket.io` (HTTP upgrade/WebSocket) to the server with proper headers (`Upgrade`, `Connection`, `X-Forwarded-*`).
- Ensure timeouts support long-lived WebSocket connections.
- Set `CORS_ORIGIN` to production client origins.

## 6. Static assets & caching
- Serve `client/dist` assets with immutable caching for hashed files; avoid caching HTML aggressively.
- Broadcast/overlay routes must remain reachable and transparent-capable in OBS browser sources.

## 7. Database operations & backups
- Use managed PostgreSQL or hardened self-hosted instance; restrict network access.
- **Backups:** schedule regular logical backups (`pg_dump`) and/or volume snapshots; test restore procedures.
- Run migrations as a controlled deployment step; retain completed match/event data (do not destructive-reset in production).

## 8. Logging, monitoring, and resilience
- Server logs to stdout/stderr (captured by container/orchestrator/process manager); integrate with centralized logging/alerting in production.
- Monitor health endpoint, DB connectivity, and WebSocket availability.
- Socket clients implement reconnect/resync/stale detection; validate behavior under network interruptions.

## 9. Security checklist
- Strong `JWT_SECRET`, DB credentials, and restricted CORS.
- Enforce authentication/authorization and permission-controlled, auditable corrections for production operators.
- Keep dependencies updated and run builds/tests in CI before release.