import { YGOProStocDuelEnd } from "ygopro-msg-encode";

import { container } from "@shared/dependency-injection";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";

import { WindbotModule } from "../../windbot/application/WindbotModule";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "../domain/YGOProRoom";
import MercuryRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";

/**
 * Canonical teardown for a YGOPro room. Centralizes the sequence previously
 * duplicated in YGOProDuelingState.removeRoom() and DisconnectHandler.handleYGOPro().
 *
 * Order is significant:
 *   1. finalizing = true — aborts any in-flight windbot retry loop before anything else.
 *   2. windbot token cleanup — no-op when windbot is uninitialized or disabled.
 *   3. MatchLifecycleHooks.runClosed — every match lifecycle hook releases any
 *      per-match state it kept, regardless of how the match ended.
 *   4. revoke each client's reconnection token + close any still-open socket —
 *      MercuryRoomList.deleteRoom does NOT do either, so without this an orphaned
 *      bot keeps its socket alive AND every player's token leaks into the global
 *      in-memory TokenIndex (which has no TTL) for the lifetime of the process.
 *   5. delete the room from the list.
 *   6. broadcast REMOVE-ROOM so the real-time room list updates.
 */
export class FinalizeYGOProRoom {
	static run(room: YGOProRoom): void {
		// Matchmaking's join reaper and socket disconnect handler can observe the
		// same abort on adjacent turns. Teardown is a single terminal transition.
		if (room.finalizing) return;
		room.finalizing = true;

		WindbotModule.cleanupRoomIfEnabled(room.id);

		container.get(MatchLifecycleHooks).runClosed({ roomId: room.id, matchId: room.matchId });

		// A client whose socket is still open mid-duel (WinScreen, side deck, RPS)
		// deliberately tolerates silent socket drops to allow reconnects — so an
		// unannounced destroy() strands it forever. STOC_DUEL_END is the universal
		// "this room is over" frame; send it best-effort before closing. In the
		// WAITING lobby the frame is meaningless (join errors already speak for
		// themselves) and the client's lobby disconnect policy handles the drop.
		const announceDuelEnd = room.duelState !== DuelState.WAITING;
		const duelEndBuffer = Buffer.from(new YGOProStocDuelEnd().toFullPayload());
		(room.clients as YGOProClient[]).forEach((client) => {
			ReconnectionTokenIssuer.revoke(client);
			if (!client.socket.closed) {
				if (announceDuelEnd) {
					try {
						client.sendMessageToClient(duelEndBuffer);
					} catch {
						// Socket already broken — destroy below still runs.
					}
				}
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
