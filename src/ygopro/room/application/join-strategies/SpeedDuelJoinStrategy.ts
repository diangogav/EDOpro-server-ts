import { ChatColor, ErrorMessageType } from "ygopro-msg-encode";

import {
	ForeignSpeedDuelEntryResult,
	ForeignSpeedDuelRooms,
} from "@shared/room/application/ForeignSpeedDuelRooms";
import { createSystemChat } from "@shared/room/domain/chat/SystemChat";

import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { bridgeToEdoproRoom } from "../../../edopro-bridge/BridgedSocket";

const SPEED_TOKEN = "speed";
const MATCH_TOKENS: ReadonlySet<string> = new Set(["m", "match"]);

const NOT_AVAILABLE = "Speed Duel rooms are not available on this server.";
const CLIENT_NOT_READY = "This client cannot play Speed Duels on this server.";
const REJECTIONS: Record<Exclude<ForeignSpeedDuelEntryResult, "joined">, string> = {
	unavailable: NOT_AVAILABLE,
	"not-found": "The Speed Duel room closed before you got in. Try again.",
	"wrong-password": "Wrong password.",
	"login-required": "Log in to join this room.",
	unsupported: "This room cannot be joined from this client.",
};

/**
 * SpeedDuelJoinStrategy — a Speed Duel room: any command with the `speed`
 * token, e.g. "speed", "m,speed,casual#password".
 *
 * A Speed Duel is played on the EDOPro core, which is the one that knows
 * Skill Cards and the three-column field, so this flow never opens the room
 * itself: it asks the EDOPro flow to seat the joiner in the waiting room of
 * that name and password, or to open one, and hands it a socket that
 * translates the wire, as an "edo,<id>" join does.
 *
 * The room's name is the command exactly as sent, like any room of this
 * flow, and the password is the segment after "#". `m` or `match` asks for a
 * best of 3. Every other token is ignored: the format fixes LP, hand, draw,
 * deck sizes and the ban list, the room is 1v1 and never ranked, and it has
 * no AI opponent.
 *
 * Only the clients named in `allowedClients` are let in, for the reason an
 * "edo,<id>" join gives: the room plays EDOPro's cards and rulings.
 *
 * It heads the chain and is always in it. The command must never fall
 * through to a strategy that would open a YGOPro room named after it, so
 * without the EDOPro flow (`rooms` undefined) it is refused here.
 */
export class SpeedDuelJoinStrategy implements JoinStrategy {
	constructor(
		private readonly rooms: ForeignSpeedDuelRooms | undefined,
		private readonly allowedClients: ReadonlySet<string>,
	) {}

	public matches(ctx: JoinContext): boolean {
		return SpeedDuelJoinStrategy.tokens(ctx.command).includes(SPEED_TOKEN);
	}

	public async handle(ctx: JoinContext): Promise<void> {
		if (!this.rooms) {
			this.reject(ctx, NOT_AVAILABLE);

			return;
		}
		if (!this.allowedClients.has((ctx.socket.clientName ?? "").toLowerCase())) {
			this.reject(ctx, CLIENT_NOT_READY);

			return;
		}

		const isMatch = SpeedDuelJoinStrategy.tokens(ctx.command).some((token) =>
			MATCH_TOKENS.has(token),
		);
		const result = this.rooms.enter({
			name: ctx.command,
			password: ctx.password,
			bestOf: isMatch ? 3 : 1,
			message: ctx.message,
			socket: bridgeToEdoproRoom(ctx.socket),
		});
		if (result === "joined") {
			return;
		}

		this.reject(ctx, REJECTIONS[result]);
	}

	/** Red chat explaining why, the JOINERROR, then a close that lets both frames flush. */
	private reject(ctx: JoinContext, reason: string): void {
		ctx.socket.send(createSystemChat(ChatColor.RED, reason));
		ctx.socket.send(ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0));
		ctx.socket.close();
	}

	private static tokens(command: string): string[] {
		return command.split(",").map((token) => token.trim().toLowerCase());
	}
}
