#!/bin/bash

set -e

# Update and install dependencies
apt-get update -y && \
apt-get install -y wget tar git liblua5.3-dev cmake ninja-build
