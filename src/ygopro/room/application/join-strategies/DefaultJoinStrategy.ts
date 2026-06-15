import { generateUniqueId } from "src/utils/generateUniqueId";

import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/**
 * DefaultJoinStrategy — terminal fallback.
 *
 * Behavior is an EXACT extraction of the original YGOProJoinHandler.findOrCreateRoom logic.
 * No behavioral changes — only the existing find-or-create + JOIN emit.
 *
 * This strategy always matches (terminal).
 */
export class DefaultJoinStrategy implements JoinStrategy {
	matches(_ctx: JoinContext): boolean {
		return true;
	}

	async handle(ctx: JoinContext): Promise<void> {
		const room = this._findOrCreateRoom(ctx);

		if (!room) {
			ctx.logger.info("JOIN_GAME rejected: wrong password");
			ctx.socket.destroy();
			return;
		}

		// Admission — ranked auth and league segregation — is decided inside the
		// room's WaitingState via AdmitToRoom. The strategy only routes the join.
		room.emit("JOIN", ctx.message, ctx.socket);
	}

	private _findOrCreateRoom(ctx: JoinContext): YGOProRoom | null {
		const existingRoom = YGOProRoomList.findByName(ctx.command);
		if (existingRoom) {
			if (existingRoom.password !== ctx.password) {
				return null;
			}
			return existingRoom;
		}

		const room = YGOProRoom.create(
			generateUniqueId(),
			ctx.rawPass,
			ctx.logger,
			ctx.eventEmitter,
			ctx.playerInfo,
			ctx.socketId,
			ctx.messageRepository,
		);
		YGOProRoomList.addRoom(room);
		room.waiting();

		return room;
	}
}
