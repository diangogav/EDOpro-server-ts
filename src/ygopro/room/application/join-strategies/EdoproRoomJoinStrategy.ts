import { ChatColor, ErrorMessageType } from "ygopro-msg-encode";

import {
	ForeignRoomEntry,
	ForeignRoomEntryResult,
} from "@shared/room/application/ForeignRoomEntry";
import { createSystemChat } from "@shared/room/domain/chat/SystemChat";

import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { bridgeToEdoproRoom } from "../../../edopro-bridge/BridgedSocket";

const REJECTIONS: Record<Exclude<ForeignRoomEntryResult, "joined">, string> = {
	"not-found": "Room not found — refresh the room list.",
	"wrong-password": "Wrong password.",
	"login-required": "This is a ranked room. Log in to join it.",
	unsupported: "This room cannot be joined from this client.",
};

const CLIENT_NOT_READY = "This client cannot join rooms hosted from EDOPro.";

/**
 * EdoproRoomJoinStrategy — join an existing EDOPro room by id: "edo,<roomId>[#password]".
 *
 * The command segment must be exactly "edo" (trimmed, case-insensitive) and an
 * all-digit room id; any other shape falls through to the rest of the chain.
 * Like a watch join it never creates a room: an unknown id, a wrong password
 * or a room this client cannot play in is an explicit reject.
 *
 * Only the clients named in `allowedClients` are let in, by the name they
 * declare on the handshake. The server translates the wire for any client,
 * but the room plays EDOPro's cards and rulings, and a client has to be built
 * to tell its player so.
 *
 * On success the EDOPro room takes over the socket. It reads and writes the
 * EDOPro wire format; the socket it is handed translates both ways, so the
 * client keeps speaking YGOPro.
 */
export class EdoproRoomJoinStrategy implements JoinStrategy {
	constructor(
		private readonly edoproRooms: ForeignRoomEntry,
		private readonly allowedClients: ReadonlySet<string>,
	) {}

	public matches(ctx: JoinContext): boolean {
		return EdoproRoomJoinStrategy.parseRoomId(ctx.command) !== null;
	}

	public async handle(ctx: JoinContext): Promise<void> {
		const roomId = EdoproRoomJoinStrategy.parseRoomId(ctx.command);
		if (roomId === null) {
			throw new Error("EdoproRoomJoinStrategy.handle called for a non-EDOPro command");
		}

		if (!this.allowedClients.has((ctx.socket.clientName ?? "").toLowerCase())) {
			this.reject(ctx, CLIENT_NOT_READY);

			return;
		}

		const result = this.edoproRooms.enter({
			roomId,
			password: ctx.password,
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

	private static parseRoomId(command: string): number | null {
		const tokens = command.split(",").map((token) => token.trim());
		if (tokens.length !== 2 || tokens[0].toLowerCase() !== "edo" || !/^\d+$/.test(tokens[1])) {
			return null;
		}

		return Number(tokens[1]);
	}
}
