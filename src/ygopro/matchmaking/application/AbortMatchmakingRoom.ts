import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";
import { FinalizeYGOProRoom } from "@ygopro/room/application/FinalizeYGOProRoom";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

/**
 * Atomically abort an incomplete matchmaking lobby.
 *
 * Queue reservations must be released before sockets are closed: the surviving
 * client reacts to that close by immediately re-entering matchmaking, and would
 * otherwise collide with its old matched entry (`409 Already in queue`).
 */
export class AbortMatchmakingRoom {
	static run(room: YGOProRoom): void {
		if (MatchmakingQueue.isInitialized()) {
			MatchmakingQueue.getInstance().abortRoom(room.id);
		}
		FinalizeYGOProRoom.run(room);
	}
}
