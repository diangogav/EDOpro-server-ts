

import EventEmitter from "events";

import { Logger } from "../../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../../shared/socket/domain/ISocket";
import { Client } from "../../../../client/domain/Client";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../../shared/messages/Commands";
import { ClientMessage } from "../../../../../shared/messages/MessageProcessor";
import { ChooseOrderClientMessage } from "../../../../messages/server-to-client/ChooseOrderClientMessage";
import { JoinToDuelAsSpectator } from "../../../application/JoinToDuelAsSpectator";
import { Reconnect } from "../../../application/Reconnect";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";
import { ReconnectionTokenIssuer } from "../../../../../shared/room/application/reconnect/ReconnectionTokenIssuer";
import { ReconnectionAckMessage } from "../../../../../shared/messages/server-to-client/ReconnectionAckMessage";

export class ChossingOrderState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly reconnect: Reconnect,
		private readonly joinToDuelAsSpectator: JoinToDuelAsSpectator
	) {
		super(eventEmitter);

		this.logger = logger.child({ file: "ChossingOrderState" });

		this.eventEmitter.on(
			"JOIN" as unknown as string,
			(message: ClientMessage, room: Room, socket: ISocket) =>
				this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleReady.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.TURN_CHOICE as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handle.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			"EXPRESS_RECONNECT" as unknown as string,
			(message: ClientMessage, room: Room, socket: ISocket) =>
				this.handleExpressReconnect.bind(this)(message, room, socket)
		);
	}

	private handleExpressReconnect(message: ClientMessage, room: Room, socket: ISocket): void {
		this.logger.info("CHOSSING_ORDER: EXPRESS_RECONNECT");
		const token = message.data.toString("utf8");

		const player = ReconnectionTokenIssuer.resolve(
			token,
			room.id,
			(client) => client instanceof Client
		) as Client | null;
		if (!player) {
			this.logger.info(`CHOSSING_ORDER: no player for token ${token}`);
			socket.send(ReconnectionAckMessage.failure());
			socket.destroy();
			return;
		}

		player.setSocket(socket, room.players as Client[], room);
		player.reconnecting();
		socket.send(ReconnectionAckMessage.success());

		// Re-sync mirrors the name-match reconnect for this phase (handleReady).
		player.sendMessage(DuelStartClientMessage.create());
		if (room.clientWhoChoosesTurn.position === player.position) {
			player.sendMessage(ChooseOrderClientMessage.create());
		}

		// Rotate the token after a successful reconnection (single-use).
		player.sendMessage(ReconnectionTokenIssuer.rotate(player, room.id));
		player.clearReconnecting();
	}

	private handle(message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("CHOSSING_ORDER: TURN_CHOICE");

		const turn = message.data.readInt8();
		const team = (<Client | undefined>room.players.find((client) => client === player))?.team;

		if ((team === 0 && turn === 0) || (team === 1 && turn === 1)) {
			room.setFirstToPlay(1);
			room.dueling();

			return;
		}

		room.setFirstToPlay(0);
		room.dueling();
	}

	private handleReady(message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("CHOSSING_ORDER: READY");

		if (!player.isReconnecting) {
			return;
		}

		player.sendMessage(DuelStartClientMessage.create());

		if (room.clientWhoChoosesTurn.position === player.position) {
			const message = ChooseOrderClientMessage.create();
			room.clientWhoChoosesTurn.socket.send(message);
		}

		player.clearReconnecting();
	}

	private async handleJoin(message: ClientMessage, room: Room, socket: ISocket): Promise<void> {
		this.logger.info("CHOSSING_ORDER: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new JoinGameMessage(message.data);
		const reconnectingPlayer = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(reconnectingPlayer instanceof Client)) {
			await this.joinToDuelAsSpectator.run(joinMessage, playerInfoMessage, socket, room);

			return;
		}

		await this.reconnect.run(playerInfoMessage, reconnectingPlayer, joinMessage, socket, room);
	}
}
