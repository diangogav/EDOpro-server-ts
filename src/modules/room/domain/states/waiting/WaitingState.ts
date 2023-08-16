/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { EventEmitter } from "stream";

import { YGOClientSocket } from "../../../../../socket-server/HostServer";
import { Client } from "../../../../client/domain/Client";
import { DeckCreator } from "../../../../deck/application/DeckCreator";
import { UpdateDeckMessageSizeCalculator } from "../../../../deck/application/UpdateDeckMessageSizeCalculator";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../messages/domain/Commands";
import { ServerInfoMessage } from "../../../../messages/domain/ServerInfoMessage";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { DuelStartClientMessage } from "../../../../messages/server-to-client/DuelStartClientMessage";
import { ErrorMessages } from "../../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../../messages/server-to-client/PlayerEnterClientMessage";
import { RPSChooseClientMessage } from "../../../../messages/server-to-client/RPSChooseClientMessage";
import { ServerErrorClientMessage } from "../../../../messages/server-to-client/ServerErrorMessageClientMessage";
import { ServerMessageClientMessage } from "../../../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../../../messages/server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../../messages/server-to-client/WatchChangeClientMessage";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { UserFinder } from "../../../../user/application/UserFinder";
import { User } from "../../../../user/domain/User";
import { PlayerRoomState } from "../../PlayerRoomState";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";
import { ChangeToDuel } from "./ChangeToDuel";
import { Kick } from "./kick";

