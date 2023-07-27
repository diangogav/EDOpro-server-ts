import { PlayerRoomState } from "../../../../room/domain/PlayerRoomState";
import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { ServerErrorClientMessage } from "../../../server-to-client/ServerErrorMessageClientMessage";
import { TypeChangeClientMessage } from "../../../server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../server-to-client/WatchChangeClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class Kick implements RoomMessageHandlerCommandStrategy {
	private readonly STATUS = 0x24;
	constructor(
		private readonly context: RoomMessageHandlerContext // private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const ishost = this.context.client.host;
		const positionkick = this.context.readBody().readInt8();
		const playerselect = this.context.clients[positionkick];

		if (ishost) {
			this.context.room.addSpectator(playerselect);
			this.context.room.removePlayer(playerselect);
			this.context.room.addKick(playerselect);

			this.context.room.clients.forEach((_client) => {
				const status = (playerselect.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			this.context.room.spectators.forEach((_client) => {
				const status = (playerselect.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			playerselect.spectatorPosition(this.context.room.nextSpectatorPosition());
			playerselect.notReady();
			const type = (Number(playerselect.host) << 4) | playerselect.position;
			playerselect.sendMessage(TypeChangeClientMessage.create({ type }));

			const spectatorsCount = this.context.room.spectators.length;
			const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

			this.context.room.clients.forEach((_client) => {
				_client.sendMessage(watchMessage);
				_client.sendMessage(
					ServerErrorClientMessage.create(
						`1El Jugador:${playerselect.name} ha sido Baneado de esta Sala, solo podra ingresar como espectador!!`
					)
				);
			});

			this.context.room.spectators.forEach((_client) => {
				_client.sendMessage(watchMessage);
				_client.sendMessage(
					ServerErrorClientMessage.create(
						`1El Jugador:${playerselect.name} ha sido Baneado de esta Sala, solo podra ingresar como espectador!!`
					)
				);
			});
		}
	}
}
