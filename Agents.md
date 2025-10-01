# Evolution Server - AGENTS.md

This document provides AI coding agents with the context and instructions needed to effectively understand, navigate, and contribute to the Evolution Server project.

## Overview

This project is a comprehensive, multi-faceted server for the Yu-Gi-Oh! trading card game, designed to support various game clients and modes. It is built with TypeScript and Node.js, and it interfaces with a native C++ core for handling the intricate duel logic. The server is architected to be robust and extensible, featuring support for ranked and unranked matches, player authentication, detailed statistics tracking, and real-time updates.

There are two primary server implementations:
1.  **EdoPro Server**: The main, feature-rich implementation that manages game rooms using a state machine, handles complex deck validation, and communicates with a C++ duel engine.
2.  **Mercury Server**: A secondary implementation that appears to support a different client or game mode, also interfacing with a `ygopro` core engine.

## Tech Stack

- **Backend**: TypeScript, Node.js
- **Duel Engine**: C++ (`core/libocgcore.so`, `mercury/ygopro`), integrated via `child_process`.
- **Frameworks**:
    - **HTTP API**: Express.js
    - **Database ORM**: TypeORM
- **Databases**:
    - **PostgreSQL**: For persistent user data, match histories, player statistics, and rankings.
    - **SQLite**: For managing card data from `.cdb` files.
    - **Redis**: Optional, for caching and message brokering.
- **Networking**:
    - **TCP Sockets**: For direct communication with game clients.
    - **WebSockets**: For broadcasting real-time updates to web-based dashboards or spectator clients.
- **Dependency Injection**: `diod`

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Set up Environment:** Create a `.env` file from `.env.example` and configure database connections.
3.  **Database Migration:** Run TypeORM migrations to set up the PostgreSQL schema:
    ```bash
    npm run migration:run --prefix src/evolution-types/
    ```
4.  **Clone Game Assets:** Execute the setup script to download required card databases and scripts:
    ```bash
    ./clone_repositories.sh
    ```
5.  **Start the Server:**
    ```bash
    npm start
    ```

## Architecture

The project is built on modern software architecture principles, making it modular and maintainable.

- **Domain-Driven Design (DDD)**: The source code is organized into `application`, `domain`, and `infrastructure` layers. This separation of concerns is key to understanding the codebase.
- **Event-Driven Architecture**: An `EventBus` (`src/shared/event-bus/`) is used to decouple modules. For example, when a match ends, a `GameOverDomainEvent` is published, and a separate `BasicStatsCalculator` subscribes to this event to process stats.
- **State Pattern**: The `Room` class (`src/edopro/room/domain/Room.ts`) uses a state machine to manage its lifecycle. Different states (`WaitingState`, `DuelingState`, etc.) encapsulate the behavior of the room at different stages.

## Project Structure

```
/
├── core/                   # C++ duel engine source and compiled library.
├── mercury/                # Source code and assets for the Mercury server implementation.
├── src/
│   ├── edopro/             # Main EdoPro server implementation.
│   │   ├── room/           # Room management, including the state machine.
│   │   └── messages/       # Client-server message protocol handling.
│   ├── evolution-types/    # TypeORM entities, migrations, and data source for PostgreSQL.
│   ├── http-server/        # Express.js API server (controllers, routes).
│   ├── shared/             # Code shared across the application (DDD blocks, auth, etc.).
│   ├── socket-server/      # TCP servers for game client connections.
│   └── web-socket-server/  # WebSocket server for real-time UI updates.
└── ...
```

## Key Features

### Networking

The server exposes multiple network interfaces:
- **EdoPro TCP Server (Port 7911)**: Handles connections from the main game client.
- **Mercury TCP Server (Port 7711)**: Handles connections for the Mercury game mode.
- **HTTP API Server (Port 7922)**: Provides REST endpoints for admin tasks and room management.
- **WebSocket Server (Port 4000)**: Pushes real-time game state updates to spectator clients.

### Room & Duel Management

- **EdoPro & Mercury Rooms**: Central hubs for game sessions, managing players, state transitions (waiting, RPS, dueling, side-decking), and communication with the native duel engines.
- **Duel Engine Interaction**: The Node.js app spawns the C++ core as a child process, communicating via `stdin`/`stdout` with JSON-based messages.

### Database and Persistence

- **Card Data**: On startup, SQLite `.cdb` files are merged into a single database for unified access.
- **User & Match Data**: Handled by TypeORM with PostgreSQL, covering user profiles, match results, and player stats.

## How-To Guides

### How to Add a New API Endpoint

1.  Create a new controller class in `src/http-server/controllers/`.
2.  Register the new route and connect it to your controller in `src/http-server/routes/index.ts`.

### How to Modify the Database Schema

1.  Modify the target entity in `src/evolution-types/src/entities/`.
2.  From the `src/evolution-types/` directory, run `npm run migration:generate --name=YourMigrationName`.
3.  Review the generated migration file and apply it by restarting the server or running `npm run migration:run`.

## Style Guide

This project follows a consistent and modern TypeScript coding style, enforced by ESLint.

- **Language**: TypeScript.
- **Formatting**: Use tabs for indentation and always include semicolons.
- **Naming Conventions**:
    - **Classes, Enums, Interfaces**: `PascalCase` (e.g., `Room`, `DuelState`, `ISocket`).
    - **Variables, Functions**: `camelCase` (e.g., `handleMessage`, `playerInfo`).
    - **Private/Protected Members**: Prefix with an underscore (`_`) (e.g., `_replay`, `_logger`).
    - **Constants, Enum Members**: `UPPER_SNAKE_CASE` (e.g., `CHILD_PROCESS_RETRY_MAX`).
- **Asynchronous Code**: Prefer `async/await`. Use the `void` operator for top-level `async` calls where the promise result is intentionally not awaited.
- **OOP**: Use `readonly` for immutable properties. Use `static` methods for factories (e.g., `Room.create()`).
- **Error Handling**: Create and use custom error classes extending `Error`.
