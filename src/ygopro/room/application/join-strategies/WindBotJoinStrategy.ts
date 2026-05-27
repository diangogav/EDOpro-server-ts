import { generateUniqueId } from "src/utils/generateUniqueId";

import { ErrorMessageType } from "ygopro-msg-encode";

import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/**
 * WindBotJoinStrategy — handles blank / AI / AI#name join passwords.
 *
 * Matches only when WindbotModule is enabled (falls through to DefaultJoinStrategy
 * when ENABLE_WINDBOT=false, so AI/blank become normal room names).
 *
 * Rejects tag-mode rooms BEFORE any room or token is created.
 * Sets windbot, noHost, noReconnect flags on the created room.
 * Fires requestBot as fire-and-forget; on failure destroys room + notifies human.
 */
export class WindBotJoinStrategy implements JoinStrategy {
	constructor(private readonly module: WindbotModule) {}

	matches(ctx: JoinContext): boolean {
		if (!this.module.isEnabled()) {
			return false;
		}

		// Blank password routes to windbot when enabled
		if (ctx.rawPass === "") {
			return true;
		}

		// Extract config segment (everything before the first "#"), split by comma,
		// trim and lowercase — check if "ai" is among the tokens.
		// This is ORDER-INDEPENDENT and CASE-INSENSITIVE.
		// Examples: "AI#Anna", "ai,jtp#Joey", "nc,ns,ai#joey", "jtp,ai", "ai"
		const configSegment = ctx.rawPass.split("#")[0];
		const tokens = configSegment.split(",").map((t) => t.trim().toLowerCase());
		return tokens.includes("ai");
	}

	async handle(ctx: JoinContext): Promise<void> {
		// Determine bot name from the segment AFTER the first "#"
		// ctx.password is rawPass.split("#")[1] ?? "" (set by YGOProJoinHandler)
		// "ai,jtp#Joey" → botName = "Joey"
		// "nc,ns,ai#joey" → botName = "joey"
		// "ai" / "nc,ai" (no "#") → botName = null (random)
		// blank → null (random)
		const botNameOrNull = ctx.password !== "" ? ctx.password : null;

		// Create the room through the SAME path as the default flow
		const room = YGOProRoom.create(
			generateUniqueId(),
			ctx.rawPass,
			ctx.logger,
			ctx.eventEmitter,
			ctx.playerInfo,
			ctx.socketId,
			ctx.messageRepository,
		);

		// Reject tag-mode BEFORE adding to list or issuing token
		if (room.isTag) {
			const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
			ctx.socket.send(errorBuf);
			ctx.socket.destroy();
			// Room was NOT added to the list — no cleanup needed
			return;
		}

		// The actual windbot data (name/deck) will be filled once requestBot resolves below.
		// For now set a placeholder — we overwrite after bot is resolved.
		room.noHost = true;
		room.noReconnect = true;

		// Add room and activate waiting state (same as default flow)
		YGOProRoomList.addRoom(room);
		room.waiting();

		// Emit JOIN for the human client (enters team 0)
		room.emit("JOIN", ctx.message, ctx.socket);

		// Fire-and-forget: request bot — handle failure internally.
		// Pass () => room.finalizing so the retry loop aborts as soon as the room
		// begins teardown (e.g. triggered by a concurrent failure).
		this._requestBotFireAndForget(room, botNameOrNull, ctx);
	}

	private _requestBotFireAndForget(
		room: YGOProRoom,
		botNameOrNull: string | null,
		ctx: JoinContext,
	): void {
		this.module
			.requestBot(room.id, botNameOrNull, () => room.finalizing)
			.then(({ bot }) => {
				// Set windbot data on the room now that we know the bot
				room.windbot = { name: bot.name, deck: bot.deck };
			})
			.catch(() => {
				// On trigger failure, destroy room + notify human
				YGOProRoomList.deleteRoom(room);

				const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
				ctx.socket.send(errorBuf);
				ctx.socket.destroy();
			});
	}
}
