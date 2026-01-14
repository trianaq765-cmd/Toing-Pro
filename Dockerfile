FROM node:18-slim

RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    lua5.1 \
    luarocks \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 6.0
RUN wget https://packages.microsoft.com/config/debian/11/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y dotnet-sdk-6.0 \
    && rm -rf /var/lib/apt/lists/*

RUN luarocks install luafilesystem || true

WORKDIR /app

# Setup Prometheus
RUN wget -q https://github.com/levno-710/Prometheus/archive/refs/heads/master.zip \
    && unzip -q master.zip && rm master.zip \
    && mv Prometheus-master prometheus

# Setup IronBrew
RUN git clone https://github.com/IsEmil/IronBrew.git ironbrew || true
RUN cd ironbrew && dotnet restore && dotnet build -c Release || echo "IronBrew build skipped"

ENV PROMETHEUS_PATH=/app/prometheus
ENV IRONBREW_PATH=/app/ironbrew

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["node", "bot.js"]
