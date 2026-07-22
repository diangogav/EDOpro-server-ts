import "reflect-metadata";
import "src/shared/error-handler/error-handler";

import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

import { config } from "./config";
import { bootstrapResources } from "./bootstrap/bootstrapResources";
import { bootstrapPersistence } from "./bootstrap/bootstrapPersistence";
import { bootstrapBanListReloader } from "./bootstrap/bootstrapBanListReloader";
import { bootstrapMatchmaking } from "./bootstrap/bootstrapMatchmaking";
import { Server } from "./http-server/Server";
import { HostServer } from "./socket-server/HostServer";
import { WSHostServer } from "./socket-server/WSHostServer";
import { YGOProServer } from "./socket-server/YGOProServer";
import { WSYGOProServer } from "./socket-server/WSYGOProServer";
import { HandshakeTicketAuthenticator } from "./socket-server/HandshakeTicketAuthenticator";
import { RedisTicketRepository } from "./shared/ticket/infrastructure/redis/RedisTicketRepository";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";
import { bootstrapWindbot } from "./ygopro/windbot/infrastructure/bootstrapWindbot";
import { JoinStrategyRegistry } from "./ygopro/room/application/join-strategies/JoinStrategyRegistry";
import { composeJoinStrategies } from "./ygopro/room/application/join-strategies/composeJoinStrategies";

void start();

async function start(): Promise<void> {
	const logger = LoggerFactory.getLogger();

	logger.info("🚀 Evolution server starting…");

	const ticketRepository = new RedisTicketRepository();
	const server = new Server(logger, ticketRepository);
	const ygoproServer = new YGOProServer(logger);
	const wsYgoproServer = new WSYGOProServer(
		logger,
		new HandshakeTicketAuthenticator(ticketRepository),
	);

	const hostServer = new HostServer(logger);
	const wsHostServer = new WSHostServer(logger);

	await bootstrapResources(logger);
	await bootstrapPersistence(logger);

	// Keep in-memory ban lists fresh without a restart: re-read them on an interval
	// when the on-disk .conf files change (see bootstrapBanListReloader).
	await bootstrapBanListReloader(logger);

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

	// After windbot so the queue's bot-fallback availability check reflects it.
	bootstrapMatchmaking(logger);

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
