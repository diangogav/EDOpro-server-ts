import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";

import { createMatchmakingRoom } from "@ygopro/matchmaking/application/MatchmakingRoomFactory";
import { MatchmakingRoomReaper } from "@ygopro/matchmaking/application/MatchmakingRoomReaper";
import { AbortMatchmakingRoom } from "@ygopro/matchmaking/application/AbortMatchmakingRoom";
import { pickBotFromRoster } from "@ygopro/matchmaking/domain/MatchmakingBotRoster";
import { CLEANUP_INTERVAL_MS, MatchmakingFormat } from "@ygopro/matchmaking/domain/QueueEntry";
import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

/**
 * Wires the matchmaking queue's ports to concrete infrastructure and starts the
 * background sweep. Kept in the composition root so the queue domain stays free
 * of YGOProRoom, windbot, and Date.now dependencies.
 *
 * - createRankedRoom(format) / createBotRoom(format) → additive YGOProRoom factory
 *   (matchmaking seam), now format-aware via FORMAT_ROOM_TOKEN.
 * - spawnBot(roomId, format) → windbot fire-and-forget, using a (name, deck) identity
 *   pair from MATCHMAKING_BOT_ROSTER so name and deck always come from the same pair.
 */
export function bootstrapMatchmaking(logger: Logger): void {
	const mmLogger = logger.child({ file: "Matchmaking" });

	// Reaps matchmaking-created rooms that are never joined (rage-quit before join,
	// ticket expiry between match and WS handshake, network drop). Reuses the SAME
	// canonical teardown as every other reap path.
	const reaper = new MatchmakingRoomReaper({
		now: () => Date.now(),
		finalize: (room) => AbortMatchmakingRoom.run(room),
	});

	MatchmakingQueue.init({
		now: () => Date.now(),

		createRankedRoom: (format: MatchmakingFormat) => {
			const { room, roomPassword } = createMatchmakingRoom({
				format,
				rankedOverride: true,
				logger: mmLogger,
				emitter: new EventEmitter(),
				onRoomCreated: (room) => reaper.track(room),
			});
			return { roomId: room.id, roomPassword };
		},

		createBotRoom: (format: MatchmakingFormat) => {
			const { room, roomPassword } = createMatchmakingRoom({
				format,
				rankedOverride: false,
				logger: mmLogger,
				emitter: new EventEmitter(),
				onRoomCreated: (room) => reaper.track(room),
			});
			return { roomPassword, roomId: room.id };
		},

		spawnBot: (roomId: number, format: MatchmakingFormat) => {
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
		},

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
	});

	MatchmakingQueue.getInstance().start();

	// Drive the empty-room sweep on its own unref'd timer so it never keeps the
	// process alive. Reuses the queue's cleanup cadence.
	const sweepTimer = setInterval(() => reaper.sweep(), CLEANUP_INTERVAL_MS);
	sweepTimer.unref();
}
