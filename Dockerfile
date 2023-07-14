FROM ubuntu:22.04 as core-integrator-builder

RUN apt-get update -y && \
    apt-get install -y python3 python3-pip wget tar git && \
    pip install conan

WORKDIR /repositories

RUN git clone https://github.com/ProjectIgnis/CardScripts.git scripts && \
    git clone https://github.com/ProjectIgnis/BabelCDB.git databases && \
    git clone https://github.com/ygopromdc/lflist.git banlists

RUN conan profile detect

WORKDIR /app

COPY ./core .

RUN wget https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz && \
    tar -zxvf premake-5.0.0-beta2-linux.tar.gz && \
    rm premake-5.0.0-beta2-linux.tar.gz

RUN conan install . --build missing --output-folder=./dependencies && \
    ./premake5 gmake && \
    make config=release

FROM node:18.16.1 as server-builder

WORKDIR /server

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:18.16.1

WORKDIR /app

COPY --from=server-builder /server/dist ./src/
COPY --from=server-builder /server/package.json ./package.json
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=core-integrator-builder /app/libocgcore.so ./core/libocgcore.so
COPY --from=core-integrator-builder /app/CoreIntegrator ./core/CoreIntegrator
COPY --from=core-integrator-builder /repositories/scripts ./core/scripts/
COPY --from=core-integrator-builder /repositories/databases ./databases/
COPY --from=core-integrator-builder /repositories/banlists ./banlists/

CMD ["npm", "start"]