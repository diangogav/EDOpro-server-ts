import { Auth } from "../../../../room/application/join/Auth";
import { JoinToGameAsSpectator } from "../../../../room/application/join/JoinToGameAsSpectator";
import { JoinToLobbyAsPlayer } from "../../../../room/application/join/JoinToLobbyAsPlayer";
import { JoinToRoomAsSpectator } from "../../../../room/application/join/JoinToRoomAsSpectator";
import { ReconnectToGame } from "../../../../room/application/join/ReconnectToGame";
import { RoomFinder } from "../../../../room/application/RoomFinder";
import { DuelState } from "../../../../room/domain/Room";
import RoomList from "../../../../room/infrastructure/RoomList";
import { UserFinder } from "../../../../user/application/UserFinder";
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

	async execute(): Promise<void> {
		// const body = this.context.readBody(this.context.messageLength());
		const body = this.context.readBody();
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

			return;
		}

		const playerInfoMessage = new PlayerInfoMessage(
			this.context.getPreviousMessages(),
			body.length
		);

		const playerEntering = room.clients.find((client) => {
			return (
				client.socket.remoteAddress === this.context.socket.remoteAddress &&
				playerInfoMessage.name === client.name
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

		const handleJoin = new JoinToRoomAsSpectator(
			room,
			this.context.socket,
			playerInfoMessage,
			joinGameMessage
		);

		handleJoin
			.setNextHandler(
				new JoinToGameAsSpectator(room, this.context.socket, playerInfoMessage, joinGameMessage)
			)
			.setNextHandler(new Auth(room, this.userFinder, playerInfoMessage, this.context.socket))
			.setNextHandler(
				new ReconnectToGame(
					room,
					this.context.socket,
					playerInfoMessage,
					joinGameMessage,
					new RoomFinder()
				)
			)
			.setNextHandler(
				new JoinToLobbyAsPlayer(room, this.context.socket, playerInfoMessage, joinGameMessage)
			);

		const response = await handleJoin.tryToJoin();

		if (response instanceof Buffer) {
			this.context.socket.write(response);
		}
	}
}
