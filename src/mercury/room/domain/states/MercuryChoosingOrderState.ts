 
 
import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { CoreMessages } from "../../../../edopro/messages/domain/CoreMessages";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { ChooseOrderClientMessage } from "../../../../edopro/messages/server-to-client/ChooseOrderClientMessage";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryReconnect } from "../../application/MercuryReconnect";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryChoosingOrderState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);

		this.logger = logger.child({ file: "MercuryChoosingOrderState" });

		this.eventEmitter.on(
			"GAME_MSG",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.gameMessageHandler.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handleReady.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			Commands.TURN_CHOICE as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handle.bind(this)(message, room, client)
		);
	}

	private handle(message: ClientMessage, room: MercuryRoom, player: MercuryClient): void {
		player.logger.info("MercuryChoosingOrderState: CHOOSING_ORDER");
		const turn = message.data.readInt8();
		const team = (<MercuryClient | undefined>room.clients.find((client) => client === player))
			?.team;

		if ((team === 0 && turn === 0) || (team === 1 && turn === 1)) {
			room.setFirstToPlay(1);

			return;
		}

		room.setFirstToPlay(0);
	}

	private gameMessageHandler(
		message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient
	): void {
		player.logger.info("MercuryChoosingOrderState: GAME_MSG");
		const gameMessage = message.data[0];
		if (gameMessage === CoreMessages.MSG_START) {
			this.logger.info("MercuryChoosingOrderState CORE: MSG_START");
			_room.dueling();
		}
	}

	private handleJoin(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
		this.logger.info("JOIN");
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

	private handleReady(_message: ClientMessage, room: MercuryRoom, player: MercuryClient): void {
		player.logger.debug("MercuryChoosingOrderState: READY");
		if (!player.isReconnecting) {
			return;
		}

		player.socket.send(DuelStartClientMessage.create());

		if (room.clientWhoChoosesTurn === player) {
			const message = ChooseOrderClientMessage.create();
			room.clientWhoChoosesTurn.socket.send(message);
		}

		player.clearReconnecting();
	}
}
