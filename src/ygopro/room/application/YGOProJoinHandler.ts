import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { JoinMessageHandler } from "@shared/room/domain/JoinMessageHandler";
import { ISocket } from "@shared/socket/domain/ISocket";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { ErrorMessageType, YGOProCtosJoinGame } from "ygopro-msg-encode";
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
			(message: ClientMessage) => void this.handleJoinGame(message),
		);
	}

	async handleJoinGame(message: ClientMessage): Promise<void> {
		this.logger.info("JOIN_GAME");

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new YGOProCtosJoinGame().fromPayload(message.data);

		// NOTE: password is the single segment after the first "#", matching
		// YGOProRoom.create's own parsing (`command.split("#")` there too — same
		// two-segment destructure, same truncation). Do NOT join the rest with
		// "#": a room password that itself contains "#" is silently truncated at
		// the FIRST "#" on BOTH sides — the host's password is truncated the same
		// way at room-creation time (YGOProRoom.create), and a joiner's password
		// is truncated here. Whatever comes after the second "#" is simply
		// dropped, on both ends, every time. This keeps
		// YGOProRoomList.findByNameAndPassword's strict `===` password
		// comparison consistent (both sides truncate identically), but it does
		// mean a full pass string like "room#pa#ss" is
		// effectively "room#pa": the room password becomes "pa", the "#ss" tail
		// vanishes, and anyone sending "room#pa" gets in — a "#" inside a room
		// password silently weakens it. Documented in docs/join-commands.md, not
		// fixed here: joining the tail back would have to change host and joiner
		// parsing simultaneously and would lock out rooms alive during a rollout.
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
		try {
			await strategy.handle(ctx);
		} catch (error) {
			this.logger.error(`JOIN_GAME rejected: ${error instanceof Error ? error.message : error}`);
			const errorBuf = this.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0);
			this.socket.send(errorBuf);
			// close() (not destroy()): flush the JOINERROR frame before tearing down,
			// consistent with the other join error paths.
			this.socket.close();
		}
	}
}
