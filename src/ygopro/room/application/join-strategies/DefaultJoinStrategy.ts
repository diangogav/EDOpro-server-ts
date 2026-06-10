import { generateUniqueId } from "src/utils/generateUniqueId";

import { ErrorMessageType } from "ygopro-msg-encode";

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

		if (room.ranked && !(await ctx.checkIfUserCanJoin.check(ctx.playerInfo, ctx.socket))) {
			// Send the JOINERROR with the ygopro serializer (YGOProStocErrorMsg → 8-byte
			// body, code at offset 4), the same path DECKERROR uses. checkIfUserCanJoin no
			// longer sends it because the @edopro ErrorClientMessage it used has a 5-byte
			// body the web client cannot decode ("Data too short: need 8 bytes, got 5").
			ctx.socket.send(ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0));
			// Close the socket so the client gets a real disconnect instead of a
			// live-but-useless connection it would keep reusing (the handshake — where the
			// ticket travels — never re-runs otherwise). close() is graceful: the queued
			// error frame is flushed first.
			ctx.socket.close();
			return;
		}

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
