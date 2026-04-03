<h1 align="center">🎮 Evolution Server</h1>
<p align="center">
  <strong>A Yu-Gi-Oh! game server built with TypeScript</strong><br>
  <em>Host duels for EDOPro, Koishi, and YGO Mobile — all from one server.</em>
</p>

[![PR Pipeline](https://github.com/diangogav/EDOpro-server-ts/actions/workflows/pipeline.yaml/badge.svg)](https://github.com/diangogav/EDOpro-server-ts/actions/workflows/pipeline.yaml)

Evolution Server runs two independent game engines side by side, so you can support both ecosystems from a single server — or pick just one.

| Engine | Clients | Protocol | Port |
|--------|---------|----------|------|
| 🖥️ **EDOPro** | EDOPro desktop client | EDOPro protocol | `7911` |
| 📱 **YGOPro** | Koishi, YGO Mobile, YGOPro | YGOPro-compatible (srvpro2) | `7711` |

---

## ✨ What can it do?

- 🏰 **Room creation** through the EDOPro lobby or YGOPro-compatible clients
- 🔀 **Cross-client duels** between different platforms *(experimental)*
- 🔌 **Automatic reconnection** after disconnection or crash
- 📊 **Match data collection** for rankings and analytics
- 🧪 **Isolated duel cores** — each match runs in its own process

---

## 🚀 Quick Start (Docker)

The fastest way to get running. Three commands and you're dueling:

```bash
git clone https://github.com/diangogav/EDOpro-server-ts
cd EDOpro-server-ts
docker compose -f docker-compose.prod.yaml up -d
```

That's it! 🎉 Both engines start automatically with PostgreSQL and Valkey included.

> 💡 Connect with EDOPro on port `7911` or with Koishi/YGO Mobile on port `7711`.

---

## 🛠️ Manual Installation

For when you want full control, or Docker isn't an option.

### 📋 Prerequisites

- [Node.js](https://nodejs.org) >= 24
- [CMake](https://cmake.org/download/) >= 3.18
- A C++ compiler (g++ or clang++)

On Ubuntu/Debian, the provided script installs everything you need:

```bash
sudo bash install_dependencies.sh
```

### 📦 Step by step

```bash
# 1️⃣ Clone the project
git clone https://github.com/diangogav/EDOpro-server-ts
cd EDOpro-server-ts

# 2️⃣ Clone card scripts, databases, and banlists
bash clone_repositories.sh

# 3️⃣ Organize everything into resources/
bash setup_resources.sh

# 4️⃣ Build the C++ duel core (used by the EDOPro engine)
bash build_core_integrator.sh

# 5️⃣ Install Node.js dependencies
npm install

# 6️⃣ Configure environment
cp .env.example .env
```

Now choose which engine(s) you want to run 👇

---

### 🖥️ Running the EDOPro engine only

Players connect using the EDOPro desktop client.

**What you need:**
- ✅ The CoreIntegrator binary (built in step 4)
- ✅ Card databases and scripts from ProjectIgnis
- ✅ Banlists from ProjectIgnis and/or Evolution

**Minimum `.env` configuration:**

```env
HOST_PORT=7911
HTTP_PORT=7922
WEBSOCKET_PORT=4000
```

**Resource structure used:**

```
📂 resources/edopro/
├── 📜 scripts/            # ProjectIgnis/CardScripts
├── 🗄️ databases/          # ProjectIgnis/BabelCDB
├── 📋 banlists-ignis/     # ProjectIgnis/LFLists
└── 📋 banlists-evolution/ # Evolution community banlists
```

```bash
npm run dev
```

> 🎯 Connect with EDOPro to `your-server-ip:7911`

---

### 📱 Running the YGOPro engine only

The YGOPro engine uses srvpro2-compatible protocol. Players connect using Koishi, YGO Mobile, or any YGOPro-compatible client.

**What you need:**
- ✅ Card scripts and databases from ygopro-scripts
- ✅ Ban lists and alternative format resources
- ✅ The `YGOPRO_FOLDERS` environment variable pointing to your resource directories
- ✅ (Optional) The `YGOPRO_EXTRA_DB_FOLDERS` environment variable for pre-release and art card databases

**Minimum `.env` configuration:**

```env
YGOPRO_PORT=7711
HTTP_PORT=7922
WEBSOCKET_PORT=4000
YGOPRO_FOLDERS=./resources/ygopro/base
```

**Resource structure used:**

```
📂 resources/ygopro/
├── 📜 base/               # Core scripts + lflist + cards.cdb (loaded by all modes)
├── 🌏 ocg/                # OCG-specific banlist
├── 🃏 alternatives/       # Format variants (Edison, GOAT, HAT, etc.)
├── 🆕 prereleases-cdb/    # Pre-release card databases (extra DB)
└── 🎨 cards-art/          # Custom card art databases (extra DB)
```

**Standard card pool** (`YGOPRO_FOLDERS`) is loaded for all rooms. **Extra databases** (`YGOPRO_EXTRA_DB_FOLDERS`) are only available in rooms that use PRE or ART formats — standard rooms cannot use those cards.

To enable all formats and pre-releases, set:

```env
YGOPRO_FOLDERS=./resources/ygopro/base,./resources/ygopro/ocg,./resources/ygopro/alternatives
YGOPRO_EXTRA_DB_FOLDERS=./resources/ygopro/prereleases-cdb,./resources/ygopro/cards-art
```

```bash
npm run dev
```

> 🎯 Connect with Koishi or YGO Mobile to `your-server-ip:7711`

---

### 🔥 Running both engines

Just set both ports in your `.env`:

```env
HOST_PORT=7911
YGOPRO_PORT=7711
HTTP_PORT=7922
WEBSOCKET_PORT=4000
YGOPRO_FOLDERS=./resources/ygopro/base,./resources/ygopro/ocg,./resources/ygopro/alternatives
YGOPRO_EXTRA_DB_FOLDERS=./resources/ygopro/prereleases-cdb,./resources/ygopro/cards-art
```

```bash
npm run dev
```

Both engines run in the same process, sharing the HTTP API and WebSocket server. 💪

---

## 🗂️ Card Database Architecture

The YGOPro engine maintains **two separate card pools** in memory:

| Pool | Loaded from | Available to |
|------|-------------|--------------|
| **Standard** | `YGOPRO_FOLDERS` | All rooms |
| **Extended** | `YGOPRO_FOLDERS` + `YGOPRO_EXTRA_DB_FOLDERS` | PRE/ART rooms only |

When a player creates a room with a format like `PRE`, `TCGPRE`, `OCGPRE`, `TCGART`, or `OCGART`, the server uses the **extended** card pool for both deck validation and the duel engine. Standard rooms (`M`, `TCG`, `OT`, `GOAT`, etc.) use only the **standard** pool — any card not in that pool is rejected as unknown.

Both pools are loaded at startup and refreshed every 10 minutes if the underlying `.cdb` files change.

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST_PORT` | EDOPro server port | `7911` |
| `YGOPRO_PORT` | YGOPro server port | `7711` |
| `HTTP_PORT` | HTTP API port | `7922` |
| `WEBSOCKET_PORT` | WebSocket port | `4000` |
| `YGOPRO_FOLDERS` | Comma-separated resource directories (standard card pool) | *(empty)* |
| `YGOPRO_EXTRA_DB_FOLDERS` | Comma-separated extra DB directories (pre-releases, art cards) — only loaded for PRE/ART room formats | *(empty)* |
| `RANK_ENABLED` | Enable ranking system (requires PostgreSQL) | `false` |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB` | PostgreSQL database name | `evolution` |
| `POSTGRES_USER` | PostgreSQL username | `evolution` |
| `POSTGRES_PASSWORD` | PostgreSQL password | *(required if ranking enabled)* |
| `USE_REDIS` | Enable Redis/Valkey for session management | `false` |
| `REDIS_URI` | Redis/Valkey connection URI | *(required if redis enabled)* |

---

## 🏗️ Project Architecture

```
src/
├── 🖥️ edopro/             # EDOPro engine (EDOPro protocol)
├── 📱 ygopro/             # YGOPro engine (srvpro2-compatible)
├── 🤝 shared/             # Shared domain logic (rooms, decks, cards, clients)
├── 🔌 socket-server/      # TCP socket servers for both engines
├── 🌐 http-server/        # REST API
└── 📡 web-socket-server/  # WebSocket server for real-time updates
```

Both engines share the same room management, player handling, and match lifecycle — but use different protocols, card databases, and deck validation rules.

---

## 🙏 Acknowledgments

- [Multirole](https://github.com/DyXel/Multirole) by @Dyxel — the reference for the EDOPro engine
- [srvpro2](https://github.com/purerosefallen/srvpro) — the reference for the YGOPro engine
- The [Project Ignis](https://github.com/ProjectIgnis), [MyCard](https://mycard.moe/), and [Evolution](https://github.com/evolutionygo) communities

---

<p align="center">
  Made with ❤️ by the Evolution community
</p>
