# syntax=docker/dockerfile:1

# ---- Base: Node + OpenSSL (needed by Prisma) -------------------------------------------
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependencies (cached unless a package manifest changes) ---------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# ---- Build: web bundle + Prisma client, then drop dev dependencies ---------------------
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/web/dist
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/web/dist ./web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, create the first owner from SEED_* if none exists, then start.
# All three steps are safe to repeat on every restart.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma && (node --import tsx server/prisma/seed.ts || true) && exec node --import tsx server/src/index.ts"]
