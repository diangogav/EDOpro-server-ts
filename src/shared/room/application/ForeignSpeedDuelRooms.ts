import { ClientMessage } from "../../messages/MessageProcessor";
import { ISocket } from "../../socket/domain/ISocket";
import { ForeignRoomEntryResult } from "./ForeignRoomEntry";

/**
 * `unavailable`: the flow cannot open a Speed Duel room right now (its Speed
 * Duel ban list is not loaded).
 */
export type ForeignSpeedDuelEntryResult = ForeignRoomEntryResult | "unavailable";

export interface ForeignSpeedDuelEntryRequest {
	/** Room identity, with the password: two requests naming the same pair meet. */
	name: string;
	password: string;
	bestOf: 1 | 3;
	/** The joiner's JOIN_GAME frame; its PLAYER_INFO predecessor names the player. */
	message: ClientMessage;
	socket: ISocket;
}

/**
 * Seats a socket in a Speed Duel room of the other protocol's flow, which
 * opens the room itself when no waiting one carries that name and password.
 * The room's settings belong to the format and to the flow that owns the
 * room: the caller chooses only its identity and the match length.
 */
export interface ForeignSpeedDuelRooms {
	enter(request: ForeignSpeedDuelEntryRequest): ForeignSpeedDuelEntryResult;
}
