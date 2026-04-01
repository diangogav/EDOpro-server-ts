<h1 align="center">Evolution Server</h1>

[![PR Pipeline](https://github.com/diangogav/EDOpro-server-ts/actions/workflows/pipeline.yaml/badge.svg)](https://github.com/diangogav/EDOpro-server-ts/actions/workflows/pipeline.yaml)

A scalable backend server for Yu-Gi-Oh! matches, compatible with **EDOPro**, **Koishi**, and **YGO Mobile** clients. Focused on **code extensibility** and **data collection**, enabling new gameplay features and statistics.

---

## Features

- Room creation through the EDOPro lobby.
- Duel creation supported via Koishi and YGO Mobile.
- Cross-client duels between different platforms *(experimental)*.
- Automatic reconnection after disconnection or crash.
- Match data collection for future analytics.
- Isolated core logic for each match.

---

## Requirements

- [Node.js](https://nodejs.org) (>= 24.11.0)
- [CMake](https://cmake.org/download/) (>= 3.18)
- System dependencies (Ubuntu/Debian): `wget`, `git`, `curl`, `g++`, `make`, `cmake`, `pkg-config`
- C++ libraries: `libboost-system-dev`, `libsqlite3-dev`, `libjsoncpp-dev`, `nlohmann-json3-dev`, `libcurl4-openssl-dev`

---

## Configuration

Before running the server, configure the environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your settings (ports, database credentials, etc.).

### Key environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `YGOPRO_FOLDERS` | Comma-separated list of YGOPro resource directories | *(empty)* |
| `HOST_PORT` | EDOPro server port | `7911` |
| `MERCURY_PORT` | Mercury (YGOPro) server port | `7711` |
| `HTTP_PORT` | HTTP API port | `7922` |
| `WEBSOCKET_PORT` | WebSocket port | `4000` |

---

## Manual Installation (No Docker)

### 1. Clone the project

```bash
git clone --recursive https://github.com/diangogav/EDOpro-server-ts
cd EDOpro-server-ts
```

### 2. Install system dependencies

```bash
sudo bash install_dependencies.sh
```

### 3. Clone external repositories

```bash
bash clone_repositories.sh
```

This creates a `repositories/` folder with all required assets (card scripts, databases, banlists).

### 4. Assemble resources

```bash
bash setup_resources.sh
```

This organizes assets into the `resources/` directory:

```
resources/
├── edopro/
│   ├── scripts/            # Card scripts (ProjectIgnis)
│   ├── databases/          # Card databases (ProjectIgnis)
│   ├── banlists-ignis/     # Banlists (ProjectIgnis)
│   └── banlists-evolution/ # Banlists (Evolution)
└── ygopro/
    ├── base/               # Base scripts + lflist + cards.cdb
    ├── prereleases-cdb/    # Pre-release card scripts
    ├── cards-art/          # Custom card art scripts + databases
    ├── ocg/                # OCG banlist
    └── alternatives/       # Format alternatives (Edison, GOAT, etc.)
```

### 5. Build the CoreIntegrator (C++)

```bash
bash build_core_integrator.sh
```

### 6. Install Node.js dependencies

```bash
npm install
```

### 7. Set YGOPRO_FOLDERS

Add to your `.env` file:

```
YGOPRO_FOLDERS=./resources/ygopro/base,./resources/ygopro/prereleases-cdb,./resources/ygopro/cards-art,./resources/ygopro/ocg,./resources/ygopro/alternatives
```

### 8. Launch the server

```bash
npm run dev
```

---

## Running with Docker

### Using Docker Compose (recommended)

```bash
docker compose -f docker-compose.prod.yaml up -d
```

### Using Docker directly

Build:

```bash
docker build -t evolution-server .
```

Run:

```bash
docker run -p 7711:7711 -p 7911:7911 -p 7922:7922 -p 4000:4000 --env-file .env evolution-server
```

---

## Acknowledgments

- Based on [Multirole](https://github.com/DyXel/Multirole) by @Dyxel
- Inspired by the amazing work of the Project Ignis, MyCard and Evolution communities
