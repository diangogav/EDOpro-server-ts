import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";

import { createMatchmakingRoom } from "@ygopro/matchmaking/application/MatchmakingRoomFactory";
import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";
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

	MatchmakingQueue.init({
		now: () => Date.now(),

		createRankedRoom: () => {
			const { roomPassword } = createMatchmakingRoom({
				rankedOverride: true,
				logger: mmLogger,
				emitter: new EventEmitter(),
			});
			return { roomPassword };
		},

		createBotRoom: () => {
			const { room, roomPassword } = createMatchmakingRoom({
				rankedOverride: false,
				logger: mmLogger,
				emitter: new EventEmitter(),
			});
			return { roomPassword, roomId: room.id };
		},

		spawnBot: (roomId: number) => {
			if (!WindbotModule.isInitialized() || !WindbotModule.getInstance().isEnabled()) {
				return;
			}
			const room = YGOProRoomList.findById(roomId);
			if (!room) return;

			// Fire-and-forget, mirroring WindBotJoinStrategy: abort retries once the
			// room begins teardown. On failure, tear the empty bot room down so it
			// does not linger in the lobby.
			void WindbotModule.getInstance()
				.requestBot(roomId, null, () => room.finalizing)
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
	});

	MatchmakingQueue.getInstance().start();
}
