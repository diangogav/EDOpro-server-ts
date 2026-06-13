

import EventEmitter from "events";

import { Logger } from "../../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../../shared/socket/domain/ISocket";
import { Client } from "../../../../client/domain/Client";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../../shared/messages/Commands";
import { ClientMessage } from "../../../../../shared/messages/MessageProcessor";
import { RPSChooseClientMessage } from "../../../../messages/server-to-client/RPSChooseClientMessage";
import { JoinToDuelAsSpectator } from "../../../application/JoinToDuelAsSpectator";
import { Reconnect } from "../../../application/Reconnect";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";
import { RpsChoiceCommandStrategy } from "./RpsChoiceCommandStrategy";
import { ReconnectionTokenIssuer } from "../../../../../shared/room/application/reconnect/ReconnectionTokenIssuer";
import { ReconnectionAckMessage } from "../../../../../shared/messages/server-to-client/ReconnectionAckMessage";

export class RockPaperScissorState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly reconnect: Reconnect,
		private readonly joinToDuelAsSpectator: JoinToDuelAsSpectator
	) {
		super(eventEmitter);

		this.logger = logger.child({ file: "RockPaperScissorState" });

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
			Commands.RPS_CHOICE as unknown as string,
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
		this.logger.info("RockPaperScissorState: EXPRESS_RECONNECT");
		const token = message.data.toString("utf8");

		const player = ReconnectionTokenIssuer.resolve(
			token,
			room.id,
			(client) => client instanceof Client
		) as Client | null;
		if (!player) {
			this.logger.info(`RockPaperScissorState: no player for token ${token}`);
			socket.send(ReconnectionAckMessage.failure());
			socket.destroy();
			return;
		}

		player.setSocket(socket, room.players as Client[], room);
		player.reconnecting();
		socket.send(ReconnectionAckMessage.success());

		// Re-sync mirrors the name-match reconnect for this phase (handleReady).
		player.sendMessage(DuelStartClientMessage.create());
		if (!player.rpsChoise) {
			player.sendMessage(RPSChooseClientMessage.create());
		}

		// Rotate the token after a successful reconnection (single-use).
		player.sendMessage(ReconnectionTokenIssuer.rotate(player, room.id));
		player.clearReconnecting();
	}

	private handle(message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("RockPaperScissorState: RPS_CHOICE");

		const rpsChoice = new RpsChoiceCommandStrategy();
		rpsChoice.execute(message, room, player);
	}

	private handleReady(message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("RockPaperScissorState: READY");

		if (!player.isReconnecting) {
			return;
		}

		player.sendMessage(DuelStartClientMessage.create());

		if (!player.rpsChoise) {
			const rpsChooseMessage = RPSChooseClientMessage.create();
			player.sendMessage(rpsChooseMessage);
		}

		player.clearReconnecting();
	}

	private async handleJoin(message: ClientMessage, room: Room, socket: ISocket): Promise<void> {
		this.logger.info("JOIN");
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
