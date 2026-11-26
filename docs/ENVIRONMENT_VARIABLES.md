# Environment Variables

Single reference table for server/runtime configuration. Defaults shown are those defined in `server/src/config/env.ts` unless noted. Set variables in `server/.env` or repo-root `.env`.

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `5000` | No | HTTP/Socket.IO server port. |
| `NODE_ENV` | `development` | No | `development`, `production`, or `test`. Affects security checks, dev auto-login, and default client serving behavior. |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/qwesie_tv?schema=public` | Yes (real env) | PostgreSQL connection string for Prisma/server. Use a valid DB/credentials in your environment. On Neon use the pooled (`-pooler`) string. |
| `DATABASE_URL_UNPOOLED` | *(falls back to `DATABASE_URL`)* | No | Direct (non-pooled) PostgreSQL connection string used by Prisma Migrate and `pg_dump`. On Neon use the host without `-pooler`. |
| `CORS_ORIGIN` | `http://localhost:5173` | No | Comma-separated allowed browser origins, or `*` (trusted LAN only). Server additionally auto-allows private LAN/dev/server-port origins (localhost/127.0.0.1 and RFC1918 addresses on dev/server/common ports) for match-day access. |
| `CLIENT_DIST_DIR` | *(empty)* | No | Optional path to built client `dist` directory to serve from the server. If empty, server checks common `client/dist` locations. |
| `SERVE_CLIENT` | *(unset → prod=true, dev=false)* | No | `true`/`false`. When true and client dist exists, server serves the UI and SPA routes on `PORT`. |
| `UPLOADS_DIR` | `uploads` | No | Directory for uploaded assets (logos/media). Served at `/uploads`. |
| `JWT_SECRET` | `qwesie-tv-development-secret-key-32chars` | **Yes in production** | JWT signing secret. In production the server exits if missing/weak/default or `< 32` chars. |
| `JWT_COOKIE_NAME` | `qwesie_token` | No | Auth cookie name. |
| `DEV_AUTO_LOGIN` | `false` | No | Development convenience only. When `true` and not production, injects a real non-VIEWER dev scorer user/session context; ignored/disabled in production. |
| `ALLOW_SCORER_PIN` | `false` | No | Enables scorer PIN-related behavior where supported by auth flows. |
| `BOOTSTRAP_SETUP_TOKEN` | *(empty)* | No | Optional one-time/setup token path for protected first-run admin bootstrap (see auth/bootstrap flow). |
| `SMTP_HOST` | *(empty)* | No | SMTP host for optional password reset email layer. SMTP is considered enabled only when host/user/from are set. |
| `SMTP_PORT` | `587` | No | SMTP port. |
| `SMTP_USER` | *(empty)* | No | SMTP username. |
| `SMTP_PASS` | *(empty)* | No | SMTP password/secret. |
| `SMTP_FROM` | *(empty)* | No | From address for reset emails. |
| `SMTP_SECURE` | `false` | No | `true` for TLS/secure SMTP transport as configured. |
| `APP_BASE_URL` | *(empty)* | No | Base URL used in password reset links (e.g. `http://<lan-ip>:5000`). Set for reliable LAN email/token reset links. |
| `BACKUP_DIR` | `backups` | No | Backup output directory. Relative paths resolve from server working directory; absolute paths supported. |
| `BACKUP_INTERVAL_MINUTES` | `5` | No | Interval for periodic backups while matches are in live/ready states (`LIVE`, `PAUSED`, `BETWEEN_SETS`, `SUSPENDED`, `READY`). |
| `BACKUP_ON_START` | `true` | No | Run a startup backup when scheduler starts. |
| `BACKUP_KEEP` | `48` | No | Retention: keep N most recent backup files. |
| `BACKUP_KEEP_DAILY_DAYS` | `7` | No | Retention: also keep one backup per day for the last D days (in addition to recent backups). |
| `PG_DUMP_PATH` | `pg_dump` | No | `pg_dump` command name or absolute path (Windows/Linux configurable). |
| `PG_RESTORE_PATH` | `psql` | No | `psql` command name or absolute path for restore operations/documented commands. |

## Notes
- **Production:** set a strong `JWT_SECRET`, a correct `DATABASE_URL`, and review `CORS_ORIGIN`/network exposure. The server enforces JWT secret strength in production.
- **LAN match day:** use the machine's LAN IP in browser/OBS URLs. CORS and startup output are designed to help with common LAN/dev/server-port access, but firewall/router rules must still allow TCP `PORT`.
- **Backups:** require PostgreSQL client tools (`pg_dump`/`psql`) installed and reachable. See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).
- **Client env:** Vite dev usually needs no client env vars due to proxy; see `client/.env.example`.
