FROM public.ecr.aws/docker/library/node:24.11.0-bullseye

# Install development tools
# cmake, ninja-build, g++ for C++ core compilation
# git, openssh-client for git operations
# gdb for debugging
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    cmake \
    ninja-build \
    g++ \
    git \
    openssh-client \
    gdb \
    curl \
    wget \
    ca-certificates \
    zip \
    unzip \
    tar \
    pkg-config \
    # Optional: zsh/oh-my-zsh for better shell experience?
    && rm -rf /var/lib/apt/lists/*

# Install vcpkg dependencies (linux-libc-dev, etc if needed)
# Reusing the list from the main dockerfile to be safe
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    autoconf \
    m4 \
    automake \
    libtool \
    linux-libc-dev \
    && rm -rf /var/lib/apt/lists/*

USER node
