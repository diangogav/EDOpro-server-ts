<h1 align="center">Evolution Server 🎮</h1>


![Logo](https://raw.githubusercontent.com/diangogav/EDOpro-server-ts/main/assets/1.svg)

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

- [Node.js](https://nodejs.org) (>= 18.16.0)
- [Conan](https://conan.io/) (>= 2.0.6)
- [Python 3](https://www.python.org/downloads/) (for Conan)
- [CMake + Make + g++](https://cmake.org/download/) (for building native CoreIntegrator)
- `wget`, `git`, `tar`, `liblua5.3-dev`, `libsqlite3-dev`, `libevent-dev`, etc.

---

## 🚀 Conan Installation (Linux)

```bash
sudo apt update
sudo apt install python3 python3-pip -y
pip install conan
conan profile detect
```

---

## 🛠️ Manual Installation (No Docker)

### 1️⃣ Clone the main project

```bash
git clone --recursive https://github.com/diangogav/EDOpro-server-ts
cd EDOpro-server-ts
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

This compiles the duel core used by the backend using Conan and Premake.

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
