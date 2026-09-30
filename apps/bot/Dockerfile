FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install ffmpeg, python3, curl, chromium, nodejs for yt-dlp & headless recording
RUN apk add --no-cache ffmpeg python3 curl chromium nodejs \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && mkdir -p /root/.cache/ms-playwright/ffmpeg-1011 \
    && ln -sf /usr/bin/ffmpeg /root/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux

# Install deps (including workspace dependencies)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/bot/package.json ./apps/bot/
RUN bun install --filter @nibolbot/bot

# Copy source
COPY packages ./packages
COPY apps/bot ./apps/bot

WORKDIR /app/apps/bot
EXPOSE 3001

CMD ["bun", "src/index.ts"]
