import {
	ForeignRoomEntry,
	ForeignRoomEntryRequest,
	ForeignRoomEntryResult,
} from "@shared/room/application/ForeignRoomEntry";
import { ClientMessage } from "@shared/messages/MessageProcessor";

import RoomList from "../infrastructure/RoomList";

const JOIN_GAME_BODY_BYTES = 52;
const ROOM_ID_OFFSET = 4;
const PASSWORD_OFFSET = 8;
const PASSWORD_MAX_UNITS = 19;

/**
 * Entry into an EDOPro room for a socket that connected through the YGOPro
 * server. The room then owns the socket and talks to it in the EDOPro wire
 * format; the caller hands in a socket that translates it for its client.
 *
 * Only rooms that client can present (`Room.seatsYgoproClients`): 1v1 or 2v2, under
 * a Master Rule or a Speed Duel, with no extra rule. A ranked room needs the account the server verified for the socket, because
 * such a client has no EDOPro password to log in with.
 */
export class EdoproRoomEntry implements ForeignRoomEntry {
	public enter({
		roomId,
		password,
		message,
		socket,
	}: ForeignRoomEntryRequest): ForeignRoomEntryResult {
		const room = RoomList.getRooms().find((candidate) => candidate.id === roomId);
		if (!room) {
			return "not-found";
		}
		if (!room.seatsYgoproClients) {
			return "unsupported";
		}
		if (room.ranked && typeof socket.resolvedUserId !== "string") {
			return "login-required";
		}
		if (room.password !== password) {
			return "wrong-password";
		}

		socket.bridgedFromYgopro = true;
		room.emit("JOIN", EdoproRoomEntry.toEdoproJoin(message, roomId, password), socket);

		return "joined";
	}

	/** The JOIN_GAME body an EDOPro client would have sent for this room. */
	private static toEdoproJoin(
		message: ClientMessage,
		roomId: number,
		password: string,
	): ClientMessage {
		const data = Buffer.alloc(JOIN_GAME_BODY_BYTES);
		data.writeUInt32LE(roomId, ROOM_ID_OFFSET);
		data.write(password.slice(0, PASSWORD_MAX_UNITS), PASSWORD_OFFSET, "utf16le");

		return { ...message, data, size: data.length + 1 };
	}
}
