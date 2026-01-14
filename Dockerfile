FROM node:18

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    lua5.1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Download Prometheus dari URL yang benar
RUN wget https://github.com/levno-710/Prometheus/archive/refs/heads/master.zip \
    && unzip master.zip \
    && rm master.zip

# Verify installation
RUN lua5.1 -v
RUN ls -la /app/Prometheus-master/

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy bot files
COPY . .

CMD ["node", "bot.js"]
