FROM node:lts-bookworm-slim AS base
WORKDIR /usr/src/app
RUN apt-get -y update && apt-get install -y python3 build-essential gcc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


FROM base AS dev
# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --include=dev
# Create node user directory with proper permissions
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
USER node
COPY --chown=node:node . .
CMD ["node", "./server.js"]

FROM base AS production
# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Create node user directory with proper permissions
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
USER node
COPY --chown=node:node . .
CMD ["node", "./server.js"]

FROM base AS test
ENV NODE_ENV=test
# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --include=dev
# Create node user directory with proper permissions
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
USER node
COPY --chown=node:node . .
CMD ["npm", "run", "start"]

EXPOSE 3000