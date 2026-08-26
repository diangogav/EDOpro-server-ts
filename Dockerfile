# syntax=docker/dockerfile:1
# Stage 1: Clone repositories and assemble resources
FROM public.ecr.aws/docker/library/node:24.11.0-bullseye-slim AS resources-builder

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends wget git ca-certificates jq && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Resource layout is owned by scripts/clone_repositories.sh + scripts/setup_resources.sh — the
# single source of truth, shared with local dev (README) and the runtime refresh
# loop (entrypoint). This produces /build/resources/releases/<id> and a current symlink.
COPY scripts/ ./scripts/
# resources.manifest.json = public base (+ the shipped example). The private override is
# NOT part of the build — it is provided at runtime, so the seed is public-only.
COPY resources.manifest*.json ./
# Assemble the PUBLIC resource seed so the server boots immediately. Private sources are
# fetched at runtime by the entrypoint's updater (mounted private override + a token from
# the container env); no token ever touches the build.
RUN bash scripts/clone_repositories.sh && bash scripts/setup_resources.sh


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

# pnpm is pinned by package.json's "packageManager" field; corepack activates that
# exact version. The prompt must be off or the non-interactive build hangs on it.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

# pnpm-workspace.yaml carries allowBuilds — without it pnpm skips the install
# scripts of bcrypt/better-sqlite3/lzma-native and the server dies at require().
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

RUN git clone --depth 1 https://github.com/diangogav/evolution-types.git ./src/evolution-types

COPY . .

# --ignore-scripts is required: unlike `npm prune`, pnpm re-runs the `prepare`
# lifecycle after pruning, and `prepare` calls husky — a devDependency the prune
# just removed. Without the flag the stage dies with "husky: not found".
RUN pnpm build && \
    pnpm prune --prod --ignore-scripts


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
# IMPORTANT: every entry MUST also carry a "format" tag ("tcg" / "jtp" / "edison")
# matching resolveBotPool's pools. Format-scoped random join commands (e.g.
# "pre,ai", "ed,ai", "jtp,ai") call pickRandom(format) — a curated botlist without
# "format" tags makes that lookup return null for every user of those commands
# (JOINERROR). See config/botlist.example.json for the reference shape.
COPY --from=server-builder /server/config ./config

# CoreIntegrator binaries
COPY --from=core-builder /app/libocgcore.so ./core/libocgcore.so
COPY --from=core-builder /app/CoreIntegrator ./core/CoreIntegrator

# All resources (assembled in Stage 1): releases/<id> + current symlink — the
# baked seed so the server boots immediately. The entrypoint's background loop
# then refreshes resources/current in place and the in-memory reload picks it up.
COPY --from=resources-builder /build/resources ./resources

# Provisioning scripts (scripts/) + the PUBLIC manifest — reused by the runtime updater loop.
# The private override is not baked in: mount it at runtime (-v .../resources.manifest.private.json
# :/app/resources.manifest.private.json) and pass a read-only token via the container env
# (--env-file); the entrypoint sets up git-credentials before the loop clones private sources.
COPY scripts/ ./scripts/
COPY resources.manifest*.json ./

CMD ["dumb-init", "bash", "scripts/entrypoint.sh"]
