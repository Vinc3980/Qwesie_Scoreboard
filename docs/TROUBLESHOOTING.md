# Troubleshooting

Common issues and fixes for match-day operation.

## Console/UI access issues

### Cannot open console or login page
- Confirm the server is running and which port/mode is active:
  - **Production/same-port:** UI and API on server `PORT` (default `5000`)
  - **Development:** client dev server (commonly `5173`) + API server (`5000`)
- Check firewall allows inbound TCP on the relevant port(s).
- From another device, use the host machine's **LAN IP** (not `localhost`).

### Bootstrap/login/auth problems
- **First-run setup:** complete the protected admin bootstrap flow when prompted (token/flow as configured by environment).
- **401/session expired:** sign in again; sensitive actions (password/token-version changes) can invalidate sessions.
- **Locked out:** wait for lockout window to clear or use admin recovery/reset flows (recovery code, temp password, or optional SMTP token reset if enabled/configured).
- **Password reset email not received:** SMTP is optional and must be configured (`SMTP_*`, `APP_BASE_URL`); use admin reset or recovery codes if SMTP is unavailable.
- **Dev auto-login not working:** only active when `DEV_AUTO_LOGIN=true` and `NODE_ENV` is not `production`.

## OBS / output issues

### Output is blank in OBS
- Confirm you used a **stable court URL** (`/out/court/<court>/scorebug|graphics|all`) or correct per-match URL.
- Ensure a match is active/associated with that court for stable URLs.
- Open the URL in a normal browser on the OBS machine:
  - Transparent page with no visible content can be correct if nothing should be on air / no active data.
  - If the page fails to load, check URL, port, firewall, and server status.
- In OBS Browser Source: correct URL, 1920x1080 (or canvas), FPS 30, disable shutdown-on-hide and refresh-on-scene-activate.

### Output not updating / appears stale
- Check **Outputs** panel status (CONNECTED/revision/heartbeat where shown).
- Verify network stability between OBS machine and server.
- Restart the Browser Source (last resort) or re-open output URL; outputs should reconnect automatically and refresh snapshots.
- Confirm operators are taking changes to **program** (preview changes are not sent to OBS).

### Wrong court/match shown
- Verify `<court>` in stable URL matches the match's court.
- If using per-match URLs, confirm `<matchId>` is correct.
- Check active match resolution for the court in the console.

### Error text visible on air
- Current output behavior is designed to render **transparent/nothing** on missing data or recoverable errors. If you see error text, capture the exact URL, screenshot, browser console (if accessible), and server logs for investigation.

## Scoring/control issues

### Score/controls not responding
- Confirm you are authenticated with a role allowed to mutate (ADMIN/SCORER).
- Check API/network errors in browser dev tools and server logs.
- Rate limiting is applied to auth routes only; normal match operations should not be broadly rate-limited. If mutations fail with 429, note the endpoint and logs.

### Preview/program confusion
- **Preview** is console-only planning state and never appears in OBS/program output.
- Use **Take** (Enter) to publish preview to program; **Clear** (Esc) removes/clears as applicable in the cue workflow.
- "Send test graphic" targets program/output to validate OBS path.

## Backup/restore issues

### Backups not created
- Ensure PostgreSQL client tools are installed and reachable (`PG_DUMP_PATH`, default `pg_dump`).
- Verify `DATABASE_URL`, `BACKUP_DIR`, permissions, and disk space.
- Check console/server logs: backup start/success/failure and retention actions are printed to console and logs.
- Backups run on startup (if enabled) and on interval while matches are in live/ready states.

### Restore problems
- Stop the app before restore; restore into a clean/temporary DB for smoke testing.
- Remove Prisma query params from DB URL when using `psql` directly if needed.
- Follow [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for commands and smoke test steps.

## Environment/config issues
- See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for the full configuration table.
- In production, `JWT_SECRET` must be strong (>=32 chars, not default) or the server will exit.
- `DATABASE_URL` must point to a reachable PostgreSQL instance; `/api/v1/health` reports DB status.

## When escalating/reporting
Collect:
- exact URL(s), court/match ID, time, and what was expected vs observed
- console/OBS screenshots, browser console errors (if available), and server logs
- whether issue occurred in dev or production mode and network topology (same machine/LAN)
- steps to reproduce and whether outputs recovered automatically
