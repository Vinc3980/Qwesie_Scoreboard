# Qwesie TV - production-oriented container image
# Builds shared/server/client and runs the API + Socket.IO server.
# The built client is served by the same Express server (SERVE_CLIENT=true).

FROM node:20-alpine AS base
WORKDIR /app
ENV CI=true
# Prisma engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
# Force dev deps even if the host injects NODE_ENV=production at build time.
RUN npm ci --include=dev

FROM deps AS build
COPY . .
# `prisma generate` only needs a syntactically valid URL; no database connection
# is made during the build. Real values are injected at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV DATABASE_URL_UNPOOLED="postgresql://build:build@localhost:5432/build?schema=public"
# Generate the Prisma client before compiling the server.
RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
# Copy manifests and install production deps (prisma CLI included for migrate deploy)
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# Copy built artifacts and the generated Prisma client
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 5000
# Render/Fly/Railway inject PORT; the server reads it (default 5000).
# Retry migrations briefly to tolerate a cold/suspended managed Postgres, then
# refuse to start if they never succeed (avoids serving against a stale schema).
CMD ["sh", "-c", "if [ -z \"$DATABASE_URL_UNPOOLED\" ]; then export DATABASE_URL_UNPOOLED=\"$DATABASE_URL\"; fi; ok=0; for i in 1 2 3 4 5; do if npx prisma migrate deploy --schema=server/prisma/schema.prisma; then ok=1; break; fi; echo \"prisma migrate deploy failed (attempt $i/5), retrying in 5s...\"; sleep 5; done; if [ \"$ok\" != \"1\" ]; then echo 'FATAL: prisma migrate deploy failed after 5 attempts'; exit 1; fi; exec node server/dist/index.js"]
