import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { EventEmitter } from "stream";

import { config } from "../../../config";
import { MercuryRoom } from "../../../mercury/room/domain/MercuryRoom";
import MercuryRoomList from "../../../mercury/room/infrastructure/MercuryRoomList";
import { Redis } from "../../../shared/db/redis/infrastructure/Redis";
import { Logger } from "../../../shared/logger/domain/Logger";
import { JoinMessageHandler } from "../../../shared/room/domain/JoinMessageHandler";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { CheckIfUseCanJoin } from "../../../shared/user-auth/application/CheckIfUserCanJoin";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "../../messages/server-to-client/ServerErrorMessageClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class JoinHandler implements JoinMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly checkIfUseCanJoin: CheckIfUseCanJoin;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: ISocket,
		checkIfUseCanJoin: CheckIfUseCanJoin
	) {
		this.eventEmitter = eventEmitter;
		this.logger = logger.child({ file: "JoinHandler" });
		this.socket = socket;
		this.checkIfUseCanJoin = checkIfUseCanJoin;
		this.eventEmitter.on(
			Commands.JOIN_GAME as unknown as string,
			(message: ClientMessage) => void this.handle(message)
		);
	}

	async handle(message: ClientMessage): Promise<void> {
		this.logger.info("handle");
		const joinMessage = new JoinGameMessage(message.data);
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		this.logger.info(
			`player: ${playerInfoMessage.name} trying to join to room: ${joinMessage.id} with room pass: ${joinMessage.password}`
		);
		const room = this.findRoom(joinMessage);

		if (!room) {
			this.socket.send(ServerErrorClientMessage.create("Room not found. Try reloading the list"));
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
			this.socket.destroy();

			return;
		}

		const redis = Redis.getInstance();
		const ip = this.socket.remoteAddress;
		const rateLimit = config.rateLimit.enabled && redis && ip;

		if (rateLimit) {
			const key = `rate-limit:join-room:${ip}:${room.id}`;
			const attempts = Number(await redis.get(key));

			if (attempts >= config.rateLimit.limit) {
				this.logger.info(
					`player: ${playerInfoMessage.name} with ip: ${ip} tried to join to room: ${room.id} and was already rate limited`
				);
				this.socket.send(
					ServerErrorClientMessage.create("Too many attempts. Please try again in a few minutes.")
				);
				this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
				this.socket.destroy();

				return;
			}
		}

		if (room.ranked) {
			if (!(await this.checkIfUseCanJoin.check(playerInfoMessage, this.socket))) {
				return;
			}
		}

		if (room.password !== joinMessage.password) {
			if (rateLimit) {
				const key = `rate-limit:join-room:${ip}:${room.id}`;
				const attempts = await redis.incr(key);

				if (attempts === 1) {
					await redis.expire(key, config.rateLimit.window);
				}
			}
			this.logger.info(
				`player: ${playerInfoMessage.name} tried to join to room: ${room.id} with wrong password: ${joinMessage.password}`
			);
			this.socket.send(ServerErrorClientMessage.create("Wrong password"));
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
			this.socket.destroy();

			return;
		}

		if (rateLimit) {
			const key = `rate-limit:join-room:${ip}:${room.id}`;
			await redis.del(key);
		}

		this.logger.info(
			`player: ${playerInfoMessage.name} joined to room: ${room.id} with password: ${joinMessage.password}`
		);
		room.emit("JOIN", message, this.socket);
	}

	private findRoom(joinMessage: JoinGameMessage): MercuryRoom | Room | null {
		const room = RoomList.getRooms().find((room) => room.id === joinMessage.id);
		if (room) {
			return room;
		}

		return MercuryRoomList.findById(joinMessage.id);
	}
}
