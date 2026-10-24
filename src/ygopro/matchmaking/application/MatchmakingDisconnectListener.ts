import { Logger } from "@shared/logger/domain/Logger";
import { SocketDisconnectListener } from "@shared/socket/domain/SocketDisconnectListener";

import { MatchmakingQueue } from "./MatchmakingQueue";

/**
 * A socket is never simultaneously queued and roomed, so this runs before the
 * room lookup and is a cheap no-op for every roomed or unqueued disconnect.
 */
export class MatchmakingDisconnectListener implements SocketDisconnectListener {
	onSocketClosed(socketId: string, logger: Logger): void {
		if (!MatchmakingQueue.isInitialized()) {
			return;
		}
		const dequeued = MatchmakingQueue.getInstance().dequeueBySocketId(socketId);
		if (dequeued) {
			logger.info("matchmaking.dequeued", { reason: "disconnect" });
		}
	}
}
