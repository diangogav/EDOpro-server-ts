/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { RPSChooseClientMessage } from "../../../../edopro/messages/server-to-client/RPSChooseClientMessage";
import { Room } from "../../../../edopro/room/domain/Room";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryReconnect } from "../../application/MercuryReconnect";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryRockPaperScissorState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventEmitter.on(
			"SELECT_TP",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handle.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			Commands.RPS_CHOICE as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handleRPSChoice.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: MercuryClient) =>
				this.handleReady.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			"HAND_RESULT",
			(message: ClientMessage, room: Room, client: MercuryClient) =>
				this.handleHandResult.bind(this)(message, room, client)
		);
	}

	private handle(_message: ClientMessage, room: MercuryRoom, player: MercuryClient): void {
		this.logger.info("MERCURY: SELECT_TP");
		room.setClientWhoChoosesTurn(player);
		room.choosingOrder();
	}

	private handleJoin(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
		this.logger.info("MERCURY: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const playerAlreadyInRoom = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(playerAlreadyInRoom instanceof MercuryClient)) {
			const spectator = new MercuryClient({
				id: null,
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

	private handleReady(_message: ClientMessage, _room: Room, player: MercuryClient): void {
		this.logger.debug("MERCURY RPS: READY");
		if (!player.isReconnecting) {
			return;
		}

		player.socket.send(DuelStartClientMessage.create());

		if (!player.rpsChosen) {
			const rpsChooseMessage = RPSChooseClientMessage.create();
			player.socket.send(rpsChooseMessage);
		}

		player.clearReconnecting();
	}

	private handleRPSChoice(message: ClientMessage, _room: MercuryRoom, player: MercuryClient): void {
		this.logger.debug(`MERCURY RPS: RPS_CHOICE: ${message.raw.toString("hex")}`);
		player.rpsChoose();
	}

	private handleHandResult(
		message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient
	): void {
		this.logger.debug(`MERCURY RPS: HAND_RESULT: ${message.raw.toString("hex")}`);
		player.rpsRpsChoose();
	}
}
