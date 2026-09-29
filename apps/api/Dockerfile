FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install deps
COPY package.json ./
COPY apps/api/package.json ./apps/api/
RUN bun install --filter @nibolbot/api

# Copy source
COPY apps/api ./apps/api
COPY packages ./packages

WORKDIR /app/apps/api
EXPOSE 3000

CMD ["bun", "src/index.ts"]
