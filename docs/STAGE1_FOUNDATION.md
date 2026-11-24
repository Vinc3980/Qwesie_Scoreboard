# Stage 1 Foundation — Qwesie TV

This document summarizes the application foundation established for Stage 1.

## Architecture overview

- **Monorepo (npm workspaces):** `shared` (types/constants/validation), `server` (API, sockets, data access), `client` (React UI).
- **Frontend:** React + TypeScript + Vite SPA with React Router, TanStack Query for server-state workflows, centralized Axios API client, Socket.IO client, Tailwind CSS design tokens, Framer Motion, and Recharts.
- **Backend:** Express + TypeScript REST API with versioned routes (`/api/v1`), Zod-based request validation, centralized error handling, structured logging, auth-ready request context middleware, Prisma data access, and Socket.IO real-time transport.
- **Database:** PostgreSQL with Prisma schema, initial migration, and a safe development seed (`server/prisma/seed.ts`) that only creates data when the database is empty.
- **Shared contracts:** Reusable TypeScript types, constants, and validation schemas in `shared/src`.

## Runtime flow

1. Client sends HTTP requests through `client/src/services/api.ts` (proxied to backend in development).
2. Server validates input, executes domain logic/services, persists via Prisma, and returns standardized API responses.
3. Server emits real-time match updates through Socket.IO (`server/src/sockets/socketManager.ts`).
4. Client consumes REST + socket updates to render control, stats, and overlay experiences.

## Key foundation areas

### Configuration & environment
- Server environment loading/validation: `server/src/config/env.ts`
- Example server environment: `server/.env.example`
- Vite dev proxy for API and Socket.IO: `client/vite.config.ts`

### Backend
- Entry/bootstrap: `server/src/index.ts`
- Route composition and versioning: `server/src/routes/index.ts`
- Health endpoint: `GET /api/v1/health`
- Middleware: request validation (`middleware/validate.ts`), auth-ready context (`middleware/auth.ts`), global errors (`middleware/errorHandler.ts`)
- Utilities: logging (`utils/logger.ts`), typed errors (`utils/errors.ts`)

### Frontend
- App providers and routing: `client/src/App.tsx`, `client/src/main.tsx`
- Layout/navigation shell: `client/src/layouts/RootLayout.tsx`
- Notification system: `client/src/contexts/NotificationContext.tsx`
- Reusable UI primitives: `client/src/components/ui/*`

### Database
- Schema: `server/prisma/schema.prisma`
- Initial migration: `server/prisma/migrations/20261113100145_init`
- Seed: `server/prisma/seed.ts`
- Local Windows helper scripts: `scripts/db-init.ps1`, `scripts/db-start.ps1`, `scripts/db-stop.ps1`

## Local development expectations

- Install dependencies from repo root: `npm install`
- Start local PostgreSQL (port 5433 by default scripts): `npm run db:init` / `npm run db:start`
- Apply migrations and seed as needed: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:seed`
- Run app: `npm run dev` (or `npm run dev:server` and `npm run dev:client`)

This foundation is intended to support subsequent stages (domain features, scoring workflows, broadcast graphics, statistics, and production hardening) without restructuring core boundaries.
