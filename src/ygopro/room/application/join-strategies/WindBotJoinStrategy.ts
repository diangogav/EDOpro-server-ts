import { generateUnusedRoomId } from "../generateUnusedRoomId";

import { ErrorMessageType } from "ygopro-msg-encode";

import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { resolveBotPool } from "../../../windbot/domain/resolveBotPool";
import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";
import { FinalizeYGOProRoom } from "../FinalizeYGOProRoom";

/**
 * WindBotJoinStrategy — handles AI / AI#name join passwords (explicit "ai" token).
 *
 * A blank password is NOT an AI request — it falls through to the default chain
 * and creates a normal room. Only an explicit "ai" token (any position,
 * case-insensitive) routes here.
 *
 * Matches only when WindbotModule is enabled (falls through to DefaultJoinStrategy
 * when ENABLE_WINDBOT=false, so AI becomes a normal room name).
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

		const tokens = WindBotJoinStrategy._extractTokens(ctx.rawPass);
		return tokens.includes("ai");
	}

	/**
	 * Extract config segment (everything before the first "#"), split by
	 * comma, trim and lowercase. Shared by matches() (checks for the "ai"
	 * token) and handle() (resolves the format-scoped random pool from the
	 * same tokens via resolveBotPool).
	 *
	 * This is ORDER-INDEPENDENT and CASE-INSENSITIVE.
	 * Examples: "AI#Anna", "ai,jtp#Joey", "nc,ns,ai#joey", "jtp,ai", "ai"
	 */
	private static _extractTokens(rawPass: string): string[] {
		const configSegment = rawPass.split("#")[0];
		return configSegment.split(",").map((t) => t.trim().toLowerCase());
	}

	async handle(ctx: JoinContext): Promise<void> {
		// Determine bot name from the segment AFTER the first "#"
		// ctx.password is rawPass.split("#")[1] ?? "" (set by YGOProJoinHandler)
		// "ai,jtp#Joey" → botName = "Joey"
		// "nc,ns,ai#joey" → botName = "joey"
		// "ai" / "nc,ai" (no "#") → botName = null (random)
		const botNameOrNull = ctx.password !== "" ? ctx.password : null;

		// Resolve the format-scoped random pool from the SAME config tokens
		// matches() used (e.g. "ed,ai" → "edison", "pre,ai" → "tcg"). Only
		// consulted by requestBot when botNameOrNull is null (random selection).
		const pool = resolveBotPool(WindBotJoinStrategy._extractTokens(ctx.rawPass)) ?? undefined;

		// Create the room through the SAME path as the default flow
		const room = YGOProRoom.create(
			generateUnusedRoomId(),
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
			// close() (not destroy()): graceful close flushes the queued JOINERROR frame
			// to the human before tearing the socket down. destroy()/terminate() is abrupt
			// and can drop it. (destroy() stays only for message-less rejects.)
			ctx.socket.close();
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
		this._requestBotFireAndForget(room, botNameOrNull, ctx, pool);
	}

	private _requestBotFireAndForget(
		room: YGOProRoom,
		botNameOrNull: string | null,
		ctx: JoinContext,
		pool: string | undefined,
	): void {
		this.module
			.requestBot(room.id, botNameOrNull, () => room.finalizing, undefined, pool)
			.then(({ bot }) => {
				// Set windbot data on the room now that we know the bot
				room.windbot = { name: bot.name, deck: bot.deck };
			})
			.catch(() => {
				// Deliver the JOINERROR to the human BEFORE tearing the room down.
				// FinalizeYGOProRoom.run() below destroys every seated client's
				// socket, including the human's (seated by the earlier JOIN emit) —
				// running it first would turn the subsequent send() into a silent
				// no-op (WS) or ERR_STREAM_DESTROYED (TCP), leaving the human with a
				// bare disconnect and no error frame.
				const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
				ctx.socket.send(errorBuf);
				// close() flushes the JOINERROR to the human before tearing down.
				ctx.socket.close();

				// Tear the room down through the canonical path (finalizing flag,
				// windbot cleanup, reconnection-token revocation, list removal,
				// REMOVE-ROOM broadcast) — a bare deleteRoom() would leak the
				// human's reconnection token into the no-TTL TokenIndex. run() is
				// idempotent (finalizing guard) and skips clients whose socket is
				// already closed, so calling it AFTER the send/close above is safe.
				FinalizeYGOProRoom.run(room);
			});
	}
}
