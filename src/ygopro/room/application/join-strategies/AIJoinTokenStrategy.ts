import { ErrorMessageType } from "ygopro-msg-encode";

import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { YGOProClient } from "../../../client/domain/YGOProClient";
import { JoinContext, JoinStrategy } from "./JoinStrategy";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

/**
 * AIJoinTokenStrategy — priority 1 strategy that handles reverse-connecting bot clients.
 *
 * Matches password prefix "AIJOIN#" when WindbotModule is enabled.
 * MUST be first in the chain because the bot connecting back must never be misrouted.
 *
 * REQ-TOKEN-205: invalid/missing token → reject without creating a room, no fall-through.
 * REQ-CLIENT-601: sets client.isInternal = true via markInternal() after join.
 *
 * Design note: We emit JOIN through the normal room event system so that
 * WaitingState.handleJoin runs and adds the bot to the correct slot. handleJoin
 * performs the player creation inside `room.mutex.runExclusive(...)`. async-mutex
 * is FIFO, so by queuing our own empty critical section on the SAME mutex AFTER
 * emitting, we are guaranteed to run only once the join's section has completed —
 * no timing guesswork. We then locate the bot client by socket identity (not by
 * "last added") and mark it internal.
 */
export class AIJoinTokenStrategy implements JoinStrategy {
	constructor(private readonly module: WindbotModule) {}

	matches(ctx: JoinContext): boolean {
		if (!this.module.isEnabled()) {
			return false;
		}
		return ctx.rawPass.startsWith("AIJOIN#");
	}

	async handle(ctx: JoinContext): Promise<void> {
		// Extract the token after "AIJOIN#"
		const token = ctx.rawPass.slice("AIJOIN#".length);

		// Consume the token — throws on miss (locked contract from PR-1/PR-3b)
		let payload: { roomId: number; botName: string; deck: string };
		try {
			payload = this.module.consumeToken(token);
		} catch {
			// REQ-TOKEN-205: invalid / expired / already-consumed token → reject, no new room
			const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
			ctx.socket.send(errorBuf);
			ctx.socket.destroy();
			return;
		}

		// Find the room the human created
		const room = YGOProRoomList.findById(payload.roomId);
		if (!room) {
			// Room disappeared (e.g. was destroyed during HTTP retry failure) — reject cleanly
			const errorBuf = ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
			ctx.socket.send(errorBuf);
			ctx.socket.destroy();
			return;
		}

		// Emit JOIN for the bot client — the waiting state will call createPlayerUnsafe + addPlayerUnsafe
		// (or createSpectatorUnsafe if slots are full, but for a windbot room there should be a free slot).
		// handleJoin queues the player creation on room.mutex.
		room.emit("JOIN", ctx.message, ctx.socket);

		// Queue an empty critical section on the SAME mutex. async-mutex is FIFO, so this
		// runs only AFTER handleJoin's player-creation section completes — deterministic,
		// no microtask-timing guesswork. Then mark the bot client (matched by socket) internal.
		await room.mutex.runExclusive(() => {
			const botClient = room.clients.find((client) => client.socket === ctx.socket);
			if (botClient) {
				(botClient as YGOProClient).markInternal();
			}
		});
	}
}
