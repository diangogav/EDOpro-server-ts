import {
	CHALLENGE_COMMAND,
	ChallengeRoom,
	isAdmittedToChallengeRoom,
} from "@shared/challenge/domain/ChallengeRoom";

import { JoinContext, JoinStrategy } from "./JoinStrategy";

/** Where a challenge code is resolved to the room it stands for. */
export interface ChallengeRooms {
	resolve(code: string): ChallengeRoom | null;
}

/**
 * ChallengeJoinStrategy — "ch#<code>", the join both players of an accepted
 * direct challenge receive.
 *
 * The code stands for a room the server stored when the challenge was
 * accepted: its full command and an internal password, which would not fit
 * the 19-character join field. The join is rewritten to that command and
 * password and handed to the first strategy of the rest of the chain that
 * matches it, so the room is found or opened exactly as if the player had
 * typed it (`speed` goes to the Speed Duel strategy, a ticketed socket to the
 * ticket strategy, anyone else to the default one).
 *
 * A ranked room only admits its two accounts. Unknown or expired codes, and
 * every code when no challenge rooms are wired, are refused with a JOINERROR
 * (thrown to the join handler).
 */
export class ChallengeJoinStrategy implements JoinStrategy {
	public constructor(
		private readonly rooms: ChallengeRooms | undefined,
		private readonly rest: readonly JoinStrategy[],
	) {}

	public matches(ctx: JoinContext): boolean {
		return ctx.command === CHALLENGE_COMMAND;
	}

	public async handle(ctx: JoinContext): Promise<void> {
		const room = this.rooms?.resolve(ctx.password) ?? null;
		if (!room) {
			throw new Error("challenge join refused: unknown or expired code");
		}
		if (!isAdmittedToChallengeRoom(room, ctx.socket.resolvedUserId)) {
			throw new Error("challenge join refused: not a player of this ranked room");
		}

		const rewritten: JoinContext = {
			...ctx,
			command: room.command,
			password: room.password,
			rawPass: `${room.command}#${room.password}`,
		};
		const next = this.rest.find((strategy) => strategy.matches(rewritten));
		if (!next) {
			throw new Error("challenge join refused: no strategy for the room command");
		}

		await next.handle(rewritten);
	}
}
