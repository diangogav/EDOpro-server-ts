#!/bin/bash

set -e

echo "Cloning repositories..."

rm -rf repositories
mkdir repositories
cd repositories

git clone --depth 1 --branch master https://github.com/ProjectIgnis/CardScripts.git edopro-card-scripts
git clone --depth 1 --branch master https://github.com/ProjectIgnis/BabelCDB.git edopro-card-databases
git clone --depth 1 --branch master https://github.com/ProjectIgnis/LFLists edopro-banlists-ignis
git clone --depth 1 --branch main https://github.com/termitaklk/lflist edopro-banlists-evolution
git clone --depth 1 https://code.moenext.com/nanahira/ygopro-scripts ygopro-scripts
git clone --depth 1 --branch master https://github.com/evolutionygo/pre-release-database-cdb ygopro-prereleases-cdb
git clone --depth 1 --branch main https://github.com/evolutionygo/cards-art-server ygopro-cards-art
git clone --depth 1 --branch main https://github.com/evolutionygo/server-formats-cdb.git ygopro-format-alternatives
wget -O ygopro-lflist.conf https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf
wget -O ygopro-cards.cdb https://cdntx.moecube.com/ygopro-database/zh-CN/cards.cdb

echo "Repositories cloned successfully."
