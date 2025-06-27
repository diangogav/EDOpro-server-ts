#!/bin/bash

set -e

echo "🌀 Clonando repositorios base..."

rm -rf repositories
mkdir repositories
cd repositories

# Clone required repositories
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/CardScripts.git scripts && \
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/BabelCDB.git databases && \
    git clone --depth 1 --branch master https://github.com/ProjectIgnis/LFLists banlists-project-ignis && \
    git clone --depth 1 --branch master https://github.com/mycard/ygopro-scripts.git mercury-scripts && \
    git clone --depth 1 --branch master https://github.com/evolutionygo/pre-release-database-cdb mercury-prerelases && \
    git clone --depth 1 --branch main https://github.com/evolutionygo/cards-art-server mercury-arts && \
    git clone --depth 1 --branch main https://github.com/termitaklk/lflist banlists-evolution && \
    git clone --depth 1 --branch main https://github.com/evolutionygo/server-formats-cdb.git alternatives && \
    wget -O mercury-lflist.conf https://raw.githubusercontent.com/termitaklk/koishi-Iflist/main/lflist.conf && \
    wget -O mercury-cards.cdb https://github.com/purerosefallen/ygopro/raw/server/cards.cdb

# Prepare banlists and pre-releases folder
    mkdir banlists mercury-pre-releases-cdbs && \
    mv banlists-project-ignis/* banlists/ && \
    mv banlists-evolution/* banlists/ && \
    find mercury-prerelases mercury-arts -name "*.cdb" -exec cp {} mercury-pre-releases-cdbs/ \;
