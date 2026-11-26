import "reflect-metadata";
import "src/shared/error-handler/error-handler";

import { checkTcpKeepAliveTuning } from "src/shared/socket/infrastructure/tcpKeepAlive";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

import { config } from "./config";
import { bootstrapResources } from "./bootstrap/bootstrapResources";
import { registerBanListCatalogs } from "./bootstrap/banListCatalogs";
import { registerRoomStatePorts } from "./bootstrap/roomStatePorts";
import { bootstrapPersistence } from "./bootstrap/bootstrapPersistence";
import { bootstrapPlugins } from "./bootstrap/bootstrapPlugins";
import { bootstrapBanListReloader } from "./bootstrap/bootstrapBanListReloader";
import { bootstrapMatchmaking } from "./bootstrap/bootstrapMatchmaking";
import { bootstrapBotReservedDuels } from "./bootstrap/bootstrapBotReservedDuels";
import { bootstrapReservedDuels } from "./bootstrap/bootstrapReservedDuels";
import { bootstrapMetrics } from "./bootstrap/bootstrapMetrics";
import { Server } from "./http-server/Server";
import { HostServer } from "./socket-server/HostServer";
import { WSHostServer } from "./socket-server/WSHostServer";
import { registerForeignPrintings } from "./bootstrap/foreignPrintings";
import { EdoproBanListsByHash } from "./edopro/ban-list/infrastructure/EdoproBanListsByHash";
import { EdoproRoomEntry } from "./edopro/room/application/EdoproRoomEntry";
import { EdoproSpeedDuelRooms } from "./edopro/room/application/EdoproSpeedDuelRooms";
import { YGOProServer } from "./socket-server/YGOProServer";
import { WSYGOProServer } from "./socket-server/WSYGOProServer";
import { HandshakeTicketAuthenticator } from "./socket-server/HandshakeTicketAuthenticator";
import { container } from "./shared/dependency-injection";
import { EventBus } from "./shared/event-bus/EventBus";
import { RedisTicketRepository } from "./shared/ticket/infrastructure/redis/RedisTicketRepository";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";
import { bootstrapPresence } from "./bootstrap/bootstrapPresence";
import { ChallengeRoomBook } from "./shared/challenge/application/ChallengeRoomBook";
import { bootstrapWindbot } from "./ygopro/windbot/infrastructure/bootstrapWindbot";
import { JoinStrategyRegistry } from "./ygopro/room/application/join-strategies/JoinStrategyRegistry";
import { composeJoinStrategies } from "./ygopro/room/application/join-strategies/composeJoinStrategies";
import { useEdoproBanLists } from "./ygopro/edopro-bridge/ownBanListHash";

void start();

async function start(): Promise<void> {
	const logger = LoggerFactory.getLogger();

	logger.info("🚀 Evolution server starting…");
	checkTcpKeepAliveTuning(logger);
	// Before any listener or room exists: rooms and their states read these.
	registerRoomStatePorts();
	registerBanListCatalogs();
	registerForeignPrintings();
	// Before any room exists, so every duel engine is measured.
	await bootstrapMetrics(config.metrics, logger);

	const ticketRepository = new RedisTicketRepository();
	const server = new Server(logger, ticketRepository);

	const hostServer = new HostServer(logger);
	const wsHostServer = new WSHostServer(logger);

	await bootstrapResources(logger);
	await bootstrapPersistence(logger);
	const reservedDuels = await bootstrapReservedDuels(
		{
			enabled: config.ranking.enabled && config.redis.use && Boolean(config.redis.uri),
			instanceId: config.reservedDuels.instanceId,
			production: config.env === "production",
		},
		logger,
	);

	// Plugin registration lives here (not in HostServer) so it always runs
	// after persistence is ready and before any socket can publish GAME_OVER.
	const eventBus = container.get(EventBus);

	const pluginReport = await bootstrapPlugins(eventBus, { logger, config });
	logger.info(
		`🔌 Plugins   → loaded: [${pluginReport.loaded.join(", ")}] · skipped: [${pluginReport.skipped.join(", ")}] · failed: [${pluginReport.failed.join(", ")}]`,
	);

	// Keep in-memory ban lists fresh without a restart: re-read them on an interval
	// when the on-disk .conf files change (see bootstrapBanListReloader).
	await bootstrapBanListReloader(logger);

	// config.windbot is validated for fail-fast at module load (src/config/index.ts).
	// Bootstrapped BEFORE any server/socket initialization below: it has no
	// dependency on them (only on config + the mercury port number), so a bad
	// botlist (see FileBotlistRepository's boot-time validation) aborts boot
	// pre-listen instead of crashing the process with sockets already open.
	const windbotModule = config.windbot.enabled
		? bootstrapWindbot(config.windbot, config.servers.mercury.port)
		: undefined;
	// The YGOPro flow reaches EDOPro rooms through these ports only.
	useEdoproBanLists(new EdoproBanListsByHash());
	// Rooms of accepted challenges: presence issues them, the "ch#<code>" join resolves them.
	const challengeRooms = new ChallengeRoomBook();
	JoinStrategyRegistry.setStrategies(
		composeJoinStrategies(
			windbotModule,
			{
				rooms: new EdoproRoomEntry(),
				speedDuelRooms: new EdoproSpeedDuelRooms(logger),
			},
			challengeRooms,
		),
	);
	if (windbotModule) {
		logger.info("🤖 Windbot enabled");
	}
	await bootstrapBotReservedDuels(reservedDuels, windbotModule, logger);

	// After windbot so the queue's bot-fallback availability check reflects it,
	// and before the ygopro servers so the returned factory can be injected
	// into their constructors (D25).
	const matchmakingConnectionFactory = bootstrapMatchmaking(logger);
	const ygoproServer = new YGOProServer(logger, matchmakingConnectionFactory);
	const wsYgoproServer = new WSYGOProServer(
		logger,
		new HandshakeTicketAuthenticator(ticketRepository),
		matchmakingConnectionFactory,
	);

	await server.initialize();
	WebSocketSingleton.getInstance();
	bootstrapPresence(logger, ticketRepository, challengeRooms);
	hostServer.initialize();
	wsHostServer.initialize();

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
