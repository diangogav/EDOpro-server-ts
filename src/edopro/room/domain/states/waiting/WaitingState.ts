 
 
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";
import { EventEmitter } from "stream";

import { Logger } from "../../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../../shared/socket/domain/ISocket";
import { Client } from "../../../../client/domain/Client";
import { DeckCreator } from "../../../../deck/application/DeckCreator";
import { UpdateDeckMessageParser } from "../../../../deck/application/UpdateDeckMessageSizeCalculator";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../messages/domain/Commands";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { ErrorMessages } from "../../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../../messages/server-to-client/JoinGameClientMessage";
import { RPSChooseClientMessage } from "../../../../messages/server-to-client/RPSChooseClientMessage";
import { ServerErrorClientMessage } from "../../../../messages/server-to-client/ServerErrorMessageClientMessage";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";

export class WaitingState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly userAuth: UserAuth,
		private readonly deckCreator: DeckCreator
	) {
		super(eventEmitter);
		this.logger = this.logger.child({ file: "WaitingState" });
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: Room, socket: ISocket) =>
				void this.handle.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				void this.handleUpdateDeck.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.NOT_READY as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				void this.handleNotReady.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleReady.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.TRY_START as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.tryStartHandler.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.OBSERVER as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleChangeToObserver.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.TO_DUEL as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleToDuel.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.KICK as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleKick.bind(this)(message, room, client)
		);
	}

	private handleKick(message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("WaitingState: KICK");

		const positionKick = message.data.readInt8();
		const playerSelect = room.clients.find((_client) => _client.position === positionKick);

		if (!(playerSelect instanceof Client)) {
			return;
		}

		if (playerSelect.host) {
			return;
		}

		this.handleChangeToObserver(message, room, playerSelect);
		room.addKick(playerSelect);

		room.clients.forEach((_client: Client) => {
			_client.sendMessage(
				ServerErrorClientMessage.create(
					`The player:${playerSelect.name} has been banned from this room, he can only enter as a spectator!!`
				)
			);
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(
				ServerErrorClientMessage.create(
					`The player:${playerSelect.name} has been banned from this room, he can only enter as a spectator!!`
				)
			);
		});
	}

	private handleToDuel(_message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("WaitingState: TO_DUEL");
		const ips = player.socket.remoteAddress;
		if (player.isSpectator && !room.kick.find((kick) => kick.socket.remoteAddress === ips)) {
			room.spectatorToPlayer(player);

			return;
		}

		if (!room.kick.find((kick) => kick.socket.remoteAddress === ips)) {
			room.movePlayerToAnotherCell(player);
		}
	}

	private tryStartHandler(_message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("WaitingState: TRY_START");

		if (!room.allPlayersReady) {
			return;
		}

		const duelStartMessage = DuelStartClientMessage.create();
		room.clients.forEach((client: Client) => {
			client.sendMessage(duelStartMessage);
		});

		room.spectators.forEach((client: Client) => {
			client.sendMessage(duelStartMessage);
		});

		const t0Client = room.clients
			.filter((_client: Client) => _client.team === 0)
			.sort((a, b) => a.position - b.position)[0];
		const t1Client = room.clients
			.filter((_client: Client) => _client.team === 1)
			.sort((a, b) => a.position - b.position)[0];

		const rpsChooseMessage = RPSChooseClientMessage.create();
		(t0Client as Client).sendMessage(rpsChooseMessage);
		(t1Client as Client).sendMessage(rpsChooseMessage);

		room.createMatch();
		room.rps();
	}

	private handleReady(_message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("WaitingState: READY");

		if (player.isUpdatingDeck) {
			player.saveReadyCommand(_message);

			return;
		}

		room.ready(player);
	}

	private handleChangeToObserver(_message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("WaitingState: OBSERVER");

		if (player.isSpectator) {
			return;
		}

		if (!player.host) {
			room.playerToSpectator(player);
		}
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: Room,
		player: Client
	): Promise<void> {
		player.logger.info("WaitingState: UPDATE_DECK");

		player.updatingDeck();
		const parser = new UpdateDeckMessageParser(message.data);
		const [mainDeck, sideDeck] = parser.getDeck();
		const deck = await this.deckCreator.build({
			main: mainDeck,
			side: sideDeck,
			banListHash: room.banListHash,
		});

		const hasError = deck.validate();

		if (hasError) {
			player.sendMessage(hasError.buffer());

			this.handleNotReady(message, room, player);

			return;
		}

		room.setDecksToPlayer(player.position, deck);
		player.deckUpdated();

		if (player.haveReadyCommand) {
			player.clearReadyCommand();
			this.handleReady(player.readyMessage, room, player);
		}
	}

	private handleNotReady(_message: ClientMessage, room: Room, player: Client): void {
		player.logger.info("WaitingState: NOT_READY");

		room.notReady(player);
	}

	private async handle(message: ClientMessage, room: Room, socket: ISocket): Promise<void> {
		this.logger.info("JOIN");

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		if (this.playerAlreadyInRoom(playerInfoMessage, room, socket)) {
			this.sendExistingPlayerErrorMessage(playerInfoMessage, socket);

			return;
		}

		const joinGameMessage = new JoinGameMessage(message.data);

		const place = await room.calculatePlace();

		if (!place) {
			const spectator = await room.createSpectator(socket, playerInfoMessage.name);
			socket.send(JoinGameClientMessage.createFromRoom(joinGameMessage, room));
			room.addSpectator(spectator);
			room.notifyToAllLobbyClients(spectator);
			room.sendSpectatorCount({ enqueue: true });

			return;
		}

		let userId: string | null = null;

		if (room.ranked) {
			const user = await this.userAuth.run(playerInfoMessage);

			if (!(user instanceof UserProfile)) {
				socket.send(user as Buffer);
				socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

				return;
			}

			userId = user.id;
		}
		const player = await room.createPlayer(socket, playerInfoMessage.name, userId);
		if (!player) {
			const spectator = await room.createSpectator(socket, playerInfoMessage.name);
			socket.send(JoinGameClientMessage.createFromRoom(joinGameMessage, room));
			room.addSpectator(spectator);
			room.notifyToAllLobbyClients(spectator);
			room.sendSpectatorCount({ enqueue: true });

			return;
		}

		socket.send(JoinGameClientMessage.createFromRoom(joinGameMessage, room));
		room.addPlayer(player);
	}
}
