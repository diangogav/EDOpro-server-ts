import { ChatColor } from "ygopro-msg-encode";

import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { createSystemChat } from "@shared/room/domain/chat/SystemChat";

/**
 * Builds the `MatchContext.announce` capability for one room: a system
 * STOC_CHAT (opcode 0x19, ChatColor.GRAY) frame sent to every current
 * `room.clients` (players and spectators). This is the only way a match
 * lifecycle hook reaches the room's clients — it never sees a socket.
 */
export function createRoomAnnounce(room: YgoRoom): (message: string) => void {
	return (message: string) => {
		const frame = createSystemChat(ChatColor.GRAY, message);

		room.clients.forEach((client) => {
			client.socket.send(frame);
		});
	};
}
