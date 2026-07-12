# Stage 1: Clone repositories and assemble resources
FROM public.ecr.aws/docker/library/node:24.11.0-bullseye-slim AS resources-builder

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends wget git ca-certificates jq && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Resource layout is owned by clone_repositories.sh + setup_resources.sh — the
# single source of truth, shared with local dev (README) and the runtime refresh
# loop (entrypoint). This produces /build/resources/releases/<id> and a current symlink.
COPY clone_repositories.sh setup_resources.sh resources-lib.sh resources.manifest.json ./
RUN bash clone_repositories.sh && bash setup_resources.sh


# Stage 2: Build CoreIntegrator (C++)
FROM public.ecr.aws/docker/library/node:24.11.0-bullseye-slim AS core-builder

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    g++ make cmake pkg-config \
    libboost-system-dev \
    libsqlite3-dev \
    libjsoncpp-dev \
    nlohmann-json3-dev \
    libcurl4-openssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./core .

RUN cmake -B build -S . -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build


# Stage 3: Build Node.js server
FROM public.ecr.aws/docker/library/node:24.11.0-bullseye AS server-builder

WORKDIR /server

COPY package.json package-lock.json ./
RUN npm ci

RUN git clone --depth 1 https://github.com/diangogav/evolution-types.git ./src/evolution-types

COPY . .

RUN npm run build && \
    npm prune --production


# Stage 4: Final image
FROM public.ecr.aws/docker/library/node:24.11.0-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl wget git ca-certificates jq liblua5.3-dev libsqlite3-dev libevent-dev dumb-init && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Server
COPY --from=server-builder /server/dist ./
COPY --from=server-builder /server/package.json ./package.json
COPY --from=server-builder /server/node_modules ./node_modules

# WindBot botlist (read at boot by FileBotlistRepository when ENABLE_WINDBOT=true).
# tsc only emits dist/, so config/ must be copied explicitly or the server crashes
# at boot with ENOENT when windbot is enabled. Replace botlist.example.json with a
# curated botlist whose deck names match the WindBot image's bots.json.
COPY --from=server-builder /server/config ./config

# CoreIntegrator binaries
COPY --from=core-builder /app/libocgcore.so ./core/libocgcore.so
COPY --from=core-builder /app/CoreIntegrator ./core/CoreIntegrator

# All resources (assembled in Stage 1): releases/<id> + current symlink — the
# baked seed so the server boots immediately. The entrypoint's background loop
# then refreshes resources/current in place and the in-memory reload picks it up.
COPY --from=resources-builder /build/resources ./resources

# Provisioning scripts (single source of truth) + entrypoint, reused at runtime.
COPY clone_repositories.sh setup_resources.sh resources-lib.sh resources.manifest.json resources-updater.sh entrypoint.sh ./

CMD ["dumb-init", "bash", "entrypoint.sh"]
