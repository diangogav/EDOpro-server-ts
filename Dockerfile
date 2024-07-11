FROM public.ecr.aws/ubuntu/ubuntu:22.04_stable as core-integrator-builder

RUN apt-get update -y && \
    apt-get install -y python3 python3-pip wget tar git && \
    pip install conan

WORKDIR /repositories

RUN git clone --depth 1 https://github.com/ProjectIgnis/CardScripts.git scripts && \
    git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB.git databases && \
    git clone --depth 1 https://github.com/ProjectIgnis/LFLists banlists-project-ignis && \
    git clone --depth 1 https://github.com/termitaklk/lflist banlists-evolution && \
    git clone --depth 1 https://github.com/Smile-DK/ygopro-scripts.git mercury-scripts && \
    wget -O mercury-lflist.conf https://raw.githubusercontent.com/fallenstardust/YGOMobile-cn-ko-en/master/mobile/assets/data/conf/lflist.conf && \
    wget -O mercury-cards.cdb https://raw.githubusercontent.com/moecube/ygopro/server/cards.cdb

RUN mkdir banlists
RUN mv banlists-project-ignis/* banlists/
RUN mv banlists-evolution/* banlists/

RUN conan profile detect

WORKDIR /app

COPY ./core .

RUN wget https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz && \
    tar -zxvf premake-5.0.0-beta2-linux.tar.gz && \
    rm premake-5.0.0-beta2-linux.tar.gz

RUN conan install . --build missing --output-folder=./dependencies --options=libcurl/8.6.0:shared=True && \
    ./premake5 gmake && \
    make config=release

FROM public.ecr.aws/docker/library/node:20.15.0 as server-builder

ENV USER node

WORKDIR /server

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build && \
    npm prune --production

FROM public.ecr.aws/docker/library/node:20.15.0-slim

RUN apt-get update && apt-get install -y curl git && apt-get install -y liblua5.3-dev libsqlite3-dev libevent-dev dumb-init

WORKDIR /app

COPY certs ./certs

COPY --from=server-builder /server/dist ./
COPY --from=server-builder /server/package.json ./package.json
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=server-builder /server/mercury ./mercury
COPY --from=core-integrator-builder /app/libocgcore.so ./core/libocgcore.so
COPY --from=core-integrator-builder /app/CoreIntegrator ./core/CoreIntegrator
COPY --from=core-integrator-builder /repositories/scripts ./scripts/evolution/
COPY --from=core-integrator-builder /repositories/databases ./databases/evolution/
COPY --from=core-integrator-builder /repositories/banlists ./banlists/evolution/
COPY --from=core-integrator-builder /repositories/mercury-scripts ./mercury/script
COPY --from=core-integrator-builder /repositories/mercury-lflist.conf ./mercury/lflist.conf
COPY --from=core-integrator-builder /repositories/mercury-cards.cdb ./mercury/cards.cdb

EXPOSE 4000 7711 7911 7922
USER $USER
CMD ["dumb-init", "node", "./src/index.js"]
