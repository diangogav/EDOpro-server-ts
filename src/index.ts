import "reflect-metadata";
import "src/shared/error-handler/error-handler";

import { BanListLoader } from "src/edopro/ban-list/infrastructure/BanListLoader";
import BanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoProSQLiteTypeORM } from "src/shared/db/sqlite/infrastructure/EdoProSQLiteTypeORM";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

import { config } from "./config";
import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
import { Server } from "./http-server/Server";
import { MercuryBanListLoader } from "./mercury/ban-list/infrastructure/MercuryBanListLoader";
import { YGOProResourceLoader } from "./mercury/ygopro/ygopro-resource-loader";
import { HostServer } from "./socket-server/HostServer";
import { WSHostServer } from "./socket-server/WSHostServer";
import { MercuryServer } from "./socket-server/MercuryServer";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";

void start();

async function start(): Promise<void> {
  const logger = LoggerFactory.getLogger();
  const server = new Server(logger);
  const mercuryServer = new MercuryServer(logger);
  const hostServer = new HostServer(logger);
  const wsHostServer = new WSHostServer(logger);
  const database = new EdoProSQLiteTypeORM();
  const banListLoader = new BanListLoader();
  await banListLoader.loadDirectory("./banlists/evolution");
  // const mercuryBanListLoader = new MercuryBanListLoader();
  // await BanListMemoryRepository.backup();
  // await mercuryBanListLoader.loadDirectory("./mercury");

  // Pre-load card data at startup (singleton, shared across all rooms)
  const resourceLoader = YGOProResourceLoader.initShared(logger);
  logger.info("Loading card data...");
  await resourceLoader.getCardStorage();
  logger.info("Card data loaded successfully");

  await database.connect();
  await database.initialize();
  if (config.ranking.enabled) {
    logger.info("Postgres database enabled!");
    const postgresDatabase = new PostgresTypeORM();
    await postgresDatabase.connect();
  }
  await server.initialize();
  WebSocketSingleton.getInstance();
  hostServer.initialize();
  wsHostServer.initialize();
  mercuryServer.initialize();
}
