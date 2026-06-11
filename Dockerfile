# Stage 1: Clone repositories and assemble resources
FROM public.ecr.aws/docker/library/node:24.11.0-bullseye-slim AS resources-builder

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends wget git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /repositories

# Clone required repositories
RUN git clone --depth 1 --branch master https://github.com/ProjectIgnis/CardScripts.git edopro-card-scripts && \
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/BabelCDB.git edopro-card-databases && \
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/LFLists edopro-banlists-ignis && \
    git clone --depth 1 --branch main https://github.com/termitaklk/lflist edopro-banlists-evolution && \
    git clone --depth 1 --branch main https://github.com/diangogav/evolution-assets evolution-assets && \
    # git clone --depth 1 https://code.moenext.com/nanahira/ygopro-scripts ygopro-scripts && \
    git clone --depth 1 https://github.com/Fluorohydride/ygopro-scripts ygopro-scripts && \
    git clone --depth 1 --branch master https://github.com/evolutionygo/pre-release-database-cdb ygopro-prereleases-cdb && \
    git clone --depth 1 --branch main https://github.com/evolutionygo/cards-art-server ygopro-cards-art && \
    git clone --depth 1 --branch main https://github.com/evolutionygo/server-formats-cdb.git ygopro-format-alternatives && \
    wget -O ygopro-lflist.conf https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf && \
    wget -O ygopro-cards.cdb https://cdntx.moecube.com/ygopro-database/zh-CN/cards.cdb

# Copy selected banlists into corresponding alternative folders.
# JTP comes from evolution-assets: it lists BASE card codes, so alt-art
# variants stay legal via their alias (the termitaklk list shipped variant
# codes, which rejected the base cards in whitelist validation).
RUN bash -c 'set -e; \
    declare -A MAP=( \
    ["2010.03 Edison(Pre Errata)"]="edison" \
    ["2014.04 HAT (Pre Errata)"]="hat" \
    ["GOAT"]="goat" \
    ["Rush"]="rush" \
    ["Speed"]="speed" \
    ["Tengu.Plant"]="tengu" \
    ["World"]="world" \
    ["MD.2025.03"]="md" \
    ["Genesys"]="genesys" \
    ); \
    for name in "${!MAP[@]}"; do \
    src="./edopro-banlists-evolution/${name}.lflist.conf"; \
    [ -f "$src" ] || src="./edopro-banlists-ignis/${name}.lflist.conf"; \
    cp "$src" "./ygopro-format-alternatives/${MAP[$name]}/lflist.conf"; \
    done; \
    cp ./evolution-assets/lflist/jtp.lflist.conf ./ygopro-format-alternatives/jtp/lflist.conf'

# Assemble final resources structure and strip .git dirs
RUN find . -name ".git" -type d -exec rm -rf {} + 2>/dev/null; \
    mkdir -p /resources/edopro \
             /resources/ygopro/base \
             /resources/ygopro/ocg && \
    \
    # ── edopro ── \
    cp -r edopro-card-scripts /resources/edopro/scripts && \
    cp -r edopro-card-databases /resources/edopro/databases && \
    cp -r edopro-banlists-ignis /resources/edopro/banlists-ignis && \
    cp -r edopro-banlists-evolution /resources/edopro/banlists-evolution && \
    \
    # ── ygopro (each repo as its own independent folder) ── \
    cp -r ygopro-scripts /resources/ygopro/base/script && \
    cp ygopro-lflist.conf /resources/ygopro/base/lflist.conf && \
    cp ygopro-cards.cdb /resources/ygopro/base/cards.cdb && \
    cp -r ygopro-prereleases-cdb /resources/ygopro/prereleases-cdb && \
    cp -r ygopro-cards-art /resources/ygopro/cards-art && \
    cp -r ygopro-format-alternatives /resources/ygopro/alternatives && \
    cp edopro-banlists-ignis/OCG.lflist.conf /resources/ygopro/ocg/lflist.conf


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
    apt-get install -y --no-install-recommends curl liblua5.3-dev libsqlite3-dev libevent-dev dumb-init && \
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

# All resources (assembled in Stage 1)
COPY --from=resources-builder /resources ./resources

CMD ["dumb-init", "node", "./src/index.js"]
