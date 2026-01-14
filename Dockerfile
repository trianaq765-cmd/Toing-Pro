FROM node:18-slim

RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    lua5.1 \
    luarocks \
    && rm -rf /var/lib/apt/lists/*

RUN luarocks install luafilesystem || true

WORKDIR /app

RUN wget -q https://github.com/levno-710/Prometheus/archive/refs/heads/master.zip \
    && unzip -q master.zip && rm master.zip \
    && mv Prometheus-master prometheus

ENV PROMETHEUS_PATH=/app/prometheus

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "bot.js"]
