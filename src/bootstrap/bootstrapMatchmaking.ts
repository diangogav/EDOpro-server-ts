import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";

import { createMatchmakingRoom } from "@ygopro/matchmaking/application/MatchmakingRoomFactory";
import { MatchmakingRoomReaper } from "@ygopro/matchmaking/application/MatchmakingRoomReaper";
import { CLEANUP_INTERVAL_MS } from "@ygopro/matchmaking/domain/QueueEntry";
import { pickRandomTcgBotDeck } from "@ygopro/matchmaking/domain/MatchmakingTcgBotDecks";
import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";
import { FinalizeYGOProRoom } from "@ygopro/room/application/FinalizeYGOProRoom";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

/**
 * Wires the matchmaking queue's ports to concrete infrastructure and starts the
 * background sweep. Kept in the composition root so the queue domain stays free
 * of YGOProRoom, windbot, and Date.now dependencies.
 *
 * - createRankedRoom / createBotRoom → additive YGOProRoom factory (matchmaking seam).
 * - spawnBot → windbot fire-and-forget, guarded by WindbotModule.isInitialized().
 */
export function bootstrapMatchmaking(logger: Logger): void {
	const mmLogger = logger.child({ file: "Matchmaking" });

	// Reaps matchmaking-created rooms that are never joined (rage-quit before join,
	// ticket expiry between match and WS handshake, network drop). Reuses the SAME
	// canonical teardown as every other reap path.
	const reaper = new MatchmakingRoomReaper({
		now: () => Date.now(),
		finalize: (room) => FinalizeYGOProRoom.run(room),
	});

	MatchmakingQueue.init({
		now: () => Date.now(),

		createRankedRoom: () => {
			const { roomPassword } = createMatchmakingRoom({
				rankedOverride: true,
				logger: mmLogger,
				emitter: new EventEmitter(),
				onRoomCreated: (room) => reaper.track(room),
			});
			return { roomPassword };
		},

		createBotRoom: () => {
			const { room, roomPassword } = createMatchmakingRoom({
				rankedOverride: false,
				logger: mmLogger,
				emitter: new EventEmitter(),
				onRoomCreated: (room) => reaper.track(room),
			});
			return { roomPassword, roomId: room.id };
		},

		spawnBot: (roomId: number) => {
			if (!WindbotModule.isInitialized() || !WindbotModule.getInstance().isEnabled()) {
				return;
			}
			const room = YGOProRoomList.findById(roomId);
			if (!room) return;

			// Matchmaking v1 rooms are TCG (rule 1 + TCG banlist). The server botlist
			// is format-blind, so pick a curated TCG-legal deck here and pass it as a
			// deckOverride — otherwise a non-TCG bot deck fails the deck-check and the
			// human is ejected before the duel can start.
			const tcgDeck = pickRandomTcgBotDeck();

			// Fire-and-forget, mirroring WindBotJoinStrategy: abort retries once the
			// room begins teardown. On failure, tear the empty bot room down so it
			// does not linger in the lobby.
			void WindbotModule.getInstance()
				.requestBot(roomId, null, () => room.finalizing, tcgDeck)
				.then(({ bot }) => {
					room.windbot = { name: bot.name, deck: bot.deck };
				})
				.catch((error: unknown) => {
					mmLogger.error(
						`Matchmaking bot spawn failed for room ${roomId}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
					YGOProRoomList.deleteRoom(room);
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
