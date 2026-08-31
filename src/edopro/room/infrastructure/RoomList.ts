import { container } from "@shared/dependency-injection";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";

import { type Room } from "../domain/Room";

const rooms: Room[] = [];

export default {
	addRoom(room: Room): void {
		rooms.push(room);
	},

	getRooms(): Room[] {
		return rooms;
	},

	// deleteRoom is the single funnel through which every edopro room is torn down
	// (DisconnectHandler, FinishDuelHandler and Room itself all route here), so it
	// is also where we revoke the players' reconnection tokens and notify
	// MatchLifecycleHooks that the room closed. Without the token revocation they
	// leak into the global in-memory TokenIndex (no TTL) for the life of the
	// process, pointing at destroyed clients. ygopro does the equivalent in
	// FinalizeYGOProRoom — edopro has no such application-level teardown, so the
	// infrastructure funnel is the natural home here.
	deleteRoom(room: Room): void {
		room.clients.forEach((client) => {
			ReconnectionTokenIssuer.revoke(client);
		});
		container.get(MatchLifecycleHooks).runClosed({ roomId: room.id, matchId: room.matchId });
		room.destroy();
		const index = rooms.findIndex((item) => item.id === room.id);
		if (index !== -1) {
			rooms.splice(index, 1);
		}
	},
};
