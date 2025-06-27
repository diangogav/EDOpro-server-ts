#!/bin/bash

set -e

echo "📁 Preparando estructura local..."

# === Evolution Resources ===
mkdir -p ./scripts/evolution
cp -r ./repositories/scripts/* ./scripts/evolution/

mkdir -p ./databases/evolution
cp -r ./repositories/databases/* ./databases/evolution/

mkdir -p ./databases/mercury-pre-releases
cp -r ./repositories/mercury-pre-releases-cdbs/* ./databases/mercury-pre-releases/
cp ./repositories/mercury-cards.cdb ./databases/mercury-pre-releases/cards.cdb

mkdir -p ./banlists/evolution
cp -r ./repositories/banlists/* ./banlists/evolution/

# === Mercury Base ===
mkdir -p ./mercury/script
cp -r ./repositories/mercury-scripts/* ./mercury/script/

cp ./repositories/mercury-lflist.conf ./mercury/lflist.conf
cp ./repositories/mercury-cards.cdb ./mercury/cards.cdb

mkdir -p ./mercury/alternatives/md
cp ./repositories/mercury-cards.cdb ./mercury/alternatives/md/cards.cdb

# === Mercury Pre-releases (TCG & OCG) ===
mkdir -p ./mercury/pre-releases/tcg/script
mkdir -p ./mercury/pre-releases/ocg/script

cp -r ./repositories/mercury-scripts/* ./mercury/pre-releases/tcg/script/
cp ./repositories/mercury-lflist.conf ./mercury/pre-releases/tcg/lflist.conf
cp -r ./repositories/mercury-prerelases/script/* ./mercury/pre-releases/tcg/script/
cp -r ./repositories/mercury-arts/script/* ./mercury/pre-releases/tcg/script/

cp -r ./repositories/mercury-scripts/* ./mercury/pre-releases/ocg/script/
cp ./databases/mercury-pre-releases/cards.cdb ./mercury/pre-releases/ocg/cards.cdb
cp ./repositories/banlists/OCG.lflist.conf ./mercury/pre-releases/ocg/lflist.conf
cp -r ./repositories/mercury-prerelases/script/* ./mercury/pre-releases/ocg/script/
cp -r ./repositories/mercury-arts/script/* ./mercury/pre-releases/ocg/script/

# === Mercury OCG ===
mkdir -p ./mercury/ocg/script
cp -r ./repositories/mercury-scripts/* ./mercury/ocg/script/
cp ./repositories/banlists/OCG.lflist.conf ./mercury/ocg/lflist.conf
cp ./repositories/mercury-cards.cdb ./mercury/ocg/cards.cdb

mkdir -p ./mercury/ocg/ygopro
cp -r ./repositories/ygopro/* ./mercury/ocg/ygopro/ 2>/dev/null || echo "🔔 ygopro no encontrado (puede omitirse)"

# === Mercury Alternatives ===
mkdir -p ./mercury/alternatives
cp -r ./repositories/alternatives/* ./mercury/alternatives/

echo "✅ Recursos organizados exitosamente."
