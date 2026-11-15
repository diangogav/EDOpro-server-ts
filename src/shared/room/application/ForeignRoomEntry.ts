import { ClientMessage } from "../../messages/MessageProcessor";
import { ISocket } from "../../socket/domain/ISocket";

export type ForeignRoomEntryResult =
	| "joined"
	| "not-found"
	| "wrong-password"
	| "login-required"
	| "unsupported";

export interface ForeignRoomEntryRequest {
	roomId: number;
	password: string;
	/** The joiner's JOIN_GAME frame; its PLAYER_INFO predecessor names the player. */
	message: ClientMessage;
	socket: ISocket;
}

/**
 * Seats a socket in a room owned by the other protocol's flow. Each flow
 * implements the entry into its own rooms; the caller only learns the outcome
 * and answers its client in its own wire format.
 */
export interface ForeignRoomEntry {
	enter(request: ForeignRoomEntryRequest): ForeignRoomEntryResult;
}
