FROM public.ecr.aws/ubuntu/ubuntu:22.04_stable as core-integrator-builder

RUN apt-get update -y && \
    apt-get install -y python3 python3-pip wget tar git autoconf && \
    pip install conan

WORKDIR /repositories

RUN git clone --depth 1 https://github.com/ProjectIgnis/CardScripts.git scripts && \
    git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB.git databases && \
    git clone --depth 1 https://github.com/ProjectIgnis/LFLists banlists-project-ignis && \
    git clone --depth 1 https://github.com/termitaklk/lflist banlists-evolution && \
    git clone --depth 1 https://github.com/mycard/ygopro-scripts.git mercury-scripts && \
    git clone --depth 1 https://code.moenext.com/mycard/pre-release-database-cdb.git mercury-prerelases && \
    git clone --depth 1 https://github.com/evolutionygo/server-formats-cdb.git alternatives && \
    wget -O mercury-lflist.conf https://raw.githubusercontent.com/termitaklk/koishi-Iflist/main/lflist.conf && \
    wget -O mercury-cards.cdb https://github.com/purerosefallen/ygopro/raw/server/cards.cdb

RUN mkdir banlists mercury-pre-releases-cdbs
RUN mv banlists-project-ignis/* banlists/
RUN mv banlists-evolution/* banlists/
RUN find mercury-prerelases -name "*.cdb" -exec cp {} mercury-pre-releases-cdbs/ \;

COPY ./mercury/ygopro .

RUN for dir in ./alternatives/*/; do \
    echo "$dir"/script; \
    cp -r ./mercury-scripts/* "$dir"/script; \
    cp ygopro "$dir"; \
    done

RUN cp './banlists/2010.03 Edison(PreErrata).lflist.conf' ./alternatives/edison/lflist.conf && \
    cp './banlists/2014.4 HAT.lflist.conf' ./alternatives/hat/lflist.conf && \
    cp 'banlists/jtp-oficial.lflist.conf' ./alternatives/jtp/lflist.conf && \
    cp 'banlists/GOAT.lflist.conf' ./alternatives/goat/lflist.conf && \
    cp 'banlists/2008.03 GX.lflist.conf' ./alternatives/gx/lflist.conf && \
    cp 'banlists/mdc.lflist.conf' ./alternatives/mdc/lflist.conf && \
    cp 'banlists/Rush.lflist.conf' ./alternatives/rush/lflist.conf && \
    cp 'banlists/Speed.lflist.conf' ./alternatives/speed/lflist.conf && \
    cp 'banlists/Tengu.Plant.lflist.conf' ./alternatives/tengu/lflist.conf && \
    cp 'banlists/World.lflist.conf' ./alternatives/world/lflist.conf && \
    cp 'banlists/MD.2025.03.lflist.conf' ./alternatives/md/lflist.conf

RUN conan profile detect

WORKDIR /app

COPY ./core .

RUN wget https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz && \
    tar -zxvf premake-5.0.0-beta2-linux.tar.gz && \
    rm premake-5.0.0-beta2-linux.tar.gz

RUN conan install . --build missing --output-folder=./dependencies --options=libcurl/8.6.0:shared=True && \
    ./premake5 gmake && \
    make config=release

FROM public.ecr.aws/docker/library/node:22.11.0 as server-builder

ENV USER node

WORKDIR /server

COPY package.json package-lock.json ./

RUN npm ci

RUN git clone --depth 1 https://github.com/diangogav/evolution-types.git ./src/evolution-types

COPY . .

RUN npm run build && \
    npm prune --production

FROM public.ecr.aws/docker/library/node:22.11.0-slim

RUN apt-get update && apt-get install -y curl git wget && apt-get install -y liblua5.3-dev libsqlite3-dev libevent-dev dumb-init 

WORKDIR /app

COPY certs ./certs

# Server
COPY --from=server-builder /server/dist ./
COPY --from=server-builder /server/package.json ./package.json
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=server-builder /server/mercury ./mercury
COPY --from=core-integrator-builder /app/libocgcore.so ./core/libocgcore.so
COPY --from=core-integrator-builder /app/CoreIntegrator ./core/CoreIntegrator
# Evolution Resources
COPY --from=core-integrator-builder /repositories/scripts ./scripts/evolution/
COPY --from=core-integrator-builder /repositories/databases ./databases/evolution/
COPY --from=core-integrator-builder /repositories/mercury-pre-releases-cdbs ./databases/mercury/pre-releases
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./databases/mercury
COPY --from=core-integrator-builder /repositories/banlists ./banlists/evolution/
## Mercury
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/script
COPY --from=core-integrator-builder /repositories/mercury-lflist.conf ./mercury/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/cards.cdb
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/alternatives/md/cards.cdb
## Mercury Pre releases
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/pre-releases/script
COPY --from=core-integrator-builder /repositories/mercury-lflist.conf ./mercury/pre-releases/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-prerelases/script/ ./mercury/pre-releases/script/
## Mercury OCG
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/ocg/script
COPY --from=core-integrator-builder /repositories/banlists/OCG.lflist.conf ./mercury/ocg/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/ocg/cards.cdb
COPY --from=core-integrator-builder /repositories/ygopro ./mercury/ocg/ygopro
## Mercury Alternatives
COPY --from=core-integrator-builder /repositories/alternatives ./mercury/alternatives/

EXPOSE 4000 7711 7911 7922
USER $USER
CMD ["dumb-init", "node", "./src/index.js"]