export class WaitingState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly userFinder: UserFinder,
		private readonly deckCreator: DeckCreator
	) {
		super(eventEmitter);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: Room, socket: YGOClientSocket) =>
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
			Commands.TODUEL as unknown as string,
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
		this.logger.debug("WAITING: KICK");
		const kick = new Kick();
		kick.execute(message, room, player);
	}

	private handleToDuel(_message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: TO_DUEL");
		const changeToDuel = new ChangeToDuel();
		changeToDuel.execute(room, player);
	}

	private tryStartHandler(_message: ClientMessage, room: Room, _player: Client): void {
		this.logger.debug("WAITING: TRY_START");
		const duelStartMessage = DuelStartClientMessage.create();
		room.clients.forEach((client) => {
			client.sendMessage(duelStartMessage);
		});

		room.spectators.forEach((client) => {
			client.sendMessage(duelStartMessage);
		});

		const t0Client = room.clients.filter((_client) => _client.team === 0)[0];
		const t1Client = room.clients.filter((_client) => _client.team === 1)[0];

		const rpsChooseMessage = RPSChooseClientMessage.create();
		t0Client.sendMessage(rpsChooseMessage);
		t1Client.sendMessage(rpsChooseMessage);

		room.initializeHistoricalData();
		room.rps();
	}

	private handleReady(_message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: READY");

		const status = (player.position << 4) | 0x09;
		const message = PlayerChangeClientMessage.create({ status });

		[...room.spectators, ...room.clients].forEach((client) => {
			client.sendMessage(message);
		});

		player.ready();
	}

	private handleChangeToObserver(message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: TO_OBSERVER");

		if (player.isSpectator) {
			return;
		}

		if (!player.host) {
			const place = room.nextSpectatorPosition();
			room.removePlayer(player);

			room.addSpectator(player);

			room.clients.forEach((_client) => {
				const status = (player.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			room.spectators.forEach((_client) => {
				const status = (player.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			player.spectatorPosition(place);
			player.notReady();

			const type = (Number(player.host) << 4) | player.position;
			player.sendMessage(TypeChangeClientMessage.create({ type }));

			const spectatorsCount = room.spectators.length;
			const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

			room.clients.forEach((_client) => {
				_client.sendMessage(watchMessage);
			});

			room.spectators.forEach((_client) => {
				_client.sendMessage(watchMessage);
			});
		}
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: Room,
		player: Client
	): Promise<void> {
		this.logger.debug("WAITING: UPDATE_DECK");
		const messageSize = new UpdateDeckMessageSizeCalculator(message.data).calculate();
		const body = message.data.subarray(0, messageSize);
		const mainAndExtraDeckSize = body.readUInt32LE(0);
		const sizeDeckSize = body.readUint32LE(4);
		const mainDeck: number[] = [];
		for (let i = 8; i < mainAndExtraDeckSize * 4 + 8; i += 4) {
			const code = body.readUint32LE(i);
			mainDeck.push(code);
		}

		const sideDeck: number[] = [];
		for (
			let i = mainAndExtraDeckSize * 4 + 8;
			i < (mainAndExtraDeckSize + sizeDeckSize) * 4 + 8;
			i += 4
		) {
			const code = body.readUint32LE(i);
			sideDeck.push(code);
		}

		const deck = await this.deckCreator.build({
			main: mainDeck,
			side: sideDeck,
			banListHash: room.banlistHash,
		});

		const hasError = deck.validate();

		if (hasError) {
			player.sendMessage(hasError.buffer());

			this.handleNotReady(message, room, player);

			return;
		}

		room.setDecksToPlayer(player.position, deck);
	}

	private handleNotReady(_message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: NOT_READY");

		const status = (player.position << 4) | 0x0a;
		const playerChangeMessage = PlayerChangeClientMessage.create({ status });
		[...room.spectators, ...room.clients].forEach((client) => {
			client.sendMessage(playerChangeMessage);
		});

		player.notReady();
	}

	private async handle(message: ClientMessage, room: Room, socket: YGOClientSocket): Promise<void> {
		this.logger.debug("WAITING: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		if (this.playerAlreadyInRoom(playerInfoMessage, room, socket)) {
			this.sendErrorMessage(playerInfoMessage, socket);

			return;
		}

		const place = room.calculaPlace();
		const joinGameMessage = new JoinGameMessage(message.data);
		if (!place) {
			this.spectator(joinGameMessage, socket, playerInfoMessage, room);

			return;
		}

		if (room.ranked) {
			const user = await this.userFinder.run(playerInfoMessage);

			if (!(user instanceof User)) {
				socket.write(user as Buffer);
				socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

				return;
			}
		}

		this.player(place, joinGameMessage, socket, playerInfoMessage, room);
	}

	private sendErrorMessage(playerInfoMessage: PlayerInfoMessage, socket: YGOClientSocket): void {
		socket.write(
			ServerErrorClientMessage.create(
				`Ya existe un jugador con el nombre :${playerInfoMessage.name}`
			)
		);
		socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));
		socket.destroy();

		return;
	}

	private spectator(
		joinGameMessage: JoinGameMessage,
		socket: YGOClientSocket,
		playerInfoMessage: PlayerInfoMessage,
		room: Room
	): void {
		const client = new Client({
			socket,
			host: false,
			name: playerInfoMessage.name,
			position: room.nextSpectatorPosition(),
			roomId: room.id,
			team: 3,
			logger: this.logger,
		});

		room.addSpectator(client);

		socket.write(JoinGameClientMessage.createFromRoom(joinGameMessage, room));
		const type = (Number(client.host) << 4) | client.position;
		socket.write(TypeChangeClientMessage.create({ type }));

		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients.find((item) => item.position === _client.position)?.isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});

		const spectatorsCount = room.spectators.length;

		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

		room.clients.forEach((_client) => {
			_client.sendMessage(watchMessage);
		});

		room.spectators.forEach((_client) => {
			_client.sendMessage(watchMessage);
		});
	}

	private player(
		place: {
			position: number;
			team: number;
		},
		joinGameMessage: JoinGameMessage,
		socket: YGOClientSocket,
		playerInfoMessage: PlayerInfoMessage,
		room: Room
	): void {
		const client = new Client({
			socket,
			host: false,
			name: playerInfoMessage.name,
			position: place.position,
			roomId: room.id,
			team: place.team,
			logger: this.logger,
		});

		room.addClient(client);
		this.sendJoinMessage(playerInfoMessage, joinGameMessage, socket, room, client);
		this.sendNotReadyMessage(client, room);
		this.sendTypeChangeMessage(client, socket);
		const spectatorsCount = room.spectators.length;
		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });
		socket.write(watchMessage);
		this.sendInfoMessage(room, socket);

		const host = room.clients.find((client) => client.host);
		if (!host) {
			return;
		}

		this.notify(client, room, socket);
	}

	private sendJoinMessage(
		playerInfoMessage: PlayerInfoMessage,
		message: JoinGameMessage,
		socket: YGOClientSocket,
		room: Room,
		client: Client
	): void {
		socket.write(JoinGameClientMessage.createFromRoom(message, room));
		room.clients.forEach((_client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		});

		room.spectators.forEach((_client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		});
	}

	private sendNotReadyMessage(client: Client, room: Room): void {
		const notReady = (client.position << 4) | PlayerRoomState.NOT_READY;
		room.clients.forEach((_client) => {
			_client.sendMessage(PlayerChangeClientMessage.create({ status: notReady }));
		});

		room.spectators.forEach((_client) => {
			_client.sendMessage(PlayerChangeClientMessage.create({ status: notReady }));
		});
	}

	private sendTypeChangeMessage(client: Client, socket: YGOClientSocket): void {
		const type = (Number(client.host) << 4) | client.position;
		socket.write(TypeChangeClientMessage.create({ type }));
	}

	private notify(client: Client, room: Room, socket: YGOClientSocket): void {
		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients.find((item) => item.position === _client.position)?.isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});
	}

	private sendInfoMessage(room: Room, socket: YGOClientSocket): void {
		if (room.ranked) {
			socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
			socket.write(
				ServerMessageClientMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS)
			);
			socket.write(ServerMessageClientMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION));

			return;
		}

		socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		socket.write(
			ServerMessageClientMessage.create(ServerInfoMessage.UNRANKED_ROOM_CREATION_SUCCESS)
		);
		socket.write(ServerMessageClientMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
	}
}
