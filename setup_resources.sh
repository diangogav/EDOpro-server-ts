#!/bin/bash

set -e

echo "Assembling resources structure..."

REPOS=./repositories

# Strip .git dirs
find "$REPOS" -name ".git" -type d -exec rm -rf {} + 2>/dev/null || true

# === EDOPro ===
mkdir -p ./resources/edopro
cp -r "$REPOS/edopro-card-scripts" ./resources/edopro/scripts
cp -r "$REPOS/edopro-card-databases" ./resources/edopro/databases
cp -r "$REPOS/edopro-banlists-ignis" ./resources/edopro/banlists-ignis
cp -r "$REPOS/edopro-banlists-evolution" ./resources/edopro/banlists-evolution

# === YGOPro Base (scripts + cards.cdb + lflist propagate to all variants) ===
mkdir -p ./resources/ygopro/base
cp -r "$REPOS/ygopro-scripts" ./resources/ygopro/base/script
cp "$REPOS/ygopro-lflist.conf" ./resources/ygopro/base/lflist.conf
cp "$REPOS/ygopro-cards.cdb" ./resources/ygopro/base/cards.cdb

# === YGOPro Prereleases (each repo as independent folder) ===
cp -r "$REPOS/ygopro-prereleases-cdb" ./resources/ygopro/prereleases-cdb
cp -r "$REPOS/ygopro-cards-art" ./resources/ygopro/cards-art

# === YGOPro OCG (only own lflist) ===
mkdir -p ./resources/ygopro/ocg
cp "$REPOS/edopro-banlists-ignis/OCG.lflist.conf" ./resources/ygopro/ocg/lflist.conf

# === YGOPro Alternatives (repo as-is + banlists) ===
cp -r "$REPOS/ygopro-format-alternatives" ./resources/ygopro/alternatives

declare -A MAP=(
    ["2010.03 Edison(Pre Errata)"]="edison"
    ["2014.04 HAT (Pre Errata)"]="hat"
    ["jtp-oficial"]="jtp"
    ["GOAT"]="goat"
    ["Rush"]="rush"
    ["Speed"]="speed"
    ["Tengu.Plant"]="tengu"
    ["World"]="world"
    ["MD.2025.03"]="md"
    ["Genesys"]="genesys"
)

for name in "${!MAP[@]}"; do
    src="$REPOS/edopro-banlists-evolution/${name}.lflist.conf"
    [ -f "$src" ] || src="$REPOS/edopro-banlists-ignis/${name}.lflist.conf"
    cp "$src" "./resources/ygopro/alternatives/${MAP[$name]}/lflist.conf"
done

echo "Resources assembled successfully."
