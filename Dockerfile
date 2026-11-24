# Qwesie TV - production-oriented container image
# Builds shared/server/client and runs the API + Socket.IO server.
# Serve client/dist via a reverse proxy/CDN in production for best performance.

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
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copy manifests and install production deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev && npm cache clean --force
# Copy built artifacts
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/client/dist ./client/dist

EXPOSE 5000
# Run migrations separately in deployment (e.g. prisma migrate deploy) before/at startup as appropriate
CMD ["node", "server/dist/index.js"]