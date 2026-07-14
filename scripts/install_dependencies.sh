#!/bin/bash

set -e

echo "Installing system dependencies..."

apt-get update -y
apt-get install -y \
    wget git curl \
    g++ make cmake pkg-config \
    libboost-system-dev \
    libsqlite3-dev \
    libjsoncpp-dev \
    nlohmann-json3-dev \
    libcurl4-openssl-dev \
    liblua5.3-dev \
    libevent-dev

echo "Dependencies installed successfully."
