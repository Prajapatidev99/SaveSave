FROM node:20-slim

# Install Python 3, pip, and ffmpeg for media processing
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally (will be updated at container start)
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages || pip3 install --no-cache-dir yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Entrypoint script that updates yt-dlp before starting the server
# This ensures yt-dlp stays current even if the Docker image is old
RUN echo '#!/bin/bash\n\
echo "🔄 Updating yt-dlp to latest version..."\n\
pip3 install --no-cache-dir --upgrade yt-dlp --break-system-packages 2>/dev/null || \
pip3 install --no-cache-dir --upgrade yt-dlp 2>/dev/null || \
echo "⚠️  yt-dlp update failed, using existing version"\n\
echo "✅ yt-dlp version: $(python3 -m yt_dlp --version 2>/dev/null || echo unknown)"\n\
echo "🚀 Starting SaveSave server..."\n\
exec node server.js' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 3000

ENV PORT=3000

CMD ["/app/entrypoint.sh"]
