#!/bin/bash

set -e

# Update and install dependencies
apt-get update -y && \
apt-get install -y python3 python3-pip wget tar git liblua5.3-dev && \
pip install conan

# Detect conan profile
conan profile detect
