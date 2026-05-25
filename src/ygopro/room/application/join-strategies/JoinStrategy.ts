import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Logger } from "@shared/logger/domain/Logger";
import { MessageRepository } from "@shared/messages/MessageRepository";
import { CheckIfUseCanJoin } from "@shared/user-auth/application/CheckIfUserCanJoin";

/**
 * Everything handleJoinGame has available at the point it dispatches.
 * Strategies must not invent fields that don't come from the actual handler params.
 */
export interface JoinContext {
	/** The raw password field from the join message (e.g. "ROOMNAME#pass", "AI#Anna", "AIJOIN#token") */
	rawPass: string;
	/** First segment of rawPass.split("#") — the room name / command */
	command: string;
	/** Second segment of rawPass.split("#") — the password / bot name / token (or "") */
	password: string;
	/** Parsed from the join message's preceding PlayerInfo data */
	playerInfo: PlayerInfoMessage;
	/** The connecting socket */
	socket: ISocket;
	/** socket.id cast to string */
	socketId: string;
	/** Per-connection event emitter shared with the room state machine */
	eventEmitter: EventEmitter;
	/** Wire-format message builder */
	messageRepository: MessageRepository;
	/** Logger (child already attached in the handler) */
	logger: Logger;
	/** Rank check dependency (passed through for ranked rooms) */
	checkIfUserCanJoin: CheckIfUseCanJoin;
	/** The original ClientMessage — needed to emit the JOIN event to the room state machine */
	message: ClientMessage;
}

/**
 * Strategy interface for join dispatch.
 * Strategies are stateless and constructed once at module load.
 */
export interface JoinStrategy {
	/**
	 * Returns true if this strategy should handle the given join context.
	 * Called in priority order; first truthy result wins.
	 */
	matches(ctx: JoinContext): boolean;

	/**
	 * Performs the join operation. Returns a promise that resolves when done.
	 * On error, the strategy is responsible for sending the error to the socket.
	 */
	handle(ctx: JoinContext): Promise<void>;
}
