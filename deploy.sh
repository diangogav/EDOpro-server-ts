#!/bin/bash

ORG_PATH="/orgs/evolutionygo"
REPO_NAME="EDOpro-server-ts"
DOCKER_IMAGE_NAME="evolutionygo/server"
DOCKER_CONTAINER_NAME="evolutionygo-server"
MAIL_NOTIFICATION_SCRIPT="send-mail-on-update-server-error.sh"
#LOKI_URL="http://localhost:3100/loki/api/v1/push"

# Go to the repository
cd $ORG_PATH/$REPO_NAME

# Fetch latest changes
# git fetch

# LOCAL=$(git rev-parse HEAD)
# REMOTE=$(git rev-parse @{u})

# if [ "$LOCAL" = "$REMOTE" ]; then
#     echo "System is up to date. No new commits found."
#     exit 0
# fi

# echo "New updates found. Proceeding with deployment..."

# Pull the latest changes
git pull

# Build the Base Image first (fast with cache)
# We pass CACHEBUST to invalidate the git clone steps daily (or every run),
# while keeping the C++ compilation cached (since it is physically before clones in Dockerfile).
echo "Starting Base Image build..."
if ! docker build -f Dockerfile.base --build-arg CACHEBUST=$(date +%s) -t evolution-core:latest . 2>&1 | tee ../docker-build-base.log; then
    echo "Base Image build failed! Aborting deployment."
    
    # Send error notification
    echo "Sending error notification..."
    if [ -f "$MAIL_NOTIFICATION_SCRIPT" ]; then
        bash $MAIL_NOTIFICATION_SCRIPT
    fi

    exit 1
fi

# Build the App Image
# We use --no-cache here if you want to ensure a clean build, 
# although Docker handles cache invalidation well for package.json changes.
echo "Starting Application build..."
if ! docker build -t $DOCKER_IMAGE_NAME --no-cache --progress=plain . 2>&1 | tee ../docker-build-prod.log; then
    echo "Docker build failed! Aborting deployment. The previous version is still running."

    # Send error notification
    echo "Sending error notification..."
    if [ -f "$MAIL_NOTIFICATION_SCRIPT" ]; then
        bash $MAIL_NOTIFICATION_SCRIPT
    else
        echo "Warning: Notification script not found at $MAIL_NOTIFICATION_SCRIPT"
    fi

    exit 1
fi

echo "Build successful. Updating container..."

# Delete running container
docker stop $DOCKER_CONTAINER_NAME
docker rm -f $DOCKER_CONTAINER_NAME

# Remove old dangling images (previous version)
docker image prune -f --filter "dangling=true"

# Return to project root
cd $ORG_PATH


# Run the container
docker run -d --env-file ./.env \
--name $DOCKER_CONTAINER_NAME \
--network host \
-p 4000:4000 \
-p 7711:7711 \
-p 7911:7911 \
-p 7922:7922 \
$DOCKER_IMAGE_NAME:latest
