# Backup & Restore

Qwesie TV can create periodic PostgreSQL backups (`pg_dump` plain SQL files) and applies retention automatically.

## Backups

- **Location:** `BACKUP_DIR` (default `backups/`, resolved relative to the server working directory unless absolute).
- **Schedule:** on startup (`BACKUP_ON_START=true`) and every `BACKUP_INTERVAL_MINUTES` while matches are in live/ready states (`LIVE`, `PAUSED`, `BETWEEN_SETS`, `SUSPENDED`, `READY`).
- **Format:** `qwesie-tv-<reason>-YYYYMMDD-HHMMSS.sql` (plain SQL dump from `pg_dump`).
- **Retention:** keep the most recent `BACKUP_KEEP` files (default `48`) **plus** one backup per day for the last `BACKUP_KEEP_DAILY_DAYS` days (default `7`). Pruning runs after each successful backup.
- **Visibility:** backup start/success/failure and retention actions are logged to server logs **and** printed to the console (`stdout`/`stderr`) so operators can see failures immediately.
- **Cross-platform:** `PG_DUMP_PATH` is configurable (command name on PATH or absolute path). Works on Windows and Linux when PostgreSQL client tools are installed and accessible.

> Backups are best-effort. Also back up/restore the `uploads/` directory separately (logos/media user data).

## Restore (documented command)

The following restores a PostgreSQL backup produced by Qwesie TV.

### Prerequisites
- PostgreSQL client tools installed (`psql` on PATH, or use full path / `PG_RESTORE_PATH` for your scripts).
- Target database exists and credentials are correct.
- Stop the app/server before restoring to avoid writes during restore.

### Commands
```bash
# Linux/macOS
psql "<PLAIN_DATABASE_URL>" -v ON_ERROR_STOP=1 -f backups/qwesie-tv-startup-YYYYMMDD-HHMMSS.sql

# Windows (PowerShell)
# If password is not embedded in the URL, set PGPASSWORD for the session:
# $env:PGPASSWORD = "<password>"
psql "postgresql://postgres:postgres@localhost:5433/qwesie_tv" -v ON_ERROR_STOP=1 -f ".\backups\qwesie-tv-startup-YYYYMMDD-HHMMSS.sql"
```

If your `DATABASE_URL` includes Prisma query params (e.g. `?schema=public`), remove them for `psql`/`pg_dump` (use the plain Postgres connection URL).

## Restore smoke test

1. Pick a recent backup file from `BACKUP_DIR`.
2. Restore into a **temporary/test database** (recommended), not production:
   ```bash
   createdb qwesie_tv_restore_test
   psql "postgresql://<user>:<pass>@<host>:<port>/qwesie_tv_restore_test" -v ON_ERROR_STOP=1 -f backups/<backup-file>.sql
   ```
3. Point a test server instance at the restored DB:
   - `DATABASE_URL=postgresql://<user>:<pass>@<host>:<port>/qwesie_tv_restore_test`
4. Verify:
   - `GET /api/v1/health` reports database connected
   - matches/teams/events and broadcast-related state load as expected
5. Drop the temporary database after verification.

## Notes
- Restoring into an existing populated database may fail or produce conflicts depending on state; prefer a clean/temporary DB for smoke tests.
- Ensure `pg_dump`/`psql` versions are compatible with your PostgreSQL server.
- For match-day reliability, confirm a recent successful backup exists before going live and rehearse restore in a non-production environment.
