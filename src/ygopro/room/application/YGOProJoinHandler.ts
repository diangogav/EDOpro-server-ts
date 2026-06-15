import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { JoinMessageHandler } from "@shared/room/domain/JoinMessageHandler";
import { ISocket } from "@shared/socket/domain/ISocket";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { YGOProCtosJoinGame } from "ygopro-msg-encode";
import { MessageRepository } from "@shared/messages/MessageRepository";

import { JoinStrategyRegistry } from "./join-strategies/JoinStrategyRegistry";
import { JoinContext } from "./join-strategies/JoinStrategy";

export class YGOProJoinHandler implements JoinMessageHandler {
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly eventEmitter: EventEmitter;
	private readonly messageRepository: MessageRepository;
	private readonly registry: JoinStrategyRegistry;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: ISocket,
		messageRepository: MessageRepository,
		registry?: JoinStrategyRegistry,
	) {
		this.logger = logger.child({ file: "YGOProJoinHandler" });
		this.socket = socket;
		this.eventEmitter = eventEmitter;
		this.messageRepository = messageRepository;
		this.registry = registry ?? JoinStrategyRegistry.getInstance();
		this.eventEmitter.on(
			Commands.JOIN_GAME as unknown as string,
			(message: ClientMessage) => void this.handleJoinGame(message)
		);
	}

	async handleJoinGame(message: ClientMessage): Promise<void> {
		this.logger.info("JOIN_GAME");

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new YGOProCtosJoinGame().fromPayload(message.data);

		// NOTE: password is the single segment after the first "#", matching
		// YGOProRoom.create's own parsing. Do NOT join the rest with "#" — a room
		// password containing "#" must still compare equal in DefaultJoinStrategy.
		// AI/AIJOIN strategies read ctx.rawPass directly, so they are unaffected.
		const [command, password = ""] = joinMessage.pass.split("#");

		const ctx: JoinContext = {
			rawPass: joinMessage.pass,
			command,
			password,
			playerInfo: playerInfoMessage,
			socket: this.socket,
			socketId: this.socket.id as string,
			eventEmitter: this.eventEmitter,
			messageRepository: this.messageRepository,
			logger: this.logger,
			message,
		};

		const strategy = this.registry.resolve(ctx);
		await strategy.handle(ctx);
	}
}
