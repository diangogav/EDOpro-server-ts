#!/bin/bash

set -e

# Clone necessary repositories

git clone --depth 1 https://github.com/ProjectIgnis/CardScripts.git ./scripts/evolution/
git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB.git ./databases/evolution/
git clone --depth 1 https://github.com/mycard/ygopro-scripts.git ./mercury/script
git clone --depth 1 https://github.com/ProjectIgnis/LFLists ./banlists/evolution/
wget -O ./mercury/lflist.conf https://raw.githubusercontent.com/fallenstardust/YGOMobile-cn-ko-en/master/mobile/assets/data/conf/lflist.conf
wget -O ./mercury/cards.cdb https://github.com/purerosefallen/ygopro/raw/server/cards.cdb

