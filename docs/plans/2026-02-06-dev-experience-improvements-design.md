# Design: Development Experience Improvements

**Date**: 2026-02-06
**Topic**: Docker Build Speed & Dev Environment
**Status**: Approved

## 1. Problem
- **Slow Production Builds**: The current `Dockerfile` clones ~10 repositories and compiles C++ code from scratch on every build. This makes deployment slow and CI/CD expensive.
- **Inconsistent Dev Environment**: Developers strictly rely on their local OS for dependencies (C++, CMake, Ninja), leading to "works on my machine" issues.

## 2. Solution Overview

We will split the build process to separate "heavy, infrequent" changes from "light, frequent" changes, and introduce a DevContainer for a standardized local dev environment.

### 2.1 Base Image Strategy (Production)
Differentiate between the **Environment** and the **Application**.

- **`Dockerfile.base`**:
    - Based on `node:24-bullseye-slim`.
    - Installs system build tools (CMake, Ninja, Git).
    - Clones all submodules and repositories.
    - **Compiles** `CoreIntegrator` using `vcpkg`.
    - Pre-processes "static" assets (moving banlists, scripts).
    - **Output**: An image containing compiled binaries (`libocgcore.so`, `CoreIntegrator`) and all external resources.
    - **Frequency**: Built only when core dependencies change.

- **`Dockerfile` (Application)**:
    - Based on `node:24-bullseye-slim` (runtime) / `node:24` (builder).
    - **FROM** `Dockerfile.base` (as a build stage or by copying files).
    - Installs strictly Node.js dependencies (`npm ci`).
    - Builds the TypeScript server.
    - Copies compiled binaries and assets from the Base layer.
    - **Frequency**: Built on every commit/deploy.

### 2.2 DevContainer Strategy (Development)
Standardizes the development tooling using VS Code DevContainers.

- **`.devcontainer/Dockerfile`**:
    - Extends `node:24`.
    - Adds C++ tooling (`cmake`, `ninja-build`, `gdb`, `vcpkg` deps).
- **`.devcontainer/devcontainer.json`**:
    - Configures VS Code extensions (ESLint, Prettier, C++ Tools).
    - Mounts the local source code.
    - Connects to the `postgres` service network.

## 3. Implementation Plan

### Phase 1: Production Optimization
1.  Extract cloning and compilation logic into `Dockerfile.base`.
2.  Refactor `Dockerfile` to use artifacts from the base image.
3.  Verify locally by building both images.

### Phase 2: Developer Experience
1.  Create `.devcontainer` folder.
2.  Define `Dockerfile` and `devcontainer.json`.
3.  Verify `npm run dev` and `build_core_integrator.sh` inside the container.

### Phase 3: Documentation
1.  Update `README.md` with new build instructions.
