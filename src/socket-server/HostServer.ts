import net, { Socket } from "net";
import { v4 as uuidv4 } from "uuid";

import { MessageHandler } from "../modules/messages/application/MessageHandler/MessageHandler";
import { PlayerChangeClientMessage } from "../modules/messages/server-to-client/PlayerChangeClientMessage";
import { WatchChangeClientMessage } from "../modules/messages/server-to-client/WatchChangeClientMessage";
import { JoinToGameAsSpectator } from "../modules/room/application/JoinToGameAsSpectator";
import { JoinToRoomAsSpectator } from "../modules/room/application/JoinToRoomAsSpectator";
import { RoomFinder } from "../modules/room/application/RoomFinder";
import { DuelState } from "../modules/room/domain/Room";
import RoomList from "../modules/room/infrastructure/RoomList";
import { container } from "../modules/shared/dependency-injection";
import { EventBus } from "../modules/shared/event-bus/EventBus";
import { Logger } from "../modules/shared/logger/domain/Logger";
import ReconnectingPlayers from "../modules/shared/ReconnectingPlayers";

export class YGOClientSocket extends Socket {
	id?: string;
}

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly roomFinder: RoomFinder;
	private address?: string;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer();
		this.roomFinder = new RoomFinder();
		this.registerSubscribers();
	}

	initialize(): void {
		this.server.listen(7711, () => {
			this.logger.info("Server listen in port 7711");
		});
		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
			const ygoClientSocket = socket as YGOClientSocket;
			ygoClientSocket.id = uuidv4();

			socket.on("data", (data) => {
				this.logger.debug(data.toString("hex"));
				const messageHandler = new MessageHandler(data, socket, this.logger);
				messageHandler.read();
			});

			socket.on("close", () => {
				if (!ygoClientSocket.id) {
					return;
				}
				this.logger.error(`Client: ${ygoClientSocket.id} left`);

				const room = this.roomFinder.run(ygoClientSocket.id);
				if (!room) {
					return;
				}

				const player = room.clients.find((client) => client.socket.id === ygoClientSocket.id);

				if (!player) {
					const spectator = room.spectators.find(
						(client) => client.socket.id === ygoClientSocket.id
					);

					if (!spectator) {
						return;
					}

					room.removeSpectator(spectator);

					const watchMessage = WatchChangeClientMessage.create({ count: room.spectators.length });

					room.clients.forEach((_client) => {
						_client.socket.write(watchMessage);
					});

					room.spectators.forEach((_client) => {
						_client.socket.write(watchMessage);
					});

					return;
				}

				if (player.host && room.duelState === DuelState.WAITING) {
					RoomList.deleteRoom(room);

					return;
				}

				if (room.duelState === DuelState.WAITING) {
					room.removePlayer(player);
					const status = (player.position << 4) | 0xb;
					const message = PlayerChangeClientMessage.create({ status });
					room.clients.forEach((client) => {
						client.socket.write(message);
					});

					return;
				}

				// this.reconnecting.push(ygoClientSocket);
				if (this.address) {
					this.logger.error(`Saving player for reconnection: ${this.address}`);
					ReconnectingPlayers.add({
						address: this.address,
						socketId: ygoClientSocket.id,
						position: player.position,
					});
				}
			});

			socket.on("error", (error) => {
				this.logger.error(error);
			});
		});
	}

	private registerSubscribers(): void {
		const eventBus = container.get(EventBus);
		eventBus.subscribe(JoinToGameAsSpectator.ListenTo, new JoinToGameAsSpectator());
		eventBus.subscribe(JoinToRoomAsSpectator.ListenTo, new JoinToRoomAsSpectator());
	}
}
