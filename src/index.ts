import "reflect-metadata";
import "src/shared/error-handler/error-handler";

import { EdoProBanListLoader } from "src/edopro/ban-list/infrastructure/BanListLoader";
import BanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoProSQLiteTypeORM } from "src/shared/db/sqlite/infrastructure/EdoProSQLiteTypeORM";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

import { config } from "./config";
import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
import { Server } from "./http-server/Server";
import { YGOProBanListLoader } from "./ygopro/ban-list/infrastructure/YGOProBanListLoader";
import { YGOProResourceLoader } from "./ygopro/ygopro/YGOProResourceLoader";
import { HostServer } from "./socket-server/HostServer";
import { WSHostServer } from "./socket-server/WSHostServer";
import { YGOProServer } from "./socket-server/YGOProServer";
import { WSYGOProServer } from "./socket-server/WSYGOProServer";
import { RedisTicketRepository } from "./shared/ticket/infrastructure/redis/RedisTicketRepository";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";
import { WindbotModule } from "./ygopro/windbot/application/WindbotModule";
import { FileBotlistRepository } from "./ygopro/windbot/infrastructure/FileBotlistRepository";
import { HttpWindBotProvider } from "./ygopro/windbot/infrastructure/HttpWindBotProvider";
import { WindbotTokenStore } from "./ygopro/windbot/domain/WindbotTokenStore";
import { JoinStrategyRegistry } from "./ygopro/room/application/join-strategies/JoinStrategyRegistry";
import { AIJoinTokenStrategy } from "./ygopro/room/application/join-strategies/AIJoinTokenStrategy";
import { WindBotJoinStrategy } from "./ygopro/room/application/join-strategies/WindBotJoinStrategy";
import { DefaultJoinStrategy } from "./ygopro/room/application/join-strategies/DefaultJoinStrategy";

// YGOPro protocol version (same as DuelRecord.ts — must stay in sync)
const YGOPRO_VERSION = 0x1362;

void start();

async function start(): Promise<void> {
  const logger = LoggerFactory.getLogger();

  const server = new Server(logger);
  const ygoproServer = new YGOProServer(logger);
  const wsYgoproServer = new WSYGOProServer(logger, new RedisTicketRepository());

  const hostServer = new HostServer(logger);
  const wsHostServer = new WSHostServer(logger);

  const database = new EdoProSQLiteTypeORM();
  const banListLoader = new EdoProBanListLoader();
  await banListLoader.loadDirectory("resources/edopro/banlists-evolution");
  await banListLoader.loadDirectory("resources/edopro/banlists-ignis");

  await YGOProResourceLoader.start();
  await YGOProResourceLoader.get().logLFLists()

  const ygoProBanListLoader = new YGOProBanListLoader();
  await ygoProBanListLoader.load();

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

  // Windbot bootstrap — ONLY when ENABLE_WINDBOT=true.
  // When disabled, this block is never entered: existing join behaviour is byte-for-byte unchanged.
  // config.windbot is parsed (and validated for fail-fast) at module load time in src/config/index.ts.
  if (config.windbot.enabled) {
    logger.info("Windbot enabled — initializing WindbotModule");
    const repo = new FileBotlistRepository(config.windbot.botlistPath);
    const tokenStore = new WindbotTokenStore();
    const provider = new HttpWindBotProvider({
      endpoint: config.windbot.endpoint,
      myIp: config.windbot.myIp,
      serverPort: config.servers.mercury.port,
      version: YGOPRO_VERSION,
    });
    WindbotModule.init({ enabled: true, repo, tokenStore, provider });

    // Wire the strategy chain in priority order:
    //   1. AIJoinTokenStrategy — AIJOIN# prefix (reverse-connecting bot)
    //   2. WindBotJoinStrategy — blank / AI / AI#name (human requesting bot)
    //   3. DefaultJoinStrategy — anything else (unchanged fallback)
    const module = WindbotModule.getInstance();
    JoinStrategyRegistry.setStrategies([
      new AIJoinTokenStrategy(module),
      new WindBotJoinStrategy(module),
      new DefaultJoinStrategy(),
    ]);
    logger.info("WindbotModule and JoinStrategyRegistry initialised");
  }

  ygoproServer.initialize();
  wsYgoproServer.initialize();
}
