# Administrator Manual

Administrative setup, security, configuration, backups, and operational maintenance for Qwesie TV.

## Deployment and startup
- **Install/build:** `npm install`, configure environment, run DB migrations/seed as required, then:
  - Production: `npm run build` && `npm start`
  - Development: `npm run dev`
- **Ports/modes:** default server `PORT=5000`. In production/same-port mode the server can serve the built client; in dev the client typically runs on 5173 with API on 5000.
- **Health:** `GET /api/v1/health` reports service/DB status.
- **Configuration reference:** see [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for the complete env var table.

## Authentication and security
- **Production safety:** set a strong `JWT_SECRET` (>=32 chars, non-default). Server refuses weak/default secrets in production.
- **First-run bootstrap:** initial admin/setup is protected by the bootstrap flow (and optional setup token configuration, if used). Complete bootstrap before normal operation.
- **Password policy and lockout:** server-side password policy and brute-force lockout controls (per user/IP) are enforced with generic error responses.
- **Sessions/tokens:** JWTs include token versioning; sensitive changes (e.g. password/reset/logout-all flows) invalidate prior sessions as designed.
- **User management:** admin can manage users/roles and recovery actions via UI/API/CLI as provided.
- **Recovery options:**
  - Admin reset / temp password flows (may require password change on next login)
  - Hashed one-time recovery codes
  - Optional SMTP-based single-use reset token flow (30-minute expiry) when SMTP is configured
- **CLI:** `npm run auth:reset-admin` (server workspace/script) for admin recovery/reset scenarios.
- **Dev convenience:** `DEV_AUTO_LOGIN=true` only in non-production environments to auto-establish a real non-VIEWER dev scorer context; never enable in production.
- **CORS and access:** configure `CORS_ORIGIN` as needed; server auto-covers common private LAN/dev/server-port origins. Restrict network exposure and firewall appropriately.
- **Rate limiting:** tightened on auth routes (login/bootstrap/reset/change-password and auth endpoints) to reduce abuse while avoiding broad interference with match operations.
- **Public read surface:** overlay/public outputs require unauthenticated access only to necessary endpoints (e.g. match-by-id, broadcast scene/graphic/templates, court active resolution). Operator/console data reads are protected.

## Backups and restore
- **Backups:** automatic `pg_dump`-based backups to `BACKUP_DIR` (startup and periodic while live/ready matches exist).
- **Config:** `BACKUP_INTERVAL_MINUTES`, `BACKUP_ON_START`, `BACKUP_KEEP`, `BACKUP_KEEP_DAILY_DAYS`, `PG_DUMP_PATH`, `PG_RESTORE_PATH`.
- **Retention:** keeps most recent `BACKUP_KEEP` plus one per day for `BACKUP_KEEP_DAILY_DAYS`.
- **Visibility:** backup start/success/failure and prune actions are logged to server logs and printed to console.
- **Restore:** stop app, restore into clean/temporary DB for smoke tests, verify with `/api/v1/health` and app checks. See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## Match-day operations
- Ensure stable court output URLs are configured once in OBS: `/out/court/<court>/scorebug|graphics|all`.
- Verify Outputs panel connection/status and use **Send test graphic** before going live.
- Outputs are designed to reconnect after drops/restarts/sleep and render transparent when data is missing (no on-air error text).

## Data and hygiene notes
- Local runtime artifacts (DB data/logs/scratch) should be kept out of repo root and out of version control as configured (e.g. `.local/` for local DB/scratch in this workspace setup; `uploads/` user data preserved separately).
- Back up `uploads/` separately if logos/media must be preserved.
- Dev-only diagnostic scripts live under `scripts/dev/` and are not part of production runtime.

## Maintenance
- Keep Node/PostgreSQL/client tools updated and compatible.
- Rehearse restore and full match-day workflow in non-production before events.
- Review logs after incidents (auth lockouts, backup failures, socket disconnects, DB connectivity).
- Run verification in suitable environments: `npm run build`, `npm run test --workspace=server`, and Playwright e2e (`npm run verify` when browsers/app/DB are available).

## Related docs
- [FIRST_10_MINUTES.md](FIRST_10_MINUTES.md)
- [OBS_INTEGRATION.md](OBS_INTEGRATION.md)
- [MATCH_DAY_CHECKLIST.md](MATCH_DAY_CHECKLIST.md)
- [MATCH_OPERATOR_MANUAL.md](MATCH_OPERATOR_MANUAL.md)
- [BROADCAST_OPERATOR_MANUAL.md](BROADCAST_OPERATOR_MANUAL.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md)
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
