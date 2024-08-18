#!/bin/bash

set -e

cd core

# Download and install premake
wget https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz
tar -zxvf premake-5.0.0-beta2-linux.tar.gz
rm premake-5.0.0-beta2-linux.tar.gz

# Install dependencies and build
conan install . --build missing --output-folder=./dependencies --options=libcurl/8.6.0:shared=True
./premake5 gmake
make config=release
