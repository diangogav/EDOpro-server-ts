import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { Client as EdoproClient } from "../edopro/client/domain/Client";
import { Room as EdoproRoom } from "../edopro/room/domain/Room";
import RoomList from "../edopro/room/infrastructure/RoomList";
import { YgoClient } from "../shared/client/domain/YgoClient";
import { YgoRoom } from "../shared/room/domain/YgoRoom";
import { ISocket } from "../shared/socket/domain/ISocket";
import { bridgeToEdoproRoom } from "../ygopro/edopro-bridge/BridgedSocket";
import { duelRuleFromFlags } from "../ygopro/edopro-bridge/edopro-lobby";

/**
 * Where a reconnection token that arrives on the YGOPro server leads.
 *
 * Most tokens belong to a player of a YGOPro room. One also belongs here when
 * its player sits in an EDOPro room it joined from this server
 * ("edo,<roomId>"): it comes back through the same door, on a socket that
 * translates the room's wire format again.
 *
 * It lives in the connection layer because it names rooms and clients of both
 * flows, which neither flow may do of the other.
 */
export const ygoproReconnectRoute = {
	/** Whether the token's player is one this server takes back. */
	owns(client: YgoClient): boolean {
		return client instanceof YGOProClient || isBridgedEdoproClient(client);
	},

	/** The room the player left: a YGOPro room, or the EDOPro room it was bridged into. */
	roomOf(roomId: number, client: YgoClient): YgoRoom | undefined {
		return client instanceof YGOProClient
			? (YGOProRoomList.findById(roomId) ?? undefined)
			: RoomList.getRooms().find((room) => room.id === roomId);
	},

	/**
	 * The socket the room is handed. An EDOPro room gets one that translates
	 * its wire format, told the Master Rule because a room does not send its
	 * host info again to a player who rejoins.
	 */
	socketFor(room: YgoRoom, reopened: ISocket): ISocket {
		if (!(room instanceof EdoproRoom)) {
			return reopened;
		}
		reopened.bridgedFromYgopro = true;

		return bridgeToEdoproRoom(reopened, duelRuleFromFlags(room.duelFlagsLow));
	},
};

/** A player of an EDOPro room who entered it from the YGOPro server. */
function isBridgedEdoproClient(client: YgoClient): boolean {
	return client instanceof EdoproClient && client.socket.bridgedFromYgopro === true;
}
