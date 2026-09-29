FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install ffmpeg, python3, curl for yt-dlp
RUN apk add --no-cache ffmpeg python3 curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Install deps
COPY package.json ./
COPY apps/bot/package.json ./apps/bot/
RUN bun install --filter @nibolbot/bot

# Copy source
COPY apps/bot ./apps/bot
COPY packages ./packages

WORKDIR /app/apps/bot
EXPOSE 3001

CMD ["bun", "src/index.ts"]
