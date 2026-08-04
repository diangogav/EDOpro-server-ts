#!/bin/bash

# Container entrypoint: run the resource updater loop in the background so card
# databases / banlists refresh live (picked up by the in-memory reload), and run
# the server as the main foreground process. The image ships a baked resource
# seed, so the server boots immediately while the first refresh runs in the
# background. dumb-init (PID 1) forwards signals to the server and reaps the loop.

set -u

# Configure git to authenticate private manifest sources (read-only token from
# GH_PRIVATE_TOKEN in the container env / --env-file). No-op when unset. Must run
# before the updater loop, which re-clones sources.
bash scripts/setup-git-credentials.sh

bash scripts/resources-updater.sh &

exec node ./src/index.js
