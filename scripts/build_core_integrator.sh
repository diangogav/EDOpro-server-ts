#!/bin/bash

set -e

cd core

echo "Configuring CoreIntegrator with CMake..."
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release

echo "Building CoreIntegrator..."
cmake --build build

echo "Build complete."
