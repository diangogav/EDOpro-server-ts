/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ErrorMessages } from "@modules/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "@modules/messages/server-to-client/ErrorClientMessage";
import { Rank } from "@modules/shared/value-objects/Rank";
import { UserFinder } from "@modules/user/application/UserFinder";
import { User } from "@modules/user/domain/User";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { YgoClient } from "../../../../modules/shared/client/domain/YgoClient";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { ISocket } from "../../../../modules/shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { JoinGameCoreToClientMessage } from "../../../messages/core-to-client/JoinGameCoreToClientMessage";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryWaitingState extends RoomState {
	constructor(
		private readonly userFinder: UserFinder,
		eventEmitter: EventEmitter,
		private readonly logger: Logger
	) {
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
			"JOIN_GAME" as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: YgoClient) =>
				void this.handleJoinGame.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			"TYPE_CHANGE" as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: YgoClient) =>
				void this.handleTypeChange.bind(this)(message, room, client)
		);
	}

	private async handle(message: ClientMessage, room: MercuryRoom, socket: ISocket): Promise<void> {
		this.validateVersion(message.data, socket);
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		if (this.playerAlreadyInRoom(playerInfoMessage, room, socket)) {
			this.sendExistingPlayerErrorMessage(playerInfoMessage, socket);

			return;
		}

		const messages = [message.previousRawMessage, message.raw];

		if (!room.isPlayersFull) {
			const host = room.clients.length === 0;

			if (room.ranked) {
				const user = await this.userFinder.run(playerInfoMessage);
				if (!(user instanceof User)) {
					socket.send(user as Buffer);
					socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

					return;
				}
				const client = this.createPlayer({
					socket,
					messages,
					name: playerInfoMessage.name,
					room,
					host,
					ranks: user.ranks,
				});
				room.addClient(client);
			} else {
				const client = this.createPlayer({
					socket,
					messages,
					name: playerInfoMessage.name,
					room,
					host,
					ranks: [],
				});
				room.addClient(client);
			}
			if (!room.isCoreStarted) {
				room.startCore();
			}
			this.sendInfoMessage(room, socket);

			return;
		}

		const spectator = new MercuryClient({
			socket,
			logger: this.logger,
			messages,
			name: playerInfoMessage.name,
			position: room.playersCount,
			room,
			host: false,
			ranks: [],
		});

		room.addSpectator(spectator, false);
	}

	private tryStartHandler(_message: ClientMessage, room: MercuryRoom, _socket: ISocket): void {
		this.logger.info("MERCURY: TRY_START");
		room.createMatch();
		room.rps();
	}

	private handleTypeChange(message: ClientMessage, room: MercuryRoom, client: MercuryClient): void {
		this.logger.debug(`Mercury TYPE_CHANGE: ${message.data.toString("hex")}`);
		const value = parseInt(message.data.toString("hex"), 16);
		const type = value & 0x0f;
		const isHost = (type & 0x10) !== 0;

		if (type === 7 && room.clients.find((player) => player.socket.id === client.socket.id)) {
			room.removePlayer(client);
			client.setHost(isHost);

			room.addSpectator(client, true);

			return;
		}

		if (type !== 7 && room.spectators.find((spectator) => spectator.name === client.name)) {
			room.removeSpectator(client);
			client.setHost(isHost);
			room.addClient(client);

			return;
		}

		client.setHost(isHost);
		room.calculatePlayerTeam(client, type);
	}

	private handleJoinGame(message: ClientMessage, room: MercuryRoom, _client: MercuryClient): void {
		this.logger.debug("MERCURY: JOIN_GAME");
		const joinGameMessage = new JoinGameCoreToClientMessage(message.data);
		room.setBanListHash(joinGameMessage.banList);
		if (!room.joinBuffer) {
			room.setJoinBuffer(message.raw);
		}
	}

	private createPlayer({
		socket,
		messages,
		name,
		room,
		host,
		ranks,
	}: {
		socket: ISocket;
		messages: Buffer[];
		name: string;
		room: MercuryRoom;
		host: boolean;
		ranks: Rank[];
	}): MercuryClient {
		return new MercuryClient({
			socket,
			logger: this.logger,
			messages,
			name,
			position: room.playersCount,
			room,
			host,
			ranks,
		});
	}
}
