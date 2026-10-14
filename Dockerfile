
FROM node:22-bookworm-slim

# Install FFmpeg and required utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp for Linux
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY server ./server

# Configure runtime
ENV NODE_ENV=production
ENV DOWNLOADS_DIR=/app/downloads

RUN mkdir -p /app/downloads

EXPOSE 4000

CMD ["node", "server/server.js"]
