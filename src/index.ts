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
import { HandshakeTicketAuthenticator } from "./socket-server/HandshakeTicketAuthenticator";
import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { RedisTicketRepository } from "./shared/ticket/infrastructure/redis/RedisTicketRepository";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";
import { bootstrapWindbot } from "./ygopro/windbot/infrastructure/bootstrapWindbot";
import { JoinStrategyRegistry } from "./ygopro/room/application/join-strategies/JoinStrategyRegistry";
import { composeJoinStrategies } from "./ygopro/room/application/join-strategies/composeJoinStrategies";

void start();

async function start(): Promise<void> {
	const logger = LoggerFactory.getLogger();

	logger.info("🚀 Evolution server starting…");

	const server = new Server(logger);
	const ygoproServer = new YGOProServer(logger);
	const wsYgoproServer = new WSYGOProServer(
		logger,
		new HandshakeTicketAuthenticator(new RedisTicketRepository()),
	);

	const hostServer = new HostServer(logger);
	const wsHostServer = new WSHostServer(logger);

	const database = new EdoProSQLiteTypeORM();
	const banListLoader = new EdoProBanListLoader();
	await banListLoader.loadDirectory("resources/edopro/banlists-evolution");
	await banListLoader.loadDirectory("resources/edopro/banlists-ignis");

	await YGOProResourceLoader.start();
	await YGOProResourceLoader.get().logLFLists();

	const ygoProBanListLoader = new YGOProBanListLoader();
	await ygoProBanListLoader.load();

	logger.info("🎴 YGOPro resources & ban lists loaded");

	await database.connect();
	await database.initialize();
	logger.info("🗄️  SQLite connected");

	if (config.ranking.enabled) {
		const postgresDatabase = new PostgresTypeORM();
		await postgresDatabase.connect();
		logger.info("🗄️  Postgres connected · ranking ON");
	}

	const redisDatabase = new Redis();
	await redisDatabase.connect();

	await server.initialize();
	WebSocketSingleton.getInstance();
	hostServer.initialize();
	wsHostServer.initialize();

	// config.windbot is validated for fail-fast at module load (src/config/index.ts).
	const windbotModule = config.windbot.enabled
		? bootstrapWindbot(config.windbot, config.servers.mercury.port)
		: undefined;
	JoinStrategyRegistry.setStrategies(composeJoinStrategies(windbotModule));
	if (windbotModule) {
		logger.info("🤖 Windbot enabled");
	}

	ygoproServer.initialize();
	wsYgoproServer.initialize();

	logger.info(`🔌 HTTP      → :${config.servers.http.port}`);
	logger.info(
		`🔌 Mercury   → TCP :${config.servers.mercury.port} · WS :${config.servers.mercury.wsPort}`,
	);
	logger.info(
		`🔌 Host      → TCP :${config.servers.host.port} · WS :${config.servers.websocket.duelPort}`,
	);
	logger.info("✅ Evolution server ready");
}
