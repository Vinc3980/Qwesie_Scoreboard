# Qwesie TV

[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)

Professional volleyball live-scoring, television broadcast graphics, and match statistics platform.

> License: not yet selected. Add a `LICENSE` file before making the repository public or distributing it.

## Prerequisites

- **Node.js 20+** and **npm**
- **PostgreSQL 16+** (local install, Docker, or managed instance)
- **Git**

Windows helper scripts for a local PostgreSQL cluster are included in `scripts/` (default `C:\Program Files\PostgreSQL\17\bin`, port `5433`).

## Quickstart

### 1. Clone

```bash
git clone <REPO_URL>
cd qwesie_tv_scoreboard
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Environment setup

Copy the example env files and edit values for your machine:

```powershell
Copy-Item .env.example .env
Copy-Item server\.env.example server\.env
Copy-Item client\.env.example client\.env
```

Minimum server settings in `server/.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/qwesie_tv?schema=public"
CORS_ORIGIN="http://localhost:5173"
JWT_SECRET="replace-with-a-long-random-secret-at-least-32-chars"
```

> Never commit `.env` files. Real secrets must stay local or in a secret manager.

### 4. Database setup

Option A - local PostgreSQL helper scripts (Windows):

```powershell
npm run db:init
```

Option B - Docker:

```bash
docker compose up -d db
```

Option C - use an existing PostgreSQL instance and set `DATABASE_URL` accordingly.

### 5. Migrate and seed

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

`prisma:seed` is safe for development and creates initial data only when appropriate.

### 6. Run in development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend/API: http://localhost:5000
- API base: http://localhost:5000/api/v1

### 7. Build and start in production

```bash
npm run build
npm run start
```

For production, set secure env vars (`NODE_ENV=production`, strong `JWT_SECRET`, production `DATABASE_URL`, correct `CORS_ORIGIN`), then apply migrations:

```bash
npm --workspace=server exec prisma migrate deploy
```

## First-run admin setup

1. Start the app and open the frontend.
2. On a fresh database, complete the bootstrap/admin setup flow shown by the app.
3. Sign in with the admin account you created.
4. Create scorer/viewer users from the admin/users area as needed.

## OBS setup (3 steps)

1. **Start Qwesie TV** and open a match in Live Control.
2. **Copy the output URL** from the Outputs panel (Scorebug, Graphics, or All-in-one court output).
3. **Add a Browser Source in OBS** with URL from step 2, width `1920`, height `1080`, and enable “Shutdown source when not visible” / “Refresh browser when scene becomes active” as needed. See [docs/OBS_INTEGRATION.md](docs/OBS_INTEGRATION.md) for details.

## Useful commands

```bash
npm run dev          # server + client
npm run build        # shared + server + client
npm run typecheck    # all workspaces
npm run test         # server tests
npm run test:e2e     # client Playwright tests
npm run verify       # build + server tests + e2e
```

## Documentation

- [docs/](docs/) - project documentation
- [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)
- [docs/OBS_INTEGRATION.md](docs/OBS_INTEGRATION.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)

## Repository notes

- `.env` files are ignored; commit only `.env.example` files.
- `uploads/`, backups, local DB data, `node_modules/`, and build output are ignored.
- The repo uses Conventional Commits.

## CI

CI runs on GitHub Actions (Node LTS, PostgreSQL service, install, Prisma generate/migrate, typecheck, build, server tests). Add the workflow badge here after the first push.
