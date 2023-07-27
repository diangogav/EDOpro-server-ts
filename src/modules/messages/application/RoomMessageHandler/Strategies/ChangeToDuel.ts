import { PlayerRoomState } from "../../../../room/domain/PlayerRoomState";
import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../server-to-client/WatchChangeClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class ChangeToDuel implements RoomMessageHandlerCommandStrategy {
	private readonly STATUS = 0x09;
	constructor(
		private readonly context: RoomMessageHandlerContext // private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const place = this.context.room.calculaPlace();
		const ips = this.context.client.socket.remoteAddress;

		if (place === null) {
			return;
		}

		if (this.context.client.isSpectator) {
			this.context.room.removeSpectator(this.context.client);
			this.context.room.clients.push(this.context.client);
			this.sendPlayerEnterMessage(place);
			this.sendPlayerChangeMessage();
			this.sendWatchMessage();

			this.context.client.playerPosition(place.position, place.team);
			this.context.client.notReady();
			const type = (Number(this.context.client.host) << 4) | this.context.client.position;
			this.context.client.sendMessage(TypeChangeClientMessage.create({ type }));

			return;
		}

		if (!this.context.room.kick.find((kick) => kick.socket.remoteAddress === ips)) {
			const nextPlace = this.context.room.nextAvailablePosition(this.context.client.position);
			if (!nextPlace) {
				return;
			}
			this.context.client.notReady();
			this.sendPlayerCellChange(nextPlace);
			this.sendPlayerChangeMessage();
			this.context.client.playerPosition(nextPlace.position, nextPlace.team);
			const type = (Number(this.context.client.host) << 4) | this.context.client.position;
			this.context.client.sendMessage(TypeChangeClientMessage.create({ type }));
		}
	}

	private sendPlayerEnterMessage(place: { position: number; team: number }): void {
		this.context.room.clients.forEach((_client) => {
			_client.sendMessage(
				PlayerEnterClientMessage.create(this.context.client.name, place.position)
			);
		});

		this.context.room.spectators.forEach((_client) => {
			_client.sendMessage(
				PlayerEnterClientMessage.create(this.context.client.name, place.position)
			);
		});
	}

	private sendPlayerCellChange(place: { position: number; team: number }): void {
		this.context.room.clients.forEach((_client) => {
			const status = (this.context.client.position << 4) | place.position;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});

		this.context.room.spectators.forEach((_client) => {
			const status = (this.context.client.position << 4) | place.position;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});
	}

	private sendPlayerChangeMessage(): void {
		this.context.room.clients.forEach((_client) => {
			const status = (this.context.client.position << 4) | PlayerRoomState.NOT_READY;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});

		this.context.room.spectators.forEach((_client) => {
			const status = (this.context.client.position << 4) | PlayerRoomState.NOT_READY;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});
	}

	private sendWatchMessage(): void {
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
