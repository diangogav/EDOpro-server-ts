<h1 align="center">Evolution Server 🎮</h1>

[![PR Pipeline](https://github.com/diangogav/EDOpro-server-ts/actions/workflows/pipeline.yaml/badge.svg)](https://github.com/diangogav/EDOpro-server-ts/actions/workflows/pipeline.yaml)

Welcome to **Evolution Server**, a scalable and modern backend server for Yu-Gi-Oh! matches, compatible with **EDOPro**, **Koishi**, and **YGO Mobile** clients. Unlike traditional implementations, Evolution focuses on **code extensibility** and **data collection**, enabling new gameplay features and statistics.

---

## ✨ Features

- 🏰 Room creation through the EDOPro lobby.
- 📱 Duel creation supported via Koishi and YGO Mobile.
- 🧪 Cross-client duels between different platforms *(experimental)*.
- 🔌 Automatic reconnection after disconnection or crash.
- 📊 Match data collection for future analytics.
- 🚀 Isolated core logic for each match.

---

## 📋 Requirements

- [Node.js](https://nodejs.org) (>= 24.11.0)
- [Node.js](https://nodejs.org) (>= 24.11.0)
- [CMake](https://cmake.org/download/) (>= 3.18)
- [Vcpkg](https://github.com/microsoft/vcpkg) (handled automatically by build script)
- System dependencies (Ubuntu/Debian): `wget`, `git`, `tar`, `curl`, `zip`, `unzip`, `pkg-config`, `g++`, `make` , `cmake`, `ninja-build`

---

## ⚙️ Configuration

Before running the server, you must configure the environment variables.

1. Copy the example configuration file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings (ports, database credentials, etc.).

---

## 🚀 Vcpkg Setup (Linux)

Vcpkg is used to manage C++ dependencies. The `build_core_integrator.sh` script handles the bootstrapping and installation of Vcpkg automatically.

If you want to manually set it up:
```bash
git clone https://github.com/microsoft/vcpkg.git
./vcpkg/bootstrap-vcpkg.sh
```

---

## 🛠️ Manual Installation (No Docker)

### 1️⃣ Clone the main project

```bash
git clone --recursive https://github.com/diangogav/EDOpro-server-ts
cd EDOpro-server-ts
```

### 📝 Install System Dependencies (Optional helper)

You can use the provided script to install system dependencies on Ubuntu/Debian:

```bash
sudo bash install_dependencies.sh
```

### 2️⃣ Clone external dependencies

```bash
bash clone_repositories.sh
```

This will create a `repositories/` folder with all required assets (scripts, databases, banlists, etc).

### 3️⃣ Organize assets into their expected locations

```bash
bash setup_resources.sh
```

This mimics the layout used in the Dockerfile (e.g. copying resources to `./mercury`, `./scripts/evolution`, etc.).

### 4️⃣ Build the CoreIntegrator (native C++)

```bash
bash build_core_integrator.sh
```

This compiles the duel core used by the backend using Vcpkg and CMake.

### 5️⃣ Install Node.js dependencies

```bash
npm install
```

### 6️⃣ Launch the server in development mode

```bash
npm run dev
```

Server should now be running and listening on the configured ports (default: `7911`, `7922`, `4000`).

---

## 🐳 Running with Docker (Alternative)

If you'd rather use Docker:

### Build the image

```bash
docker build -t evolution-server .
```

### Run the container

```bash
docker run -p 4000:4000 -p 7911:7911 -p 7922:7922 evolution-server
```

---

## 🙏 Acknowledgments

- Based on [Multirole](https://github.com/DyXel/Multirole) by @Dyxel
- Inspired by the amazing work of the Project Ignis, MyCard and Evolution communities
