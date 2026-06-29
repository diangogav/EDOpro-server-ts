#!/bin/bash

# Container entrypoint: run the resource updater loop in the background so card
# databases / banlists refresh live (picked up by the in-memory reload), and run
# the server as the main foreground process. The image ships a baked resource
# seed, so the server boots immediately while the first refresh runs in the
# background. dumb-init (PID 1) forwards signals to the server and reaps the loop.

set -u

bash resources-updater.sh &

exec node ./src/index.js
