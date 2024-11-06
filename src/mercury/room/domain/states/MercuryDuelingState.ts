/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { EventEmitter } from "events";
import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";
import { container } from "src/shared/dependency-injection";
import { EventBus } from "src/shared/event-bus/EventBus";
import { GameOverDomainEvent } from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelState } from "../../../../shared/room/domain/YgoRoom";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryReconnect } from "../../application/MercuryReconnect";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryDuelingState extends RoomState {
	private readonly eventBus: EventBus;

	constructor(
		private readonly room: MercuryRoom,
		eventEmitter: EventEmitter,
		private readonly logger: Logger
	) {
		super(eventEmitter);
		this.handle();
		this.eventBus = container.get(EventBus);
		this.eventEmitter.on(
			"DUEL_END",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handleDuelEnd.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			"GAME_MSG",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleGameMessage.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			"FIELD_FINISH",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleFieldFinish.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			"TIME_LIMIT",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleTimeLimit.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			"CHANGE_SIDE",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleChangeSide.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleUpdateDeck.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.TIME_CONFIRM as unknown as string,
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleTimeConfirm.bind(this)(message, room, socket)
		);
	}

	private handle(): void {
		this.notifyDuelStart(this.room);
	}

	private handleDuelEnd(_message: ClientMessage, _room: MercuryRoom, _player: MercuryClient): void {
		this.logger.info("MERCURY: DUEL_END");
	}

	private handleJoin(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
		this.logger.info("MERCURY: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const playerAlreadyInRoom = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(playerAlreadyInRoom instanceof MercuryClient)) {
			const spectator = new MercuryClient({
				socket,
				logger: this.logger,
				messages: [],
				name: playerInfoMessage.name,
				position: room.playersCount,
				room,
				host: false,
				ranks: [],
			});
			room.addSpectator(spectator, true);

			return;
		}

		MercuryReconnect.run(playerAlreadyInRoom, room, socket);
	}

	private handleGameMessage(
		message: ClientMessage,
		room: MercuryRoom,
		player: MercuryClient
	): void {
		this.logger.info(`MERCURY: GAME_MSG: ${message.raw.toString("hex")}`);
		if (player.isReconnecting) {
			return;
		}
		const coreMessageType = message.raw.readInt8(3);

		if (coreMessageType !== 1) {
			this.logger.debug(`last message ${player.name} ${message.raw.toString("hex")}`);
			player.setLastMessage(message.raw);
		}

		this.processDuelMessage(coreMessageType, message.raw, room);

		if (coreMessageType === CoreMessages.MSG_WIN && !room.isMatchFinished()) {
			const winner = room.firstToPlay ^ message.raw.readInt8(4);

			room.duelWinner(winner);

			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});

			if (room.isMatchFinished()) {
				this.eventBus.publish(
					GameOverDomainEvent.DOMAIN_EVENT,
					new GameOverDomainEvent({
						bestOf: room.bestOf,
						players: room.matchPlayersHistory,
						date: new Date(),
						ranked: room.ranked,
						banlistHash: room.banListHash,
					})
				);

				WebSocketSingleton.getInstance().broadcast({
					action: "REMOVE-ROOM",
					data: room.toRealTimePresentation(),
				});
			}
		}
	}

	private handleFieldFinish(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient
	): void {
		if (player.cache) {
			player.socket.send(player.cache);
			player.clearReconnecting();
		}
	}

	private handleUpdateDeck(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient
	): void {
		this.logger.info("MERCURY: UPDATE_DECK");
		player.sendToCore(Buffer.from([0x01, 0x00, 0x30]));
	}

	private handleTimeConfirm(
		_message: ClientMessage,
		_room: MercuryRoom,
		_player: MercuryClient
	): void {
		this.logger.info("MERCURY: TIME_CONFIRM");
	}

	private handleTimeLimit(
		_message: ClientMessage,
		_room: MercuryRoom,
		_player: MercuryClient
	): void {
		this.logger.info("MERCURY: TIME_LIMIT");
	}

	private handleChangeSide(
		_message: ClientMessage,
		room: MercuryRoom,
		_player: MercuryClient
	): void {
		this.logger.info("MERCURY: CHANGE_SIDE");

		if (room.duelState === DuelState.DUELING) {
			room.sideDecking();

			return;
		}
	}
}
