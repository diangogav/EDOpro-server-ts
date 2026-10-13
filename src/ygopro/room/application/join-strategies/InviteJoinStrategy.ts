import { ChatColor, ErrorMessageType } from "ygopro-msg-encode";
import { createSystemChat } from "@shared/room/domain/chat/SystemChat";
import { JoinContext, JoinStrategy } from "./JoinStrategy";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/** Public lobby instance identity; never creates a replacement or grants a seat itself. */
export class InviteJoinStrategy implements JoinStrategy {
	public matches(ctx: JoinContext): boolean {
		// Reserve malformed j commands too: they must never become room names.
		return ctx.command.split(",")[0].trim().toLowerCase() === "j";
	}

	public async handle(ctx: JoinContext): Promise<void> {
		const match = /^j,([A-Za-z0-9_-]{16})$/.exec(ctx.command);
		const room = match
			? YGOProRoomList.getRooms().find((item) => item.inviteId === match[1])
			: undefined;
		if (!room || ctx.password !== "" || !room.canAcceptInvitation()) {
			ctx.socket.send(
				createSystemChat(
					ChatColor.RED,
					"This invitation is no longer available for a player seat.",
				),
			);
			ctx.socket.send(ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0));
			ctx.socket.close();
			return;
		}
		ctx.socket.inviteForRoomId = room.id;
		room.emit("JOIN", ctx.message, ctx.socket);
	}
}
