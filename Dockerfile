FROM node:18-slim

RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    lua5.1 \
    luarocks \
    && rm -rf /var/lib/apt/lists/*

RUN luarocks install luafilesystem || true
RUN luarocks install argparse || true

WORKDIR /app

RUN wget -q https://github.com/levno-710/Prometheus/archive/refs/heads/master.zip \
    && unzip -q master.zip \
    && rm master.zip

ENV PROMETHEUS_PATH=/app/Prometheus-master

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["node", "bot.js"]
