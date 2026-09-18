import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { RedisTicketRepository } from "@shared/ticket/infrastructure/redis/RedisTicketRepository";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { createMatchmakingRoom } from "@ygopro/matchmaking/application/MatchmakingRoomFactory";
import { MatchmakingRoomReaper } from "@ygopro/matchmaking/application/MatchmakingRoomReaper";
import { AbortMatchmakingRoom } from "@ygopro/matchmaking/application/AbortMatchmakingRoom";
import { AuthenticateMatchmakingSession } from "@ygopro/matchmaking/application/AuthenticateMatchmakingSession";
import { CancelMatchmaking } from "@ygopro/matchmaking/application/CancelMatchmaking";
import { EnterMatchmaking } from "@ygopro/matchmaking/application/EnterMatchmaking";
import { MatchmakingConnectionFactory } from "@ygopro/matchmaking/application/MatchmakingConnectionFactory";
import { MatchmakingConnectionHandler } from "@ygopro/matchmaking/application/MatchmakingConnectionHandler";
import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";
import { ProvisionMatchRoom } from "@ygopro/matchmaking/application/ProvisionMatchRoom";
import { pickBotFromRoster } from "@ygopro/matchmaking/domain/MatchmakingBotRoster";
import { ParticipantChannel, RejectionReason } from "@ygopro/matchmaking/domain/ParticipantChannel";
import { CLEANUP_INTERVAL_MS, MatchmakingFormat } from "@ygopro/matchmaking/domain/QueueEntry";
import { Session } from "@ygopro/matchmaking/domain/Session";
import { SocketParticipantChannel } from "@ygopro/matchmaking/infrastructure/SocketParticipantChannel";
import { UserProfileBanChecker } from "@ygopro/matchmaking/infrastructure/UserProfileBanChecker";
import { UserProfileDisplayNameResolver } from "@ygopro/matchmaking/infrastructure/UserProfileDisplayNameResolver";
import { UnusedRoomIdGenerator } from "@ygopro/room/infrastructure/UnusedRoomIdGenerator";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

import { Commands } from "@shared/messages/Commands";

/** Every CTOS opcode the unavailable-matchmaking guard answers (D25 failure path). */
const MATCHMAKING_CTOS_COMMANDS: readonly Commands[] = [
	Commands.MATCHMAKING_AUTH,
	Commands.MATCHMAKING_ENTER,
	Commands.MATCHMAKING_CANCEL,
];

/**
 * Wires the matchmaking queue's ports to concrete infrastructure, starts the
 * background sweep, and returns a `MatchmakingConnectionFactory` the socket
 * servers invoke once per connection. Kept in the composition root so the
 * queue domain stays free of YGOProRoom, windbot, and Date.now dependencies.
 *
 * - createRankedRoom(format) / createBotRoom(format) → additive YGOProRoom factory
 *   (matchmaking seam), now format-aware via FORMAT_ROOM_TOKEN.
 * - spawnBot(roomId, format) → windbot fire-and-forget, using a (name, deck) identity
 *   pair from MATCHMAKING_BOT_ROSTER so name and deck always come from the same pair.
 * - matchHandler → ProvisionMatchRoom, so socket AND poll participants alike are
 *   seated through the exact same provisioning path (one pool, two presences — D11).
 */
