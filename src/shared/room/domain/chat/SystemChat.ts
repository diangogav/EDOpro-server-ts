import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

/**
 * Builds a system STOC_CHAT (opcode 0x19) frame with the given color and
 * text, ready for socket.send. Both pipelines understand this wire format,
 * so it is the single encoder every server-originated system message (join
 * rejections, room notices, admin broadcasts, rating announcements, ...)
 * should go through instead of the edopro-only 0xF3 frame, which mangles
 * non-ASCII text.
 *
 * The wire format silently truncates msg to YGOProStocChat.MAX_LENGTH
 * UTF-16 units — callers must keep system messages short.
 */
export function createSystemChat(color: ChatColor, text: string): Buffer {
	return Buffer.from(
		new YGOProStocChat().fromPartial({ player_type: color, msg: text }).toFullPayload(),
	);
}
