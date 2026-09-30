# Stage 1: Build Panel (Svelte Vite build)
FROM oven/bun:1-alpine AS panel-builder
WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/panel/package.json ./apps/panel/
RUN bun install --filter panel

COPY packages ./packages
COPY apps/panel ./apps/panel
WORKDIR /app/apps/panel
RUN bun run build

# Stage 2: API Server
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install deps (including workspace dependencies)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN bun install --filter @nibolbot/api

# Copy source
COPY packages ./packages
COPY apps/api ./apps/api

# Copy built panel static files for SPA fallback serving
COPY --from=panel-builder /app/apps/panel/dist ./apps/panel/dist

WORKDIR /app/apps/api
EXPOSE 3000

CMD ["bun", "src/index.ts"]