export function bootstrapMatchmaking(logger: Logger): MatchmakingConnectionFactory {
	const mmLogger = logger.child({ file: "Matchmaking" });

	// Reaps matchmaking-created rooms that are never joined (rage-quit before join,
	// ticket expiry between match and WS handshake, network drop). Reuses the SAME
	// canonical teardown as every other reap path.
	const reaper = new MatchmakingRoomReaper({
		now: () => Date.now(),
		finalize: (room) => AbortMatchmakingRoom.run(room),
	});

	const spawnBot = (roomId: number, format: MatchmakingFormat): void => {
		if (!WindbotModule.isInitialized() || !WindbotModule.getInstance().isEnabled()) {
			return;
		}
		const room = YGOProRoomList.findById(roomId);
		if (!room) return;

		// Pick an identity pair from the per-format roster. Name and deck always
		// come from the same pair (identity coherence). Pass the explicit name so
		// requestBot finds the right bot by name, and pass deck as deckOverride so
		// windbot uses the correct deck and deckcode is cleared.
		const pair = pickBotFromRoster(format);

		// Fire-and-forget, mirroring WindBotJoinStrategy: abort retries once the
		// room begins teardown. On failure, tear the empty bot room down so it
		// does not linger in the lobby.
		void WindbotModule.getInstance()
			.requestBot(roomId, pair.name, () => room.finalizing, pair.deck)
			.then(({ bot }) => {
				room.windbot = { name: bot.name, deck: bot.deck };
			})
			.catch((error: unknown) => {
				mmLogger.error(
					`Matchmaking bot spawn failed for room ${roomId}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				AbortMatchmakingRoom.run(room);
			});
	};

	MatchmakingQueue.init({
		now: () => Date.now(),
		logger: mmLogger,

		createRankedRoom: (format: MatchmakingFormat, reservedUserIds: readonly [string, string]) => {
			const { room, roomPassword } = createMatchmakingRoom({
				format,
				// Ranked human pairs play best-of-3 (MATCH room with side-decking).
				matchMode: true,
				rankedOverride: true,
				reservedUserIds,
				logger: mmLogger,
				emitter: new EventEmitter(),
				onRoomCreated: (room) => reaper.track(room),
			});
			return { roomId: room.id, roomPassword };
		},

		createBotRoom: (format: MatchmakingFormat, reservedUserId: string) => {
			const { room, roomPassword } = createMatchmakingRoom({
				format,
				// Bot fallback stays best-of-1: windbot has no side-deck support,
				// so a MATCH room would stall in side-decking until the timeout.
				matchMode: false,
				rankedOverride: false,
				// Only the human is reserved: the windbot enters through its
				// one-shot AIJOIN token, which marks its socket internal.
				reservedUserIds: [reservedUserId],
				logger: mmLogger,
				emitter: new EventEmitter(),
				onRoomCreated: (room) => reaper.track(room),
			});
			return { roomPassword, roomId: room.id };
		},

		spawnBot,

		// Bot fallback only makes sense when windbot is up; otherwise entries keep
		// waiting for a human (or TTL-drop) instead of dead-ending on a bot game.
		botAvailable: () => WindbotModule.isInitialized() && WindbotModule.getInstance().isEnabled(),

		// A synchronous room-creation failure is caught inside the queue's sweep so
		// it never aborts the sweep or 500s an unrelated poller; log it here.
		onRoomCreationError: (error: unknown) => {
			mmLogger.error(
				`Matchmaking room creation failed during sweep: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		},

		// Every match — socket or poll — is seated through the same provisioning
		// path. The re-queue port is a lazy indirection to the facade's own pool:
		// by the time it is ever invoked, MatchmakingQueue.init (this call) has
		// already returned, so the singleton is available.
		matchHandler: new ProvisionMatchRoom({
			logger: mmLogger,
			roomIdGenerator: new UnusedRoomIdGenerator(),
			pool: { add: (participant) => MatchmakingQueue.getInstance().getPool().add(participant) },
			spawnBot,
			onRoomCreated: (room) => reaper.track(room),
		}),
	});

	MatchmakingQueue.getInstance().start();

	// Drive the empty-room sweep on its own unref'd timer so it never keeps the
	// process alive. Reuses the queue's cleanup cadence.
	const sweepTimer = setInterval(() => reaper.sweep(), CLEANUP_INTERVAL_MS);
	sweepTimer.unref();

	const profiles = new UserProfilePostgresRepository();
	const authenticate = new AuthenticateMatchmakingSession(
		new RedisTicketRepository(),
		new UserProfileBanChecker(profiles),
		new UserProfileDisplayNameResolver(profiles),
		mmLogger,
	);

	return (socket: ISocket, eventEmitter: EventEmitter): void => {
		const session = new Session(socket);
		const channel: ParticipantChannel = new SocketParticipantChannel(socket);

		if (!MatchmakingQueue.isInitialized()) {
			subscribeUnavailableGuard(eventEmitter, channel);
			return;
		}

		const pool = MatchmakingQueue.getInstance().getPool();
		new MatchmakingConnectionHandler(
			eventEmitter,
			socket,
			session,
			channel,
			authenticate,
			new EnterMatchmaking(pool, () => Date.now(), mmLogger),
			new CancelMatchmaking(pool, mmLogger),
			mmLogger,
		);
	};
}

/**
 * Defensive fallback so a connection made while matchmaking is unavailable
 * never hangs a client on one of its three CTOS opcodes — it answers exactly
 * as `MatchmakingConnectionHandler` would for the "not initialized" failure
 * path, without needing a real pool/session behind it.
 */
function subscribeUnavailableGuard(eventEmitter: EventEmitter, channel: ParticipantChannel): void {
	const reason: RejectionReason = "internal_error";
	const reject = (): void => {
		channel.status({ state: "rejected", waitedMs: 0, reason });
	};
	for (const command of MATCHMAKING_CTOS_COMMANDS) {
		eventEmitter.on(command as unknown as string, reject);
	}
}
