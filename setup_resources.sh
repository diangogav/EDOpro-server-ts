#!/bin/bash

set -e

# Assembles a fresh resource set into resources/releases/<id> and atomically
# repoints resources/current at it. Safe to run while the server is reading
# resources/current: the swap is a single atomic rename, and in-flight reads
# keep their old release via open file handles (POSIX). Old releases are GC'd.
#
# Single source of truth for the resource layout — used by local dev, the
# Docker build (seed), and the runtime updater sidecar.

REPOS=./repositories
RELEASES=./resources/releases
ID="$(date +%Y%m%d-%H%M%S-%N)"
STAGING="$RELEASES/$ID"
KEEP="${RESOURCES_KEEP_RELEASES:-2}"

echo "Assembling resources into $STAGING ..."

mkdir -p "$STAGING"

# === EDOPro ===
mkdir -p "$STAGING/edopro"
cp -r "$REPOS/edopro-card-scripts" "$STAGING/edopro/scripts"
cp -r "$REPOS/edopro-card-databases" "$STAGING/edopro/databases"
cp -r "$REPOS/edopro-banlists-ignis" "$STAGING/edopro/banlists-ignis"
cp -r "$REPOS/edopro-banlists-evolution" "$STAGING/edopro/banlists-evolution"

# === YGOPro Base (scripts + cards.cdb + lflist propagate to all variants) ===
mkdir -p "$STAGING/ygopro/base"
cp -r "$REPOS/ygopro-scripts" "$STAGING/ygopro/base/script"
cp "$REPOS/ygopro-lflist.conf" "$STAGING/ygopro/base/lflist.conf"
cp "$REPOS/ygopro-cards.cdb" "$STAGING/ygopro/base/cards.cdb"

# === YGOPro Prereleases / art (each repo as its own independent folder) ===
cp -r "$REPOS/ygopro-prereleases-cdb" "$STAGING/ygopro/prereleases-cdb"
cp -r "$REPOS/ygopro-cards-art" "$STAGING/ygopro/cards-art"

# === YGOPro OCG (only own lflist) ===
mkdir -p "$STAGING/ygopro/ocg"
cp "$REPOS/edopro-banlists-ignis/OCG.lflist.conf" "$STAGING/ygopro/ocg/lflist.conf"

# === YGOPro Alternatives (repo as-is + banlists) ===
cp -r "$REPOS/ygopro-format-alternatives" "$STAGING/ygopro/alternatives"

declare -A MAP=(
    ["2010.03 Edison(Pre Errata)"]="edison"
    ["2014.04 HAT (Pre Errata)"]="hat"
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
    cp "$src" "$STAGING/ygopro/alternatives/${MAP[$name]}/lflist.conf"
done

# JTP comes from evolution-assets: it lists BASE card codes, so alt-art
# variants stay legal via their alias (the termitaklk list shipped variant
# codes, which rejected the base cards in whitelist validation).
cp "$REPOS/evolution-assets/lflist/jtp.lflist.conf" "$STAGING/ygopro/alternatives/jtp/lflist.conf"

# Strip .git from the assembled release (keep it in repositories/ so refreshes can pull deltas)
find "$STAGING" -name ".git" -type d -exec rm -rf {} + 2>/dev/null || true

# === Atomic publish: repoint resources/current -> releases/<id> ===
# Build the symlink under a temp name, then rename over the live one.
# rename(2) is atomic on the same filesystem, so readers never observe a
# missing or half-updated current.
# If a previous build left `current` as a real directory (e.g. a Docker COPY that
# dereferenced the symlink), drop it so the atomic symlink swap can land.
if [ -d "./resources/current" ] && [ ! -L "./resources/current" ]; then
    rm -rf "./resources/current"
fi
ln -sfn "releases/$ID" "./resources/.current.tmp"
mv -T "./resources/.current.tmp" "./resources/current"
echo "Published resources/current -> releases/$ID"

# === GC: keep only the newest $KEEP releases ===
# The just-published release is the newest, so current is always retained.
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -rf

echo "Resources assembled successfully."
