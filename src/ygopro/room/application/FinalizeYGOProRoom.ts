import { WindbotModule } from "../../windbot/application/WindbotModule";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "../domain/YGOProRoom";
import MercuryRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";

/**
 * Canonical teardown for a YGOPro room. Centralizes the sequence previously
 * duplicated in YGOProDuelingState.removeRoom() and DisconnectHandler.handleYGOPro().
 *
 * Order is significant:
 *   1. finalizing = true — aborts any in-flight windbot retry loop before anything else.
 *   2. windbot token cleanup — no-op when windbot is uninitialized or disabled.
 *   3. close any still-open client sockets — MercuryRoomList.deleteRoom does NOT do this,
 *      so an orphaned bot would otherwise keep its socket alive.
 *   4. delete the room from the list.
 *   5. broadcast REMOVE-ROOM so the real-time room list updates.
 */
export class FinalizeYGOProRoom {
	static run(room: YGOProRoom): void {
		room.finalizing = true;

		WindbotModule.cleanupRoomIfEnabled(room.id);

		(room.clients as YGOProClient[]).forEach((client) => {
			if (!client.socket.closed) {
				client.destroy();
			}
		});

		MercuryRoomList.deleteRoom(room);

		WebSocketSingleton.getInstance().broadcast({
			action: "REMOVE-ROOM",
			data: room.toRealTimePresentation(),
		});
	}
}
