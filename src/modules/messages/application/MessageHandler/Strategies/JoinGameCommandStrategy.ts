import { JoinToGame } from "../../../../room/application/JoinToGame";
import { ReconnectToGame } from "../../../../room/application/ReconnectToGame";
import { RoomFinder } from "../../../../room/application/RoomFinder";
import { DuelState, Room } from "../../../../room/domain/Room";
import RoomList from "../../../../room/infrastructure/RoomList";
import { UserFinder } from "../../../../user/application/UserFinder";
import { User } from "../../../../user/domain/User";
import { JoinGameMessage } from "../../../client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "../../../server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "../../../server-to-client/ServerErrorMessageClientMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class JoinGameCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(
		private readonly context: MessageHandlerContext,
		private readonly userFinder: UserFinder
	) {}

	execute(): void {
		const body = this.context.readBody(this.context.messageLength());
		const joinGameMessage = new JoinGameMessage(body);
		const room = RoomList.getRooms().find((room) => room.id === joinGameMessage.id);

		if (!room) {
			this.context.socket.write(
				ServerErrorClientMessage.create("Sala no encontrada. Intenta recargando la lista")
			);

			this.context.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

			this.context.socket.destroy();

			return;
		}
		if (room.password !== joinGameMessage.password) {
			this.context.socket.write(ServerErrorClientMessage.create("Clave incorrecta"));
			this.context.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));
			this.context.socket.destroy();
		}

		const playerInfoMessage = this.context.getPreviousMessages() as PlayerInfoMessage;

		if (room.ranked) {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.userFinder.run(playerInfoMessage).then((user) => {
				if (!(user instanceof User)) {
					this.context.socket.write(user as Buffer);
					this.context.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

					return;
				}

				this.join(room, joinGameMessage, playerInfoMessage);
			});

			return;
		}

		this.join(room, joinGameMessage, playerInfoMessage);

		return;
	}

	private join(room: Room, joinGameMessage: JoinGameMessage, playerInfo: PlayerInfoMessage): void {
		const joinToGame = new JoinToGame(this.context.socket);

		const playerEntering = room.clients.find((client) => {
			return (
				client.socket.remoteAddress === this.context.socket.remoteAddress &&
				playerInfo.name === client.name
			);
		});

		if (room.duelState === DuelState.WAITING && playerEntering) {
			this.context.socket.write(
				ServerErrorClientMessage.create(
					`Ya existe un jugador con el nombre :${playerEntering.name}`
				)
			);
			this.context.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));
			this.context.socket.destroy();

			return;
		}

		if (
			(room.duelState === DuelState.DUELING ||
				room.duelState === DuelState.RPS ||
				room.duelState === DuelState.CHOOSING_ORDER ||
				room.duelState === DuelState.SIDE_DECKING) &&
			playerEntering
		) {
			const reconnectToGame = new ReconnectToGame(this.context.socket, new RoomFinder());
			reconnectToGame.run(joinGameMessage, playerInfo.name, playerEntering);

			return;
		}

		joinToGame.run(joinGameMessage, playerInfo, room);
	}
}
