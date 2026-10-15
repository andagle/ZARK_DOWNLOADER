FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    git \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages --no-cache-dir -U \
    "yt-dlp[default]" \
    bgutil-ytdlp-pot-provider

RUN git clone --depth 1 --single-branch --branch 2.0.2 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
    /root/bgutil-ytdlp-pot-provider \
    && cd /root/bgutil-ytdlp-pot-provider/server \
    && npm ci \
    && npx tsc

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server ./server

ENV NODE_ENV=production
ENV DOWNLOADS_DIR=/app/downloads

RUN mkdir -p /app/downloads

EXPOSE 4000

CMD ["node", "server/server.js"]