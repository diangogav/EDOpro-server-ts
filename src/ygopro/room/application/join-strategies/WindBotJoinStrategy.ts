import { generateUniqueId } from "src/utils/generateUniqueId";

import { ErrorMessageType } from "ygopro-msg-encode";

import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/**
 * WindBotJoinStrategy — handles blank / AI / AI#name join passwords.
 *
 * Matches only when WindbotModule is enabled (REQ-JOIN-102: falls through to
 * DefaultJoinStrategy when ENABLE_WINDBOT=false, so AI/blank become normal room names).
 *
 * REQ-JOIN-103 / REQ-ROOM-502: rejects tag-mode rooms BEFORE any room or token is created.
 * REQ-ROOM-501: sets windbot, noHost, noReconnect flags on the created room.
 * REQ-HTTP-402/403: fires requestBot as fire-and-forget; on failure destroys room + notifies human.
 */
export class WindBotJoinStrategy implements JoinStrategy {
	constructor(private readonly module: WindbotModule) {}

	matches(ctx: JoinContext): boolean {
		if (!this.module.isEnabled()) {
			return false;
		}

		const pass = ctx.rawPass;
		return pass === "" || pass === "AI" || pass.startsWith("AI#");
	}

	async handle(ctx: JoinContext): Promise<void> {
		// Determine bot name from password
		// "AI#Anna" → botName = "Anna", "AI" or "" → botName = null (random)
		const botNameOrNull = ctx.rawPass.startsWith("AI#")
			? ctx.rawPass.slice(3)
			: null;

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

		// REQ-JOIN-103 / REQ-ROOM-502: reject tag-mode BEFORE adding to list or issuing token
		if (room.isTag) {
			const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
			ctx.socket.send(errorBuf);
			ctx.socket.destroy();
			// Room was NOT added to the list — no cleanup needed
			return;
		}

		// Set windbot flags (REQ-ROOM-501)
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
		// REQ-HTTP-402: pass () => room.finalizing so the retry loop aborts
		// as soon as the room begins teardown (e.g. triggered by a concurrent failure).
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
				// REQ-HTTP-403: on trigger failure, destroy room + notify human
				YGOProRoomList.deleteRoom(room);

				const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
				ctx.socket.send(errorBuf);
				ctx.socket.destroy();
			});
	}
}
