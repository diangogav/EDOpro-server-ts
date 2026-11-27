import { ResumeInfo } from "@shared/messages/server-to-client/ResumeInfoClientMessage";
import { AccountSeat, findSeatOfUser } from "@shared/room/domain/reconnect/findSeatOfUser";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { Client as EdoproClient } from "../edopro/client/domain/Client";
import { Room as EdoproRoom } from "../edopro/room/domain/Room";
import RoomList from "../edopro/room/infrastructure/RoomList";
import { YgoClient } from "../shared/client/domain/YgoClient";
import { DuelState, YgoRoom } from "../shared/room/domain/YgoRoom";
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
	/**
	 * The seat an account holds in a started match on this server, among the
	 * players this server takes back (YGOPro rooms, and EDOPro rooms entered from here).
	 */
	seatOf(userId: string): AccountSeat | null {
		return findSeatOfUser(
			[...YGOProRoomList.getRooms(), ...RoomList.getRooms()],
			userId,
			ygoproReconnectRoute.owns,
		);
	},

	/** What a device that took the seat over needs to draw the duel. */
	resumeInfoOf({ client, room }: AccountSeat): ResumeInfo {
		const score = room.matchScore();
		const own = client.team === 0 ? score.team0 : score.team1;
		const opponent = client.team === 0 ? score.team1 : score.team0;

		return {
			banListName:
				room instanceof YGOProRoom || room instanceof EdoproRoom ? room.banListName : null,
			score: { own, opponent },
			edoproRoom: room instanceof EdoproRoom,
			deck: room.duelState === DuelState.SIDE_DECKING ? deckCodesOf(client) : null,
		};
	},

	socketFor(room: YgoRoom, reopened: ISocket): ISocket {
		if (!(room instanceof EdoproRoom)) {
			return reopened;
		}
		reopened.bridgedFromYgopro = true;

		return bridgeToEdoproRoom(reopened, duelRuleFromFlags(room.duelFlagsLow));
	},
};

/** The codes of a seat's deck, in the order the server holds them. */
function deckCodesOf(client: YgoClient): ResumeInfo["deck"] {
	const codes = (cards: readonly { code: string | number }[]) =>
		cards.map((card) => Number(card.code));
	const deck = client.deck;

	return { main: codes(deck.main), extra: codes(deck.extra), side: codes(deck.side) };
}

/** A player of an EDOPro room who entered it from the YGOPro server. */
function isBridgedEdoproClient(client: YgoClient): boolean {
	return client instanceof EdoproClient && client.socket.bridgedFromYgopro === true;
}
