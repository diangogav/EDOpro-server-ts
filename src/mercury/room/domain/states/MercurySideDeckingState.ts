/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { CoreMessages } from "@modules/messages/domain/CoreMessages";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { SideDeckClientMessage } from "../../../../modules/messages/server-to-client/game-messages/SideDeckClientMessage";
import { Room } from "../../../../modules/room/domain/Room";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../modules/shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../modules/shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryReconnect } from "../../application/MercuryReconnect";
import { MercuryRoom } from "../MercuryRoom";

export class MercurySideDeckingState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);

		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			"GAME_MSG",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handleGameMessage.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: MercuryClient) =>
				this.handleReady.bind(this)(message, room, client)
		);
	}

	private handleJoin(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
		this.logger.info("MERCURY_SIDE_DECKING: JOIN");
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

	private handleReady(_message: ClientMessage, room: MercuryRoom, player: MercuryClient): void {
		this.logger.debug("MERCURY_SIDE_DECKING: READY");
		if (!player.isReconnecting) {
			return;
		}

		player.socket.send(DuelStartClientMessage.create());

		const message = SideDeckClientMessage.create();
		player.socket.send(message);

		player.clearReconnecting();
	}

	private handleGameMessage(
		message: ClientMessage,
		room: MercuryRoom,
		_player: MercuryClient
	): void {
		this.logger.info("MERCURY_SIDE_DECKING: GAME_MSG");
		const gameMessage = message.data[0];
		if (gameMessage === CoreMessages.MSG_START) {
			this.logger.info("MERCURY CORE: MSG_START");
			room.dueling();
		}
	}
}
