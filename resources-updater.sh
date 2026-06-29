#!/bin/bash

# Runtime resource updater (sidecar). Periodically re-clones the upstream card
# databases / banlists and publishes a fresh release via setup_resources.sh,
# which atomically repoints resources/current. The server reads resources/current
# read-only and picks up changes through its in-memory reload — no restart, no
# dropped connections.
#
# A failed refresh leaves the previous release live (clone/assemble run with
# `set -e`; on non-zero we keep going and retry next interval).

set -u

INTERVAL="${RESOURCES_REFRESH_SECONDS:-600}"

while true; do
	echo "[updater] refreshing resources..."
	if bash clone_repositories.sh && bash setup_resources.sh; then
		echo "[updater] refresh ok"
	else
		echo "[updater] refresh FAILED — keeping previous resources/current" >&2
	fi
	sleep "$INTERVAL"
done
