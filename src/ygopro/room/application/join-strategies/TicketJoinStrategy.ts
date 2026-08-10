import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { findOrCreateRoom } from "./findOrCreateRoom";

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
 *
 * The ticket only replaces the username:password LOGIN credential — it does
 * NOT bypass the per-room password (the "command#password" room key). Room
 * identity is the exact (name, password) pair (see findOrCreateRoom /
 * YGOProRoomList.findByNameAndPassword), so a mismatched key never reaches an
 * existing room — it identifies a DIFFERENT room outright, exactly like
 * DefaultJoinStrategy. This is what keeps private rooms private: the
 * (name, password) pair never matches without the correct password.
 */
export class TicketJoinStrategy implements JoinStrategy {
	matches(ctx: JoinContext): boolean {
		return Boolean(ctx.socket.resolvedUserId);
	}

	async handle(ctx: JoinContext): Promise<void> {
		// rankedOverride: true — ticket users always join ranked rooms.
		const room = findOrCreateRoom(ctx, { rankedOverride: true });
		room.emit("JOIN", ctx.message, ctx.socket);
	}
}
