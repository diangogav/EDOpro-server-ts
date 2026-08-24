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
import { container } from "./shared/dependency-injection";
import { EventBus } from "./shared/event-bus/EventBus";
import { RedisTicketRepository } from "./shared/ticket/infrastructure/redis/RedisTicketRepository";
import { MatchResumeCreator } from "./shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "./shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { MatchResumePostgresRepository } from "./shared/stats/match-resume/infrastructure/postgres/MatchResumePostgresRepository";
import { PlayerStatsPostgresRepository } from "./shared/stats/player-stats/infrastructure/PlayerStatsPostgresRepository";
import { BasicStatsCalculator } from "./plugins/basic-stats/application/BasicStatsCalculator";
import { UnrankedMatchSaver } from "./plugins/unranked-match/application/UnrankedMatchSaver";
import { UnrankedMatchPostgresRepository } from "./plugins/unranked-match/infrastructure/postgres/UnrankedMatchPostgresRepository";
import { UserProfilePostgresRepository } from "./shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
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

	// Subscriber registration lives here (not in HostServer) so it always runs
	// after persistence is ready and before any socket can publish GAME_OVER.
	// TODO(plugin-system phase 2): replace with bootstrapPlugins(bus, deps).
	const eventBus = container.get(EventBus);

	eventBus.subscribe(
		BasicStatsCalculator.ListenTo,
		new BasicStatsCalculator(
			logger,
			new UserProfilePostgresRepository(),
			new PlayerStatsPostgresRepository(),
			new MatchResumeCreator(new MatchResumePostgresRepository()),
			new DuelResumeCreator(new MatchResumePostgresRepository()),
		),
	);

	eventBus.subscribe(
		UnrankedMatchSaver.ListenTo,
		new UnrankedMatchSaver(logger, new UnrankedMatchPostgresRepository()),
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
	JoinStrategyRegistry.setStrategies(composeJoinStrategies(windbotModule));
	if (windbotModule) {
		logger.info("🤖 Windbot enabled");
	}

	await server.initialize();
	WebSocketSingleton.getInstance();
	hostServer.initialize();
	wsHostServer.initialize();

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
