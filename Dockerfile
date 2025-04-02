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
## Mercury Pre releases
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/pre-releases/script
COPY --from=core-integrator-builder /repositories/mercury-lflist.conf ./mercury/pre-releases/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-prerelases/script/ ./mercury/pre-releases/script/
## Mercury Alternatives
COPY --from=core-integrator-builder /repositories/alternatives ./mercury/alternatives
RUN for dir in ./mercury/alternatives/*/; do \
    cp -r ./mercury/script "$dir"; \
    cp -r ./mercury/ygopro "$dir"; \
    done

RUN wget -O ./mercury/alternatives/edison/lflist.conf 'https://raw.githubusercontent.com/termitaklk/lflist/refs/heads/main/2010.03%20Edison(PreErrata).lflist.conf'
RUN wget -O ./mercury/alternatives/hat/lflist.conf 'https://raw.githubusercontent.com/termitaklk/lflist/refs/heads/main/2014.4%20HAT.lflist.conf'
RUN wget -O ./mercury/alternatives/jtp/lflist.conf 'https://raw.githubusercontent.com/termitaklk/lflist/refs/heads/main/jtp-oficial.lflist.conf'
RUN wget -O ./mercury/alternatives/goat/lflist.conf 'https://raw.githubusercontent.com/ProjectIgnis/LFLists/refs/heads/master/GOAT.lflist.conf'
RUN wget -O ./mercury/alternatives/gx/lflist.conf 'https://raw.githubusercontent.com/termitaklk/lflist/refs/heads/main/2008.03%20GX.lflist.conf'
RUN wget -O ./mercury/alternatives/mdc/lflist.conf 'https://raw.githubusercontent.com/termitaklk/lflist/refs/heads/main/mdc.lflist.conf'
RUN wget -O ./mercury/alternatives/rush/lflist.conf 'https://raw.githubusercontent.com/ProjectIgnis/LFLists/refs/heads/master/Rush.lflist.conf'
RUN wget -O ./mercury/alternatives/speed/lflist.conf 'https://raw.githubusercontent.com/ProjectIgnis/LFLists/refs/heads/master/Speed.lflist.conf'
RUN wget -O ./mercury/alternatives/tengu/lflist.conf 'https://raw.githubusercontent.com/termitaklk/lflist/refs/heads/main/Tengu.Plant.lflist.conf'
RUN wget -O ./mercury/alternatives/world/lflist.conf 'https://raw.githubusercontent.com/ProjectIgnis/LFLists/refs/heads/master/World.lflist.conf'

EXPOSE 4000 7711 7911 7922
USER $USER
CMD ["dumb-init", "node", "./src/index.js"]
