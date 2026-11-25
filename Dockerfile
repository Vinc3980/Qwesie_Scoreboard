# Qwesie TV - production-oriented container image
# Builds shared/server/client and runs the API + Socket.IO server.
# The built client is served by the same Express server (SERVE_CLIENT=true).

FROM node:20-alpine AS base
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

FROM deps AS build
COPY . .
# Generate the Prisma client before compiling the server.
RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
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
# Retry migrations briefly to tolerate a cold/suspended managed Postgres.
CMD ["sh", "-c", "for i in 1 2 3 4 5; do npx prisma migrate deploy --schema=server/prisma/schema.prisma && break; echo \"prisma migrate deploy failed (attempt $i/5), retrying in 5s...\"; sleep 5; done; exec node server/dist/index.js"]
