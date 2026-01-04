#!/bin/bash

set -e

cd core

# Check if vcpkg exists, if not clone it
if [ ! -d "vcpkg" ]; then
    echo "Cloning vcpkg..."
    git clone https://github.com/microsoft/vcpkg.git
    ./vcpkg/bootstrap-vcpkg.sh
fi

# Configure and install dependencies
echo "Configuring project with CMake and Vcpkg..."
cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE=./vcpkg/scripts/buildsystems/vcpkg.cmake -DCMAKE_BUILD_TYPE=Release

# Build
echo "Building project..."
cmake --build build

echo "Build complete."
