import { EventEmitter } from "stream";

import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { Client } from "../../../client/domain/Client";
import { CreateGameMessage } from "../../../messages/client-to-server/CreateGameMessage";
import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../messages/domain/Commands";
import { ClientMessage } from "../../../messages/MessageProcessor";
import { JoinGameClientMessage } from "../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../messages/server-to-client/TypeChangeClientMessage";
import { Logger } from "../../../shared/logger/domain/Logger";
import { PlayerRoomState } from "../../domain/PlayerRoomState";
import { Room } from "../../domain/Room";
import { Team } from "../../domain/Team";
import RoomList from "../../infrastructure/RoomList";

export class MercuryJoinHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: YGOClientSocket;

	constructor(eventEmitter: EventEmitter, logger: Logger, socket: YGOClientSocket) {
		this.eventEmitter = eventEmitter;
		this.logger = logger;
		this.socket = socket;
		this.eventEmitter.on(Commands.JOIN_GAME as unknown as string, (message: ClientMessage) =>
			this.handle(message)
		);
	}

	handle(message: ClientMessage): void {
		this.logger.info("Mercury: JoinHandler");
		const playerInfoMessage = new PlayerInfoMessage(
			message.previousMessage,
			message.previousMessage.length
		);
		const joinMessage = new JoinGameMessage(message.data);

		const createdRoom = RoomList.getRooms().find((room) => {
			return room.password === joinMessage.password;
		});
		if (!createdRoom) {
			const message: CreateGameMessage = {
				banList: 0,
				allowed: 2,
				mode: 1,
				duelRule: 5,
				dontCheckDeckContent: 0,
				dontShuffleDeck: 0,
				offset: 85,
				lp: 8000,
				startingHandCount: 5,
				drawCount: 1,
				timeLimit: 700,
				duelFlagsHight: 1,
				handshake: 4043399681,
				clientVersion: 655656,
				t0Count: 1,
				t1Count: 1,
				bestOf: 3,
				duelFlagsLow: 853504,
				forbidden: 83886080,
				extraRules: 0,
				mainDeckMin: 40,
				mainDeckMax: 60,
				extraDeckMin: 0,
				extraDeckMax: 15,
				sideDeckMin: 0,
				sideDeckMax: 15,
				name: "",
				password: joinMessage.password,
				notes: "\x00`\x00\x14\x12\x7F",
			};

			const room = Room.createFromCreateGameMessage(
				message,
				playerInfoMessage,
				this.generateUniqueId(),
				this.eventEmitter,
				this.logger
			);
			room.waiting();
			const client = new Client({
				socket: this.socket,
				host: true,
				name: playerInfoMessage.name,
				position: 0,
				roomId: room.id,
				team: Team.PLAYER,
				logger: this.logger,
			});
			room.addClient(client);
			RoomList.addRoom(room);
			room.createMatch();

			// this.sendJoinMessage(joinMessage, room);
			// this.sendNotReadyMessage(client, room);
			// this.sendTypeChangeMessage(client, this.socket);
			// this.sendPlayerEnterMessage(room, playerInfoMessage, client);
			// const spectatorsCount = room.spectators.length;
			// const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });
			// this.socket.write(watchMessage);
			// const host = room.clients.find((client) => client.host);
			// if (!host) {
			// 	return;
			// }

			// this.notify(client, room);

			this.socket.write(Buffer.from("150012119c0a2e0001050000000000401f00000501b400", "hex"));
			this.socket.write(Buffer.from("02001310", "hex"));
			this.socket.write(
				Buffer.from(
					"2b00204300680061007a007a005f00360036003600000000000000c99867d0e07f000000040000000000000017",
					"hex"
				)
			);

			return;
		}

		createdRoom.emit("JOIN", message, this.socket);
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	private sendJoinMessage(message: JoinGameMessage, room: Room): void {
		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
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

	private sendPlayerEnterMessage(
		room: Room,
		playerInfoMessage: PlayerInfoMessage,
		client: Client
	): void {
		room.clients.forEach((_client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		});

		room.spectators.forEach((_client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		});
	}

	private notify(client: Client, room: Room): void {
		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients.find((item) => item.position === _client.position)?.isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				this.socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				this.socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});
	}
}
