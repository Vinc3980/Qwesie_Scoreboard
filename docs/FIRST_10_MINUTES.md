# First 10 Minutes (Match Day Quick Start)

A one-page guide to install/run Qwesie TV, create a match, add OBS sources, and go live.

## 1) Install and start (≈3–5 min)
1. **Prerequisites:** Node.js/npm, PostgreSQL running, and (recommended) PostgreSQL client tools (`pg_dump`, `psql`) for backups/restore.
2. **Configure env:** copy `server/.env.example` to `server/.env` (or set repo `.env`) and set at minimum:
   - `DATABASE_URL` (valid Postgres connection)
   - `JWT_SECRET` (strong, >=32 chars; required in production)
   - `CORS_ORIGIN` if needed (LAN/dev/server ports are auto-covered in common cases)
3. **Install dependencies:** from repo root run `npm install`.
4. **Database:** ensure DB is reachable, run migrations/generate/seed as required by your environment (e.g. `npm run prisma:migrate`, `npm run prisma:seed`), or use your local DB scripts if applicable.
5. **Start app:**
   - **Production/same-port:** `npm run build` then `npm start` (serves UI + API on `PORT`, default 5000).
   - **Development:** `npm run dev` (API on 5000, client dev server typically on 5173).
6. **Open console:** browse to the server/console URL shown in startup logs (e.g. `http://<lan-ip>:5000/` or `http://localhost:5173/` in dev). On first run, complete **admin bootstrap** if prompted.

## 2) Create and prepare a match (≈2–3 min)
1. **Sign in** (ADMIN/SCORER for match operations).
2. Go to **Matches → New Match** and enter teams, court, rules/sets, and branding as needed.
3. Open the match **Overview** and follow the **match-day checklist** (rosters/lineups/readiness/outputs). Use **Open Live Control** when ready.
4. In **Settings** (if needed), confirm persisted defaults/branding for faster setup.

## 3) Add OBS sources (≈2 min)
1. Open **Outputs** from the console (top bar/drawer `O`, or **Live Control → Outputs** tab).
2. Copy **stable court output URLs** (recommended, configure once):
   - Scorebug: `/out/court/<court>/scorebug`
   - Graphics: `/out/court/<court>/graphics`
   - All-in-one: `/out/court/<court>/all`
3. In OBS add **Browser Source(s)**:
   - URL: copied output URL (use LAN IP/port reachable from OBS machine)
   - Width/Height: `1920x1080` (or your canvas)
   - FPS: `30`
   - Enable transparency (background is transparent by default)
   - Disable “Shutdown source when not visible” and “Refresh browser when scene becomes active” for reliability
4. Verify in Outputs panel: **CONNECTED** and correct court/match context.

## 4) Go live and operate (≈1–2 min)
1. In **Live Control**: confirm readiness, then use **Score** tab for scoring/actions/timeouts/subs.
2. Use **Graphics** tab for preview/program cue workflow (Preview → Take/Enter, Esc clear) and break/scene controls as needed.
3. **Outputs** tab/drawer: copy/open URLs and use **Send test graphic** to confirm program output reaches OBS.
4. Monitor connection/health indicators; if a laptop sleeps or network drops, outputs are designed to reconnect and keep last good state (show nothing on air when data is missing).

## Quick references
- Env vars: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- OBS details: [OBS_INTEGRATION.md](OBS_INTEGRATION.md)
- Match-day checklist: [MATCH_DAY_CHECKLIST.md](MATCH_DAY_CHECKLIST.md)
- Troubleshooting: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Backups/restore: [BACKUP_RESTORE.md](BACKUP_RESTORE.md)
