FROM node:18

# Install Lua 5.1 dan dependencies
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    lua5.1 \
    liblua5.1-0-dev \
    luarocks \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Lua dependencies yang dibutuhkan Prometheus
RUN luarocks install luafilesystem
RUN luarocks install argparse

WORKDIR /app

# Download Prometheus
RUN wget https://github.com/levno-710/Prometheus/archive/refs/heads/master.zip \
    && unzip master.zip \
    && rm master.zip

# Verify installations
RUN echo "=== Lua Version ===" && lua5.1 -v
RUN echo "=== Prometheus Files ===" && ls -la /app/Prometheus-master/
RUN echo "=== Test Prometheus ===" && cd /app/Prometheus-master && lua5.1 cli.lua --help || echo "CLI help not available"

# Create temp directory
RUN mkdir -p /app/Prometheus-master/temp

# Set environment variable
ENV PROMETHEUS_PATH=/app/Prometheus-master

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy bot files
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/ || exit 1

CMD ["node", "bot.js"]
