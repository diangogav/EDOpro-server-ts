import { generateUniqueId } from "src/utils/generateUniqueId";

import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/**
 * TicketJoinStrategy — handles joins from sockets that were authenticated
 * via a single-use WS handshake ticket (socket.resolvedUserId is set).
 *
 * When this strategy matches:
 * - The room is created with rankedOverride=true, so it is always ranked
 *   regardless of whether a game password is present in the command.
 * - checkIfUserCanJoin is intentionally skipped: the ban-check happens
 *   later inside RankedUserResolver (injected in YGOProWaitingState).
 * - JOIN is emitted directly.
 */
export class TicketJoinStrategy implements JoinStrategy {
	matches(ctx: JoinContext): boolean {
		return Boolean(ctx.socket.resolvedUserId);
	}

	async handle(ctx: JoinContext): Promise<void> {
		const room = this._findOrCreateRankedRoom(ctx);
		room.emit("JOIN", ctx.message, ctx.socket);
	}

	private _findOrCreateRankedRoom(ctx: JoinContext): YGOProRoom {
		const existingRoom = YGOProRoomList.findByName(ctx.command);
		if (existingRoom) {
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
			true, // rankedOverride — ticket users always join ranked rooms
		);
		YGOProRoomList.addRoom(room);
		room.waiting();

		return room;
	}
}
