import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { findOrCreateRoom } from "./findOrCreateRoom";

/**
 * DefaultJoinStrategy — terminal fallback.
 *
 * Delegates find-or-create to findOrCreateRoom and routes the JOIN event;
 * it holds no room-matching logic of its own.
 *
 * This strategy always matches (terminal).
 */
export class DefaultJoinStrategy implements JoinStrategy {
	matches(_ctx: JoinContext): boolean {
		return true;
	}

	async handle(ctx: JoinContext): Promise<void> {
		// rankedOverride is left `undefined` (not `false`): RoomLeague.determine
		// treats undefined as "fall through to hasPin", so an anonymous join
		// carrying a PIN still resolves to the External league.
		const room = findOrCreateRoom(ctx, { rankedOverride: undefined });

		// Admission — ranked auth and league segregation — is decided inside the
		// room's WaitingState via AdmitToRoom. The strategy only routes the join.
		room.emit("JOIN", ctx.message, ctx.socket);
	}
}
