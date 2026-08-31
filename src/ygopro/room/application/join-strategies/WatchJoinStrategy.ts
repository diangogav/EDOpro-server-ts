import { ChatColor, ErrorMessageType } from "ygopro-msg-encode";

import { createSystemChat } from "@shared/room/domain/chat/SystemChat";

import { JoinContext, JoinStrategy } from "./JoinStrategy";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/**
 * WatchJoinStrategy — intentional spectating by room id: "w,<roomId>[#password]".
 *
 * The command segment must be exactly two comma-separated tokens: "w"
 * (trimmed, case-insensitive) followed by an all-digit room id. Any other
 * shape is NOT a watch join and falls through to the rest of the chain.
 *
 * Unlike every other join, a watch join NEVER creates a room: an unknown id
 * or a password mismatch is an explicit reject (red chat + JOINERROR +
 * close, the established idiom), not a silent new room. The room password
 * must match exactly (empty matches empty).
 *
 * On success the socket is stamped with watchForRoomId BEFORE the JOIN emit,
 * so the waiting state's admission offers no seat and the joiner lands in
 * the stands; mid-duel states force their spectator branch for the stamped
 * socket, skipping the by-name reconnect so a matching nickname never takes
 * a seated player's place. The stamp is derived only from the server-parsed
 * command and never bypasses the reservation gate, which runs first in every
 * state's handleJoin.
 */
export class WatchJoinStrategy implements JoinStrategy {
	matches(ctx: JoinContext): boolean {
		return WatchJoinStrategy.parseRoomId(ctx.command) !== null;
	}

	async handle(ctx: JoinContext): Promise<void> {
		const roomId = WatchJoinStrategy.parseRoomId(ctx.command);
		if (roomId === null) {
			// Unreachable behind matches(); the throw surfaces a mis-wired chain
			// through the handler's generic JOINERROR path instead of hiding it.
			throw new Error("WatchJoinStrategy.handle called for a non-watch command");
		}

		const room = YGOProRoomList.findById(roomId);
		if (!room) {
			this.reject(ctx, `Room ${roomId} not found.`);
			return;
		}

		if (room.password !== ctx.password) {
			this.reject(ctx, "Wrong password.");
			return;
		}

		ctx.socket.watchForRoomId = room.id;
		room.emit("JOIN", ctx.message, ctx.socket);
	}

	/**
	 * "w,<digits>" (tokens trimmed, "w" case-insensitive) → the room id;
	 * anything else → null. The id token must be all digits AFTER trimming —
	 * inner whitespace or any non-digit disqualifies the whole command.
	 */
	private static parseRoomId(command: string): number | null {
		const tokens = command.split(",");
		if (tokens.length !== 2) {
			return null;
		}

		const [watchToken, idToken] = tokens.map((token) => token.trim());
		if (watchToken.toLowerCase() !== "w") {
			return null;
		}

		if (!/^\d+$/.test(idToken)) {
			return null;
		}

		return Number(idToken);
	}

	/**
	 * Red chat explaining why, the real JOINERROR, then a graceful close() so
	 * both frames flush — the same sequence as YGOProRoom.rejectReservedJoin
	 * and the waiting state's name-taken path.
	 */
	private reject(ctx: JoinContext, reason: string): void {
		ctx.socket.send(createSystemChat(ChatColor.RED, reason));
		ctx.socket.send(ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0));
		ctx.socket.close();
	}
}
