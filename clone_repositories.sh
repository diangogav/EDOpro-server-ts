#!/bin/bash

set -e

echo "Syncing repositories..."

mkdir -p repositories
cd repositories

# Clone on first run; on later runs fast-forward the existing shallow clone so a
# refresh pulls only deltas instead of re-downloading everything. Any failure
# falls back to a fresh clone, so the worst case equals the original behavior.
sync_repo() {
	local dir="$1" url="$2" branch="$3"
	if [ -d "$dir/.git" ]; then
		if [ -n "$branch" ]; then
			git -C "$dir" fetch --depth 1 origin "$branch" >/dev/null 2>&1 &&
				git -C "$dir" reset --hard FETCH_HEAD >/dev/null 2>&1 && return 0
		else
			git -C "$dir" fetch --depth 1 >/dev/null 2>&1 &&
				git -C "$dir" reset --hard "@{u}" >/dev/null 2>&1 && return 0
		fi
		echo "  update failed for $dir — re-cloning"
		rm -rf "$dir"
	fi
	if [ -n "$branch" ]; then
		git clone --depth 1 --branch "$branch" "$url" "$dir"
	else
		git clone --depth 1 "$url" "$dir"
	fi
}

sync_repo edopro-card-scripts        https://github.com/ProjectIgnis/CardScripts.git           master
sync_repo edopro-card-databases      https://github.com/ProjectIgnis/BabelCDB.git              master
sync_repo edopro-banlists-ignis      https://github.com/ProjectIgnis/LFLists                   master
sync_repo edopro-banlists-evolution  https://github.com/termitaklk/lflist                      main
sync_repo evolution-assets           https://github.com/diangogav/evolution-assets            main
# ygopro-scripts uses its repo default branch. moenext mirror kept for reference:
# https://code.moenext.com/nanahira/ygopro-scripts
sync_repo ygopro-scripts             https://github.com/Fluorohydride/ygopro-scripts           ""
sync_repo ygopro-prereleases-cdb     https://github.com/evolutionygo/pre-release-database-cdb  master
sync_repo ygopro-cards-art           https://github.com/evolutionygo/cards-art-server          main
sync_repo ygopro-format-alternatives https://github.com/evolutionygo/server-formats-cdb.git    main

wget -qO ygopro-lflist.conf https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf
wget -qO ygopro-cards.cdb https://cdntx.moecube.com/ygopro-database/zh-CN/cards.cdb

echo "Repositories synced."
