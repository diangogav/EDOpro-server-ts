# Stage 1: Build CoreIntegrator
FROM public.ecr.aws/ubuntu/ubuntu:22.04_stable as core-integrator-builder

# Install required dependencies and Conan
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip wget tar git autoconf ca-certificates g++ \
        m4 automake libtool pkg-config make && \
    rm -rf /var/lib/apt/lists/* && \
    pip install conan

WORKDIR /repositories

# Clone required repositories
RUN git clone --depth 1 --branch master https://github.com/ProjectIgnis/CardScripts.git scripts && \
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/BabelCDB.git databases && \
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/LFLists banlists-project-ignis && \
    git clone --depth 1 --branch master https://github.com/mycard/ygopro-scripts.git mercury-scripts && \
    git clone --depth 1 --branch master https://github.com/evolutionygo/pre-release-database-cdb mercury-prerelases && \
    git clone --depth 1 https://github.com/termitaklk/lflist banlists-evolution && \
    git clone --depth 1 https://github.com/evolutionygo/server-formats-cdb.git alternatives && \
    wget -O mercury-lflist.conf https://raw.githubusercontent.com/termitaklk/koishi-Iflist/main/lflist.conf && \
    wget -O mercury-cards.cdb https://github.com/purerosefallen/ygopro/raw/server/cards.cdb

# Prepare banlists and pre-releases folder
RUN mkdir banlists mercury-pre-releases-cdbs && \
    mv banlists-project-ignis/* banlists/ && \
    mv banlists-evolution/* banlists/ && \
    find mercury-prerelases -name "*.cdb" -exec cp {} mercury-pre-releases-cdbs/ \;

# Copy binary and setup directories
COPY ./mercury/ygopro .

# Copy scripts and binaries into each alternative directory
RUN for dir in ./alternatives/*/; do \
    echo "$dir/script"; \
    cp -r ./mercury-scripts/* "$dir/script"; \
    cp ygopro "$dir"; \
    done

# Copy selected banlists into corresponding alternative folders
RUN bash -c 'set -e; \
    declare -A MAP=( \
        ["2010.03 Edison(PreErrata)"]="edison" \
        ["2014.4 HAT"]="hat" \
        ["jtp-oficial"]="jtp" \
        ["GOAT"]="goat" \
        ["2008.03 GX"]="gx" \
        ["mdc"]="mdc" \
        ["Rush"]="rush" \
        ["Speed"]="speed" \
        ["Tengu.Plant"]="tengu" \
        ["World"]="world" \
        ["MD.2025.03"]="md" \
    ); \
    for name in "${!MAP[@]}"; do \
        cp "./banlists/${name}.lflist.conf" "./alternatives/${MAP[$name]}/lflist.conf"; \
    done'

# Generate Conan profile
RUN conan profile detect

WORKDIR /app

# Copy CoreIntegrator source
COPY ./core .

# Download and install premake binary
ADD https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz /tmp/premake.tar.gz
RUN tar -zxvf /tmp/premake.tar.gz -C /usr/local/bin && rm /tmp/premake.tar.gz

# Install dependencies and build the application
RUN conan install . --build missing --output-folder=./dependencies --options=libcurl/8.6.0:shared=True && \
    premake5 gmake && \
    make config=release


# Stage 2: Build Node.js server
FROM public.ecr.aws/docker/library/node:22.11.0 as server-builder

ENV USER node

WORKDIR /server

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Clone shared types
RUN git clone --depth 1 https://github.com/diangogav/evolution-types.git ./src/evolution-types

# Copy server source and build
COPY . .
COPY --from=core-integrator-builder /repositories/mercury-pre-releases-cdbs ./databases/mercury-pre-releases
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./databases/mercury-pre-releases

RUN npm run generate-mercury-pre-releases-cdb && \
    npm run build && \
    npm prune --production


# Stage 3: Final image
FROM public.ecr.aws/docker/library/node:22.11.0-slim

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl git wget liblua5.3-dev libsqlite3-dev libevent-dev dumb-init && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# SSL Certificates
COPY certs ./certs

# Server
COPY --from=server-builder /server/dist ./
COPY --from=server-builder /server/package.json ./package.json
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=server-builder /server/mercury ./mercury

# CoreIntegrator binaries
COPY --from=core-integrator-builder /app/libocgcore.so ./core/libocgcore.so
COPY --from=core-integrator-builder /app/CoreIntegrator ./core/CoreIntegrator

# Evolution Resources
COPY --from=core-integrator-builder /repositories/scripts ./scripts/evolution/
COPY --from=core-integrator-builder /repositories/databases ./databases/evolution/
COPY --from=core-integrator-builder /repositories/mercury-pre-releases-cdbs ./databases/mercury-pre-releases
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./databases/mercury-pre-releases
COPY --from=core-integrator-builder /repositories/banlists ./banlists/evolution/

# Mercury
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/script
COPY --from=core-integrator-builder /repositories/mercury-lflist.conf ./mercury/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/cards.cdb
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/alternatives/md/cards.cdb

# Mercury Pre-releases
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/pre-releases/tcg/script
COPY --from=core-integrator-builder /repositories/mercury-lflist.conf ./mercury/pre-releases/tcg/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-prerelases/script/ ./mercury/pre-releases/tcg/script/

COPY --from=server-builder /server/mercury/pre-releases/tcg/cards.cdb ./mercury/pre-releases/ocg/cards.cdb
COPY --from=core-integrator-builder /repositories/banlists/OCG.lflist.conf ./mercury/pre-releases/ocg/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-prerelases/script/ ./mercury/pre-releases/ocg/script/

# Mercury OCG
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/ocg/script
COPY --from=core-integrator-builder /repositories/banlists/OCG.lflist.conf ./mercury/ocg/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/ocg/cards.cdb
COPY --from=core-integrator-builder /repositories/ygopro ./mercury/ocg/ygopro

# Mercury Alternatives
COPY --from=core-integrator-builder /repositories/alternatives ./mercury/alternatives/

EXPOSE 4000 7711 7911 7922
USER $USER
CMD ["dumb-init", "node", "./src/index.js"]