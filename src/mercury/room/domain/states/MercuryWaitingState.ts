/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { CardTypes } from "@edopro/card/domain/CardTypes";
import { UpdateDeckMessageParser } from "@edopro/deck/application/UpdateDeckMessageSizeCalculator";
import { BanListDeckError } from "@edopro/deck/domain/errors/BanListDeckError";
import { MainDeckLimitError } from "@edopro/deck/domain/errors/MainDeckLimitError";
import genesys from "genesys.json";
import { ErrorMessages } from "src/edopro/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "src/edopro/messages/server-to-client/ErrorClientMessage";
import { Team } from "src/shared/room/Team";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { YgoClient } from "../../../../shared/client/domain/YgoClient";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { JoinGameCoreToClientMessage } from "../../../messages/core-to-client/JoinGameCoreToClientMessage";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryWaitingState extends RoomState {
	private readonly genesysMap = new Map(genesys.map((item) => [item.code.toString(), item.points]));

	constructor(
		private readonly userAuth: UserAuth,
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
		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: YgoClient) =>
				void this.handleUpdateDeck.bind(this)(message, room, client as MercuryClient)
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
				const user = await this.userAuth.run(playerInfoMessage);
				if (!(user instanceof UserProfile)) {
					socket.send(user as Buffer);
					socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

					return;
				}
				const client = this.createPlayer({
					id: user.id,
					socket,
					messages,
					name: playerInfoMessage.name,
					room,
					host,
				});
				room.addClient(client);
			} else {
				const client = this.createPlayer({
					id: null,
					socket,
					messages,
					name: playerInfoMessage.name,
					room,
					host,
				});
				room.addClient(client);
			}
			if (!room.isCoreStarted) {
				room.startCore();
			}
			this.sendWelcomeMessage(room, socket);

			return;
		}

		const spectator = new MercuryClient({
			id: null,
			socket,
			logger: this.logger,
			messages,
			name: playerInfoMessage.name,
			position: room.playersCount,
			room,
			host: false,
		});

		room.addSpectator(spectator, false, true);
	}

	private tryStartHandler(_message: ClientMessage, room: MercuryRoom, _socket: ISocket): void {
		this.logger.info("MERCURY: TRY_START");
		room.createMatch();
		room.rps();
	}

	private handleTypeChange(message: ClientMessage, room: MercuryRoom, client: MercuryClient): void {
		this.logger.debug(`Mercury TYPE_CHANGE: ${message.data.toString("hex")}`);
		const value = parseInt(message.data.toString("hex"), 16);
		const position = value & 0x0f;
		const isHost = (position & 0x10) !== 0;

		if (position === 7 && room.clients.find((player) => player.socket.id === client.socket.id)) {
			room.removePlayer(client);
			client.setHost(isHost);
			client.playerPosition(position, Team.SPECTATOR);
			room.addSpectator(client, false, true);

			return;
		}

		if (position !== 7 && room.spectators.find((spectator) => spectator.name === client.name)) {
			room.removeSpectator(client);
			client.setHost(isHost);
			room.calculatePlayerTeam(client, position);
			room.addClient(client);

			return;
		}

		client.setHost(isHost);
		room.calculatePlayerTeam(client, position);
	}

	private handleJoinGame(message: ClientMessage, room: MercuryRoom, _client: MercuryClient): void {
		this.logger.debug("MERCURY: JOIN_GAME");
		const joinGameMessage = new JoinGameCoreToClientMessage(message.data);
		room.setBanListHash(joinGameMessage.banList);
		if (!room.joinBuffer) {
			room.setJoinBuffer(message.raw);
		}
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: MercuryRoom,
		client: MercuryClient
	): Promise<void> {
		this.logger.debug(`Mercury UPDATE_DECK: ${message.data.toString("hex")}`);
		if (!room.isGenesys) {
			return;
		}
		const parser = new UpdateDeckMessageParser(message.data);
		const [mainDeck, sideDeck] = parser.getDeck();
		const deck = [...mainDeck, ...sideDeck];
		let points = 0;
		for (const code of deck) {
			// eslint-disable-next-line no-await-in-loop
			const card = await room.cardRepository.findByCode(code.toString());
			if (!card) {
				this.logger.info(`Card with code ${code} not found`);
				continue;
			}

			if (card.type & (CardTypes.TYPE_PENDULUM | CardTypes.TYPE_LINK)) {
				client.sendMessageToClient(new BanListDeckError(Number(card.code)).buffer());
				break;
			}

			if (card.variant === 8) {
				client.sendMessageToClient(new BanListDeckError(Number(card.code)).buffer());
			}

			const cardPoints =
				this.genesysMap.get(card.code) ?? (card.alias ? this.genesysMap.get(card.alias) : 0) ?? 0;

			points = points + cardPoints;
		}

		if (points > room.hostInfo.maxDeckPoints) {
			this.sendSystemErrorMessage(
				`Deck points limit exceeded: ${points} of ${room.hostInfo.maxDeckPoints}`,
				client
			);
			client.sendMessageToClient(
				new MainDeckLimitError(points, 0, room.hostInfo.maxDeckPoints).buffer()
			);
			client.sendToCore(Buffer.from([0x01, 0x00, Commands.NOT_READY]));
		}
	}

	private createPlayer({
		id,
		socket,
		messages,
		name,
		room,
		host,
	}: {
		id: string | null;
		socket: ISocket;
		messages: Buffer[];
		name: string;
		room: MercuryRoom;
		host: boolean;
	}): MercuryClient {
		return new MercuryClient({
			id,
			socket,
			logger: this.logger,
			messages,
			name,
			position: room.playersCount,
			room,
			host,
		});
	}
}
