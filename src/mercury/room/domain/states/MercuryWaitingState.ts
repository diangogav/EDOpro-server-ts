/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { EventEmitter } from "stream";

import { JoinGameMessage } from "../../../../modules/messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { VersionErrorClientMessage } from "../../../../modules/messages/server-to-client/VersionErrorClientMessage";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { YgoClient } from "../../../../modules/shared/client/domain/YgoClient";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { ISocket } from "../../../../modules/shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { mercuryConfig } from "../../../config";
import { PlayerEnterMessage } from "../../../messages/core-to-client/PlayerEnterCoreToClientMessage";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryWaitingState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handle.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			Commands.TRY_START as unknown as string,
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.tryStartHandler.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			"HS_PLAYER_CHANGE" as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: YgoClient) =>
				void this.handlePlayerChange.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			"HS_PLAYER_ENTER" as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: YgoClient) =>
				void this.handlePlayerEnter.bind(this)(message, room, client)
		);
	}

	private handle(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
		const joinMessage = new JoinGameMessage(message.data);

		if (joinMessage.version2 !== mercuryConfig.version) {
			socket.send(VersionErrorClientMessage.create(mercuryConfig.version));

			return;
		}
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const messages = [message.previousRawMessage, message.raw];
		const client = new MercuryClient({
			socket,
			logger: this.logger,
			messages,
			name: playerInfoMessage.name,
			position: room.playersCount,
			room,
		});
		room.addClient(client);
	}

	private tryStartHandler(_message: ClientMessage, room: MercuryRoom, _socket: ISocket): void {
		this.logger.info("MERCURY: TRY_START");
		room.rps();
	}

	private handlePlayerChange(
		message: ClientMessage,
		room: MercuryRoom,
		client: MercuryClient
	): void {
		this.logger.debug("Mercury HS_PLAYER_CHANGE");
		const status = parseInt(message.data.toString("hex"), 16);
		const previousPosition = (status >> 4) & 0x0f;
		const newPosition = status & 0x0f;
		this.logger.debug(`status: ${status}`);
		this.logger.debug(`from: ${previousPosition}`);
		this.logger.debug(`to: ${newPosition}`);
		client.playerPosition(newPosition);

		if (newPosition === 8) {
			room.removePlayer(client);
			room.addSpectator(client);

			return;
		}

		if (previousPosition === 8 && newPosition !== 8) {
			room.removeSpectator(client);
			room.addSpectator(client);

			return;
		}
	}

	private handlePlayerEnter(
		message: ClientMessage,
		_room: MercuryRoom,
		client: MercuryClient
	): void {
		this.logger.debug("Mercury HS_PLAYER_ENTER");
		this.logger.debug(`Mercury HS_PLAYER_ENTER MESSAGE: ${message.data.toString("hex")}`);
		const playerEnterMessage = new PlayerEnterMessage(message.data);
		if (playerEnterMessage.name === "Evolution") {
			return;
		}
		client.playerPosition(playerEnterMessage.position);
	}
}
