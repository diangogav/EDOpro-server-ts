import { YgoClient } from "@shared/client/domain/YgoClient";
import { ISocket } from "@shared/socket/domain/ISocket";

import { findReconnectingPlayer } from "./findReconnectingPlayer";

/**
 * Mid-duel JOIN resolution that honors the socket's watch stamp BEFORE the
 * by-name reconnect is attempted. A watch join ("w,<roomId>") asked for the
 * stands, never for a seat: when the stamp names this exact room, the joiner
 * must fall through to the spectator branch even if its nickname matches a
 * reconnect-eligible player (in a ranked room that player may even still be
 * connected — the by-name path skips the address and liveness checks there).
 *
 * The stamp is scoped to the room the parsed command named and is never
 * cleared, so a stamp for any OTHER room is inert here.
 *
 * Every mid-duel state resolves its JOIN through this single seam so the
 * spectate-forcing rule cannot drift between states.
 */
export function findMidDuelReconnectingPlayer(params: {
	players: YgoClient[];
	name: string;
	socket: ISocket;
	roomId: number;
	ranked: boolean;
}): YgoClient | null {
	const { socket } = params;

	if (socket.watchForRoomId !== undefined && socket.watchForRoomId === params.roomId) {
		return null;
	}

	return findReconnectingPlayer({
		players: params.players,
		name: params.name,
		remoteAddress: socket.remoteAddress,
		ranked: params.ranked,
	});
}
