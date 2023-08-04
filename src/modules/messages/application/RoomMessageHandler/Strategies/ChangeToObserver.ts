import { PlayerRoomState } from "../../../../room/domain/PlayerRoomState";
import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { TypeChangeClientMessage } from "../../../server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../server-to-client/WatchChangeClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class ChangeToObserver implements RoomMessageHandlerCommandStrategy {
	private readonly STATUS = 0x09;
	constructor(
		private readonly context: RoomMessageHandlerContext // private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		if (this.context.client.isSpectator) {
			return;
		}

		const ishost = this.context.client.host;

		if (!ishost) {
			const place = this.context.room.nextSpectatorPosition();
			this.context.room.removePlayer(this.context.client);

			this.context.room.addSpectator(this.context.client);

			this.context.room.clients.forEach((_client) => {
				const status = (this.context.client.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			this.context.room.spectators.forEach((_client) => {
				const status = (this.context.client.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			this.context.client.spectatorPosition(place);
			this.context.client.notReady();

			const type = (Number(this.context.client.host) << 4) | this.context.client.position;
			this.context.client.sendMessage(TypeChangeClientMessage.create({ type }));

			const spectatorsCount = this.context.room.spectators.length;
			const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

			this.context.room.clients.forEach((_client) => {
				_client.sendMessage(watchMessage);
			});

			this.context.room.spectators.forEach((_client) => {
				_client.sendMessage(watchMessage);
			});
		}
	}
}
