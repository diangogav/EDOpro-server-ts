import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { YgoRoom } from "@shared/room/domain/YgoRoom";

/**
 * Builds the `MatchContext.announce` capability for one room: a system
 * STOC_CHAT (opcode 0x19, ChatColor.GRAY) frame sent to every current
 * `room.clients` (players and spectators). This is the only way a match
 * lifecycle hook reaches the room's clients — it never sees a socket.
 */
export function createRoomAnnounce(room: YgoRoom): (message: string) => void {
	return (message: string) => {
		const frame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({ player_type: ChatColor.GRAY, msg: message })
				.toFullPayload(),
		);

		room.clients.forEach((client) => {
			client.socket.send(frame);
		});
	};
}
