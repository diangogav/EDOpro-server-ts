/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { CoreMessages } from "@modules/messages/domain/CoreMessages";
import { container } from "@modules/shared/dependency-injection";
import { EventBus } from "@modules/shared/event-bus/EventBus";
import { GameOverDomainEvent } from "@modules/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { EventEmitter } from "events";

import { PlayerInfoMessage } from "../../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { DuelState } from "../../../../modules/shared/room/domain/YgoRoom";
import { ISocket } from "../../../../modules/shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryReconnect } from "../../application/MercuryReconnect";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryDuelingState extends RoomState {
	private readonly eventBus: EventBus;

	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventBus = container.get(EventBus);
		this.eventEmitter.on(
			"DUEL_END",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handle.bind(this)(message, room, client)
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

	private handle(_message: ClientMessage, _room: MercuryRoom, _player: MercuryClient): void {
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

		if (coreMessageType === CoreMessages.MSG_WIN && !room.isMatchFinished()) {
			const winner = room.firstToPlay ^ message.raw.readInt8(4);

			room.duelWinner(winner);

			if (room.isMatchFinished()) {
				this.eventBus.publish(
					GameOverDomainEvent.DOMAIN_EVENT,
					new GameOverDomainEvent({
						bestOf: room.bestOf,
						players: room.matchPlayersHistory,
						date: new Date(),
						ranked: room.ranked,
						banlistHash: room.banlistHash,
					})
				);
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
