# Stage 1: Build Node.js server
FROM public.ecr.aws/docker/library/node:24.11.0-bullseye AS server-builder

ENV USER=node

WORKDIR /server

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Clone shared types
RUN git clone --depth 1 https://github.com/diangogav/evolution-types.git ./src/evolution-types

# Copy server source and build
COPY . .

# Copy assets from the base image (pre-built)
# This assumes you have built 'evolution-core:latest' previously
COPY --from=evolution-core:latest /repositories/mercury-pre-releases-cdbs ./databases/mercury-pre-releases
COPY --from=evolution-core:latest /repositories/mercury-cards.cdb ./databases/mercury-pre-releases

RUN npm run generate-mercury-pre-releases-cdb && \
    npm run build && \
    npm prune --production


# Stage 2: Final image
FROM public.ecr.aws/docker/library/node:24.11.0-slim

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl git wget liblua5.3-dev libsqlite3-dev libevent-dev dumb-init && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Server
COPY --from=server-builder /server/dist ./
COPY --from=server-builder /server/package.json ./package.json
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=server-builder /server/mercury ./mercury

# CoreIntegrator binaries (From Base Image)
COPY --from=evolution-core:latest /app/libocgcore.so ./core/libocgcore.so
COPY --from=evolution-core:latest /app/CoreIntegrator ./core/CoreIntegrator

# Evolution Resources (From Base Image)
COPY --from=evolution-core:latest /repositories/scripts ./scripts/evolution/
COPY --from=evolution-core:latest /repositories/databases ./databases/evolution/
COPY --from=evolution-core:latest /repositories/mercury-pre-releases-cdbs ./databases/mercury-pre-releases
COPY --from=evolution-core:latest /repositories/mercury-cards.cdb ./databases/mercury-pre-releases
COPY --from=evolution-core:latest /repositories/banlists ./banlists/evolution/

# Mercury (From Base Image)
COPY --from=evolution-core:latest /repositories/mercury-scripts ./mercury/script
COPY --from=evolution-core:latest /repositories/mercury-lflist.conf ./mercury/lflist.conf
COPY --from=evolution-core:latest /repositories/mercury-cards.cdb ./mercury/cards.cdb
COPY --from=evolution-core:latest /repositories/mercury-cards.cdb ./mercury/alternatives/md/cards.cdb
COPY --from=evolution-core:latest /repositories/mercury-cards.cdb ./mercury/alternatives/genesys/cards.cdb

# Mercury Pre-releases (From Base Image)
COPY --from=evolution-core:latest /repositories/mercury-scripts ./mercury/pre-releases/tcg/script
COPY --from=evolution-core:latest /repositories/mercury-lflist.conf ./mercury/pre-releases/tcg/lflist.conf
COPY --from=evolution-core:latest /repositories/mercury-prerelases/script/ ./mercury/pre-releases/tcg/script/
COPY --from=evolution-core:latest /repositories/mercury-arts/script/ ./mercury/pre-releases/tcg/script/

COPY --from=evolution-core:latest /repositories/mercury-scripts ./mercury/pre-releases/ocg/script
COPY --from=server-builder /server/mercury/pre-releases/tcg/cards.cdb ./mercury/pre-releases/ocg/cards.cdb
COPY --from=evolution-core:latest /repositories/banlists/OCG.lflist.conf ./mercury/pre-releases/ocg/lflist.conf
COPY --from=evolution-core:latest /repositories/mercury-prerelases/script/ ./mercury/pre-releases/ocg/script/
COPY --from=evolution-core:latest /repositories/mercury-arts/script/ ./mercury/pre-releases/ocg/script/

# Mercury OCG (From Base Image)
COPY --from=evolution-core:latest /repositories/mercury-scripts ./mercury/ocg/script
COPY --from=evolution-core:latest /repositories/banlists/OCG.lflist.conf ./mercury/ocg/lflist.conf
COPY --from=evolution-core:latest /repositories/mercury-cards.cdb ./mercury/ocg/cards.cdb
COPY --from=evolution-core:latest /repositories/ygopro ./mercury/ocg/ygopro

# Mercury Alternatives (From Base Image)
COPY --from=evolution-core:latest /repositories/alternatives ./mercury/alternatives/

# USER node
CMD ["dumb-init", "node", "./src/index.js"]