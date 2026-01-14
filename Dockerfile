FROM node:18-slim

# Install Lua 5.1
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    lua5.1 \
    luarocks \
    && rm -rf /var/lib/apt/lists/*

# Install Lua dependencies
RUN luarocks install luafilesystem || true
RUN luarocks install argparse || true

WORKDIR /app

# Download Prometheus
RUN wget -q https://github.com/levno-710/Prometheus/archive/refs/heads/master.zip \
    && unzip -q master.zip \
    && rm master.zip

# Verify installation
RUN lua5.1 -v && ls -la /app/Prometheus-master/

# Environment
ENV PROMETHEUS_PATH=/app/Prometheus-master

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --production

# Copy bot
COPY . .

CMD ["node", "bot.js"]
