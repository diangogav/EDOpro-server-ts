/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { EventEmitter } from "stream";

import { Client } from "../../../../client/domain/Client";
import { DeckCreator } from "../../../../deck/application/DeckCreator";
import { UpdateDeckMessageSizeCalculator } from "../../../../deck/application/UpdateDeckMessageSizeCalculator";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../messages/domain/Commands";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { ErrorMessages } from "../../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../../../messages/server-to-client/PlayerChangeClientMessage";
import { RPSChooseClientMessage } from "../../../../messages/server-to-client/RPSChooseClientMessage";
import { ServerErrorClientMessage } from "../../../../messages/server-to-client/ServerErrorMessageClientMessage";
import { WatchChangeClientMessage } from "../../../../messages/server-to-client/WatchChangeClientMessage";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { PlayerEnterClientMessage } from "../../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { Rank } from "../../../../shared/value-objects/Rank";
import { UserFinder } from "../../../../user/application/UserFinder";
import { User } from "../../../../user/domain/User";
import { PlayerRoomState } from "../../PlayerRoomState";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";
import { ChangeToDuel } from "./ChangeToDuel";

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

	private handleKick(message: ClientMessage, room: Room, _player: Client): void {
		this.logger.debug("WAITING: KICK");
		const positionkick = message.data.readInt8();
		const playerselect = room.clients.find((_client) => _client.position === positionkick);

		if (!(playerselect instanceof Client)) {
			return;
		}

		if (playerselect.host) {
			return;
		}

		this.handleChangeToObserver(message, room, playerselect);
		room.addKick(playerselect);

		room.clients.forEach((_client: Client) => {
			_client.sendMessage(
				ServerErrorClientMessage.create(
					`El Jugador:${playerselect.name} ha sido Baneado de esta Sala, solo podra ingresar como espectador!!`
				)
			);
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(
				ServerErrorClientMessage.create(
					`El Jugador:${playerselect.name} ha sido Baneado de esta Sala, solo podra ingresar como espectador!!`
				)
			);
		});
	}

	private handleToDuel(_message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: TO_DUEL");
		const changeToDuel = new ChangeToDuel();
		changeToDuel.execute(room, player);
	}

	private tryStartHandler(_message: ClientMessage, room: Room, _player: Client): void {
		this.logger.debug("WAITING: TRY_START");
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
		this.logger.debug("WAITING: READY");
		if (player.isUpdatingDeck) {
			this.logger.debug("WAITING: SAVING READY COMMAND");
			player.saveReadyCommand(_message);

			return;
		}

		this.logger.debug("WAITING: EXECUTE READY COMMAND");
		const status = (player.position << 4) | 0x09;
		const message = PlayerChangeClientMessage.create({ status });

		[...room.spectators, ...room.clients].forEach((client: Client) => {
			client.sendMessage(message);
		});

		player.ready();
	}

	private handleChangeToObserver(_message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: TO_OBSERVER");

		if (player.isSpectator) {
			return;
		}

		if (!player.host) {
			const place = room.nextSpectatorPosition();
			room.removePlayer(player);

			room.spectators.push(player);

			room.clients.forEach((_client: Client) => {
				const status = (player.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			room.spectators.forEach((_client: Client) => {
				const status = (player.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			player.spectatorPosition(place);
			player.notReady();

			const type = (Number(player.host) << 4) | player.position;
			player.sendMessage(TypeChangeClientMessage.create({ type }));

			const spectatorsCount = room.spectators.length;
			const watchMessage = WatchChangeClientMessage.create({
				count: spectatorsCount,
			});

			room.clients.forEach((_client: Client) => {
				_client.sendMessage(watchMessage);
			});

			room.spectators.forEach((_client: Client) => {
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
		player.updatingDeck();
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
		player.deckUpdated();

		if (player.haveReadyCommand) {
			this.logger.debug("WAITING: UPDATE_DECK: CALLING READY COMMAND");
			player.clearReadyCommand();
			this.handleReady(player.readyMessage, room, player);
		}
	}

	private handleNotReady(_message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("WAITING: NOT_READY");

		const status = (player.position << 4) | 0x0a;
		const playerChangeMessage = PlayerChangeClientMessage.create({ status });
		[...room.spectators, ...room.clients].forEach((client: Client) => {
			client.sendMessage(playerChangeMessage);
		});

		player.notReady();
	}

	private async handle(message: ClientMessage, room: Room, socket: ISocket): Promise<void> {
		this.logger.debug("WAITING: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		if (this.playerAlreadyInRoom(playerInfoMessage, room, socket)) {
			this.sendExistingPlayerErrorMessage(playerInfoMessage, socket);

			return;
		}

		const place = room.calculatePlace();
		const joinGameMessage = new JoinGameMessage(message.data);
		if (!place) {
			this.spectator(joinGameMessage, socket, playerInfoMessage, room);

			return;
		}

		if (room.ranked) {
			const user = await this.userFinder.run(playerInfoMessage);

			if (!(user instanceof User)) {
				socket.send(user as Buffer);
				socket.send(ErrorClientMessage.create(ErrorMessages.JOINERROR));

				return;
			}
			this.player(place, joinGameMessage, socket, playerInfoMessage, room, user.ranks);

			return;
		}
		this.player(place, joinGameMessage, socket, playerInfoMessage, room, []);
	}

	private spectator(
		joinGameMessage: JoinGameMessage,
		socket: ISocket,
		playerInfoMessage: PlayerInfoMessage,
		room: Room
	): void {
		const client = room.createSpectator(socket, playerInfoMessage.name);

		socket.send(JoinGameClientMessage.createFromRoom(joinGameMessage, room));
		const type = (Number(client.host) << 4) | client.position;
		socket.send(TypeChangeClientMessage.create({ type }));

		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = (<Client | undefined>(
					room.clients.find((item: Client) => item.position === _client.position)
				))?.isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				socket.send(PlayerEnterClientMessage.create(_client.name, _client.position));
				socket.send(PlayerChangeClientMessage.create({ status }));
			}
		});

		const spectatorsCount = room.spectators.length;

		const watchMessage = WatchChangeClientMessage.create({
			count: spectatorsCount,
		});

		room.clients.forEach((_client: Client) => {
			_client.sendMessage(watchMessage);
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(watchMessage);
		});
	}

	private player(
		place: {
			position: number;
			team: number;
		},
		joinGameMessage: JoinGameMessage,
		socket: ISocket,
		playerInfoMessage: PlayerInfoMessage,
		room: Room,
		ranks: Rank[]
	): void {
		const host = room.clients.some((client: Client) => client.host);

		const client = new Client({
			socket,
			host: !host,
			name: playerInfoMessage.name,
			position: place.position,
			roomId: room.id,
			team: place.team,
			logger: this.logger,
			ranks,
		});

		if (client.host) {
			this.sendJoinMessage(playerInfoMessage, joinGameMessage, socket, room, client);
			client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
			this.sendNotReadyMessage(client, room);
			this.sendTypeChangeMessage(client, socket);
			room.addClient(client);

			return;
		}

		room.addClient(client);
		this.sendJoinMessage(playerInfoMessage, joinGameMessage, socket, room, client);
		this.sendNotReadyMessage(client, room);
		this.sendTypeChangeMessage(client, socket);
		const spectatorsCount = room.spectators.length;
		const watchMessage = WatchChangeClientMessage.create({
			count: spectatorsCount,
		});
		socket.send(watchMessage);
		this.sendInfoMessage(room, socket);

		this.notify(client, room, socket);
	}

	private sendJoinMessage(
		playerInfoMessage: PlayerInfoMessage,
		message: JoinGameMessage,
		socket: ISocket,
		room: Room,
		client: Client
	): void {
		socket.send(JoinGameClientMessage.createFromRoom(message, room));
		room.clients.forEach((_client: Client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		});
	}

	private sendNotReadyMessage(client: Client, room: Room): void {
		const notReady = (client.position << 4) | PlayerRoomState.NOT_READY;
		room.clients.forEach((_client: Client) => {
			_client.sendMessage(PlayerChangeClientMessage.create({ status: notReady }));
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(PlayerChangeClientMessage.create({ status: notReady }));
		});
	}

	private sendTypeChangeMessage(client: Client, socket: ISocket): void {
		const type = (Number(client.host) << 4) | client.position;
		socket.send(TypeChangeClientMessage.create({ type }));
	}

	private notify(client: Client, room: Room, socket: ISocket): void {
		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = (<Client | undefined>(
					room.clients.find((item) => item.position === _client.position)
				))?.isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				socket.send(PlayerEnterClientMessage.create(_client.name, _client.position));
				socket.send(PlayerChangeClientMessage.create({ status }));
			}
		});
	}
}
